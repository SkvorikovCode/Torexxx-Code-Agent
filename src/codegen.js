import { chat as openrouterChat, listModels as openrouterListModels } from './openrouter.js';

export function asArray(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') return [v];
  if (typeof v === 'object') return [v];
  return [String(v)];
}

export async function generateCode(spec, { apiKey, modelCodegen, modelsCodegen, onToken, onFileStart } = {}) {
  const primary = modelCodegen || (process.env.OR_MODEL_CODEGEN || 'qwen/qwen3-coder:free');
  const listEnv = (process.env.OR_MODELS_CODEGEN || '').split(',').map(s => s.trim()).filter(Boolean);
  let models = Array.isArray(modelsCodegen) && modelsCodegen.length ? modelsCodegen : (listEnv.length ? listEnv : [primary]);

  const extras = [];
  const addExtra = (val) => { if (!val) return; const parts = String(val).split(',').map(s => s.trim()).filter(Boolean); for (const p of parts) { if (!models.includes(p)) extras.push(p); } };
  addExtra(process.env.OR_MODEL_CODEGEN_FALLBACK);
  addExtra(process.env.OR_MODEL_REFINE_FALLBACK);
  addExtra(process.env.OPENROUTER_MODEL_FALLBACK);
  addExtra('qwen/qwen3-coder:free');
  addExtra('mistralai/mistral-small:free');
  models = models.concat(extras);

  // Предзапрос доступных моделей и фильтрация пула
  try {
    const { ids } = await openrouterListModels({ apiKey });
    const idSet = new Set(ids);
    const normalize = (id) => {
      // если вариант с ":free" недоступен, пробуем без него; иначе оставляем как есть
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
    // если пул пуст — пробуем выбрать безопасные модели из списка по эвристике
    if (!filtered.length) {
      const candidates = ids.filter(x => /coder|code|gpt|llama|claude|gemini/i.test(String(x)));
      models = candidates.slice(0, 5);
    } else {
      models = filtered;
    }
  } catch (e) {
    // Если /models недоступен, продолжаем со статическим пулом
  }

  const system = `Вы — элитный кодер. Сгенерируйте минимально жизнеспособный проект по спецификации.
Формат вывода — ТОЛЬКО последовательность файлов в блоках:

<<<FILE: relative/path>>>
\`\`\`<lang or text>
...содержимое файла...
\`\`\`
<<<END FILE>>>

Требования:
- никаких префиксов/пояснений вне FILE-блоков
- каждый файл ОБЯЗАТЕЛЬНО внутри тройных бэктиков (\`\`\`)
- включите README.md с инструкциями
- при необходимости показывайте package.json / requirements.txt
- используйте короткие, самодостаточные примеры, которые запускаются сразу
- код должен быть аккуратным и завершённым`;

  // Нормализация списков, чтобы избежать ошибок .map/.join на не-массивах
  // (используем экспортируемую asArray)
  const deliverablesSrc = asArray(spec?.deliverables);
  const filesSrc = asArray(spec?.files);
  const deliverables = Array.from(new Set([
    ...(deliverablesSrc.map(d => (typeof d === 'string' ? d : d?.name)).filter(Boolean)),
    ...(filesSrc.map(f => (typeof f === 'string' ? f : f?.name)).filter(Boolean)),
  ]));

  const filesList = deliverables.length ? deliverables.join(', ') : 'index.html, styles.css, script.js';
  const reqs = asArray(spec?.requirements).map(r => String(r));
  const cons = asArray(spec?.constraints).map(r => String(r));

  const user = `ТЗ:\nTITLE: ${spec.title || ''}\nOVERVIEW: ${Array.isArray(spec.overview) ? spec.overview.join(' ') : (spec.overview || '')}\nREQUIREMENTS:\n- ${reqs.join('\n- ')}\nCONSTRAINTS:\n- ${cons.join('\n- ')}\n\nСгенерируй ТОЛЬКО файл-блоки для: ${filesList}. Каждый файл строго в формате блоков:\n\n<<<FILE: relative/path>>>\n\`\`\`<lang or text>\n...содержимое файла...\n\`\`\`\n<<<END FILE>>>\n\nНачинай немедленно с первого файла из списка.`;

  const errors = [];

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const retryDelay = Number(process.env.OPENROUTER_RETRY_MS || 2000);

  async function runOnce(m, useStream) {
    let watchBuf = '';
    const seen = new Set();
    const { content } = await openrouterChat({
      model: m,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      stream: useStream,
      format: 'text',
      options: { temperature: 0.2 },
      apiKey,
      onToken: useStream ? (t) => {
        onToken?.(t);
        watchBuf += t;
        while (true) {
          const idx = watchBuf.indexOf('<<<FILE:');
          if (idx === -1) {
            if (watchBuf.length > 256) watchBuf = watchBuf.slice(-256);
            break;
          }
          const after = idx + '<<<FILE:'.length;
          let end = watchBuf.indexOf('>>>', after);
          let headerTokenLen = 3;
          if (end === -1) {
            end = watchBuf.indexOf('>>', after);
            headerTokenLen = 2;
          }
          if (end === -1) {
            watchBuf = watchBuf.slice(idx);
            break;
          }
          const path = watchBuf.slice(after, end).trim();
          if (path && !seen.has(path)) {
            seen.add(path);
            onFileStart?.(path);
          }
          watchBuf = watchBuf.slice(end + headerTokenLen);
        }
      } : undefined,
    });
    return content;
  }

  for (const m of models) {
    try {
      // пробуем стриминговую генерацию
      const content = await runOnce(m, true);
      return content;
    } catch (e) {
      const msg = String(e?.message || e);
      errors.push({ model: m, error: msg });
      // если 429 — делаем небольшой бэкоф перед повтором
      if (/\b429\b/.test(msg)) {
        await sleep(retryDelay);
      }
      // fallback: та же модель, но без стрима
      try {
        const content = await runOnce(m, false);
        return content;
      } catch (e2) {
        const msg2 = String(e2?.message || e2);
        errors.push({ model: m, error: msg2 });
        if (/\b429\b/.test(msg2)) {
          await sleep(retryDelay);
        }
        // продолжаем к следующей модели
        continue;
      }
    }
  }

  const summary = errors.map((x, i) => `${i+1}) ${x.model}: ${x.error}`).join('\n');
  throw new Error('Все модели из пула не смогли выполнить кодогенерацию. Причины по попыткам:\n' + summary);
}