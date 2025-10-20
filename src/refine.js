import { chat as openrouterChat, listModels as openrouterListModels } from './openrouter.js';
import { asArray } from './codegen.js';
import { listAvailableTemplates } from './templates.js';
import { loadMemoryBank, getTopTags } from './memorybank.js';

export async function refinePrompt(originalTask, options = {}) {
  const available = await listAvailableTemplates();
  const memory = await loadMemoryBank();
  // Build union catalog: YAML templates + MemoryBank templates
  const memByName = new Map((memory.templates || []).map(t => [t.name, t]));
  const catalogEntries = new Map();
  // Prefer YAML description, but include tags from MemoryBank if present
  for (const t of available) {
    const memT = memByName.get(t.name);
    const tags = memT ? getTopTags(memT, 5) : [];
    catalogEntries.set(t.name, { description: t.description || '', tags });
  }
  // Add memory-only templates
  for (const t of memory.templates || []) {
    if (!catalogEntries.has(t.name)) {
      const tags = getTopTags(t, 5);
      catalogEntries.set(t.name, { description: t.description || '', tags });
    }
  }
  const catalog = Array.from(catalogEntries.entries()).map(([name, info]) => {
    const tagStr = (Array.isArray(info.tags) && info.tags.length) ? ` [tags: ${info.tags.join(', ')}]` : '';
    return `- ${name}: ${info.description}${tagStr}`.trim();
  }).join('\n');

  const system = `Ты — инженер промтов, который нормализует входное задание в краткое техническое задание.
Твоя задача: уточнить цель, перечислить файлы, тесты, требования и ограничения.
Если задача соответствует одному или нескольким доступным шаблонам, выбери их.
Всегда используй точные имена шаблонов из списка. Если задача — веб-лендинг, выбери \"web_landing_plain\".

Доступные шаблоны (имя: описание):\n${catalog || '- (нет шаблонов)'}\n
Выходной формат — строго JSON с полями:
- title (string)
- overview (string)
- requirements (string[])
- constraints (string[])
- files (string[])
- tests (string[])
- deliverables (string[])
- templates (string[]) // имена шаблонов из списка выше, если подходят, иначе []
- template_suggestion (string) // короткое имя, если подходящего шаблона нет
Никаких комментариев вне JSON.

Пример валидного ответа:
{
  \"title\": \"Лендинг приложения для привычек\",
  \"overview\": \"Минималистичный лендинг с CTA и секциями\",
  \"requirements\": [\"Адаптивность\", \"Чистый HTML/CSS/JS\"],
  \"constraints\": [\"Без фреймворков\"],
  \"files\": [\"index.html\", \"assets/css/styles.css\", \"assets/js/main.js\"],
  \"tests\": [],
  \"deliverables\": [\"README.md\"],
  \"templates\": [\"web_landing_plain\"],
  \"template_suggestion\": \"\"
}`;

  const user = `Задание:\n${originalTask}\n\nУточни и нормализуй, затем верни строго JSON по схеме выше.`;

  // Модель для рефайна: берём из ENV, иначе свободные дефолты
  const primary = process.env.OR_MODEL_REFINE || process.env.OR_MODEL_CODEGEN || 'mistralai/mistral-small:free';
  const poolEnv = (process.env.OR_MODELS_REFINE || '').split(',').map(s => s.trim()).filter(Boolean);
  const fallback = (process.env.OR_MODEL_REFINE_FALLBACK || '').split(',').map(s => s.trim()).filter(Boolean);
  const extras = [];
  const addExtra = (val) => { if (!val) return; const parts = String(val).split(',').map(s => s.trim()).filter(Boolean); for (const p of parts) { if (!extras.includes(p)) extras.push(p); } };
  addExtra(process.env.OPENROUTER_MODEL_FALLBACK);
  addExtra('qwen/qwen3-coder:free');
  addExtra('mistralai/mistral-small:free');
  let models = (poolEnv.length ? poolEnv : [primary]).concat(fallback).concat(extras);

  // Пользовательский оверрайд моделей (через options)
  const userOverride = Array.isArray(options.modelsRefine) && options.modelsRefine.length
    ? options.modelsRefine.map(s => String(s).trim()).filter(Boolean)
    : [];
  const userSingle = options.modelRefine ? String(options.modelRefine).trim() : '';
  if (userOverride.length) {
    models = userOverride.concat(extras);
  } else if (userSingle) {
    models = [userSingle].concat(extras);
  }

  // API ключ
  let apiKey = options.apiKey || process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_EMBEDDED_KEY || '';

  // Предзапрос доступных моделей и фильтрация пула
  try {
    const { ids } = await openrouterListModels({ apiKey });
    const idSet = new Set(ids);
    const normalize = (id) => {
      if (idSet.has(id)) return id;
      if (id.endsWith(':free')) {
        const base = id.replace(/:free$/, '');
        if (idSet.has(base)) return base;
      }
      return null;
    };
    const filtered = [];
    for (const m of models) {
      const ok = normalize(m);
      if (ok && !filtered.includes(ok)) filtered.push(ok);
    }
    if (!filtered.length) {
      const candidates = ids.filter(x => /coder|code|gpt|llama|claude|gemini|mistral|qwen/i.test(String(x)));
      models = candidates.slice(0, 5);
    } else {
      models = filtered;
    }
  } catch (e) {
    // Если /models недоступен, продолжаем со статическим пулом
  }

  let content = '';

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const retryDelay = Number(process.env.OPENROUTER_RETRY_MS || 2000);

  // Пытаемся последовательно получить JSON-ответ
  for (const m of models) {
    try {
      const { content: c } = await openrouterChat({
        model: m,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user }
        ],
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        apiKey,
      });
      content = c || '';
      if (content) break;
    } catch (e) {
      const msg = String(e?.message || e);
      if (/\b429\b/i.test(msg)) {
        await sleep(retryDelay);
      }
      // пробуем следующую модель
      continue;
    }
  }

  // Попытка ремонта JSON, если пришёл испорченный ответ
  const tryRepairJson = async (badText) => {
    // 1) вырезаем фигурные скобки, если есть
    if (badText) {
      const start = badText.indexOf('{');
      const end = badText.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const slice = badText.slice(start, end + 1);
        try {
          const parsed = JSON.parse(slice);
          return parsed;
        } catch {}
      }
    }
    // 2) просим модель строго восстановить JSON
    try {
      const { content: fixed } = await openrouterChat({
        model: models[0] || primary,
        messages: [
          { role: 'system', content: 'Ты — строгий валидатор JSON. Верни ТОЛЬКО валидный JSON-объект по схеме: title, overview, requirements[], constraints[], files[], tests[], deliverables[], templates[], template_suggestion. Никаких комментариев.' },
          { role: 'user', content: `Исправь до валидного JSON по схеме. Входной текст:\n\n${String(badText || '')}` }
        ],
        stream: false,
        format: 'json',
        options: { temperature: 0 },
        apiKey,
      });
      const parsed = JSON.parse(fixed || '{}');
      return parsed;
    } catch {}
    return null;
  };

  let spec;
  try {
    spec = JSON.parse(content);
    spec.__fallback = false;
  } catch (e) {
    const repaired = await tryRepairJson(content);
    if (repaired && typeof repaired === 'object') {
      spec = repaired;
      spec.__fallback = false;
    } else {
      // Fallback: минимальное ТЗ при ошибке парсинга/сетапа
      spec = {
        title: originalTask.slice(0, 80),
        overview: originalTask,
        requirements: [],
        constraints: [],
        files: [],
        tests: [],
        deliverables: [],
        templates: [],
        template_suggestion: '',
        __fallback: true,
      };
    }
  }

  // Нормализация списков
  spec.requirements = asArray(spec.requirements);
  spec.constraints = asArray(spec.constraints);
  spec.files = asArray(spec.files);
  spec.tests = asArray(spec.tests);
  spec.deliverables = asArray(spec.deliverables);
  spec.templates = asArray(spec.templates);
  if (typeof spec.template_suggestion !== 'string') spec.template_suggestion = '';

  return spec;
}