import { chat as openrouterChat } from './openrouter.js';

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
- код должен быть аккуратным и завершённым
`;

export async function generateCode(spec, { apiKey, modelCodegen, onToken, onFileStart } = {}) {
  const deliverables = Array.from(new Set([
    ...((spec?.deliverables || []).map(d => (typeof d === 'string' ? d : d.name)).filter(Boolean)),
    ...((spec?.files || []).map(f => (typeof f === 'string' ? f : f.name)).filter(Boolean)),
  ]));
  const filesList = deliverables.length ? deliverables.join(', ') : 'index.html, styles.css, script.js';

  const user = `ТЗ:\nTITLE: ${spec.title || ''}\nOVERVIEW: ${Array.isArray(spec.overview) ? spec.overview.join(' ') : (spec.overview || '')}\nREQUIREMENTS:\n- ${(spec.requirements || []).join('\n- ')}\nCONSTRAINTS:\n- ${(spec.constraints || []).join('\n- ')}\n\nСгенерируй ТОЛЬКО файлы: ${filesList}. Каждый файл строго в формате блоков:\n\n<<<FILE: relative/path>>>\n\`\`\`<lang or text>\n...содержимое файла...\n\`\`\`\n<<<END FILE>>>\n\nНачинай немедленно с первого файла из списка.`;

  const fallbackModelEnv = process.env.OR_MODEL_CODEGEN_FALLBACK || process.env.OPENROUTER_MODEL_FALLBACK || '';
  const retryMs = Number(process.env.OPENROUTER_RETRY_MS || 2000);

  const primaryModel = modelCodegen || (process.env.OR_MODEL_CODEGEN || 'qwen/qwen3-coder:free');

  async function runOnce(model) {
    let watchBuf = '';
    const seen = new Set();

    const { content } = await openrouterChat({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      stream: true,
      options: { temperature: 0.2 },
      apiKey,
      onToken: (t) => {
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
      },
    });

    return content;
  }

  try {
    return await runOnce(primaryModel);
  } catch (e) {
    const msg = String(e?.message || e);
    const isRateLimited = msg.includes('OpenRouter chat error 429') && /rate-limited upstream/i.test(msg);
    if (!isRateLimited) {
      throw e;
    }
    // Backoff retry on the same model
    if (retryMs > 0) {
      await new Promise(r => setTimeout(r, retryMs));
      try {
        return await runOnce(primaryModel);
      } catch (e2) {
        const msg2 = String(e2?.message || e2);
        const still429 = msg2.includes('OpenRouter chat error 429');
        if (!still429) throw e2;
        // Fallback model
        const fallback = fallbackModelEnv || 'meta-llama/llama-3.1-8b-instruct:free';
        if (fallback && fallback !== primaryModel) {
          return await runOnce(fallback);
        }
        throw e2;
      }
    }
    // If no retry configured, attempt direct fallback
    const fallback = fallbackModelEnv || 'meta-llama/llama-3.1-8b-instruct:free';
    if (fallback && fallback !== primaryModel) {
      return await runOnce(fallback);
    }
    throw e;
  }
}