import { chat as openrouterChat } from './openrouter.js';
import { asArray } from './codegen.js';
import { listAvailableTemplates } from './templates.js';

export async function refinePrompt(originalTask, options = {}) {
  const available = await listAvailableTemplates();
  const catalog = available.map(t => `- ${t.name}: ${t.description || ''}`.trim()).join('\n');

  const system = `Ты — инженер промтов, который нормализует входное задание в краткое техническое задание.
Твоя задача: уточнить цель, перечислить файлы, тесты, требования и ограничения.
Если задача соответствует одному или нескольким доступным шаблонам, выбери их.

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
Никаких комментариев вне JSON.`;

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
  const models = (poolEnv.length ? poolEnv : [primary]).concat(fallback).concat(extras);

  let content = '';
  const apiKey = options.apiKey || process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_EMBEDDED_KEY || '';

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
      // пробуем следующую модель
      continue;
    }
  }

  let spec;
  try {
    spec = JSON.parse(content);
  } catch (e) {
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
    };
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