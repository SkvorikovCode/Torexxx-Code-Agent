import { chat } from './ollama.js';

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

export async function generateCode(spec, { host, onToken, onFileStart } = {}) {
  const deliverables = Array.from(new Set([
    ...((spec?.deliverables || []).map(d => (typeof d === 'string' ? d : d.name)).filter(Boolean)),
    ...((spec?.files || []).map(f => (typeof f === 'string' ? f : f.name)).filter(Boolean)),
  ]));
  const filesList = deliverables.length ? deliverables.join(', ') : 'index.html, styles.css, script.js';

  const user = `ТЗ:\nTITLE: ${spec.title || ''}\nOVERVIEW: ${Array.isArray(spec.overview) ? spec.overview.join(' ') : (spec.overview || '')}\nREQUIREMENTS:\n- ${(spec.requirements || []).join('\n- ')}\nCONSTRAINTS:\n- ${(spec.constraints || []).join('\n- ')}\n\nСгенерируй ТОЛЬКО файлы: ${filesList}. Каждый файл строго в формате блоков:\n\n<<<FILE: relative/path>>>\n\`\`\`<lang or text>\n...содержимое файла...\n\`\`\`\n<<<END FILE>>>\n\nНачинай немедленно с первого файла из списка.`;

  let watchBuf = '';
  const seen = new Set();

  const { content } = await chat({
    model: 'qwen2.5-coder:latest',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    stream: true,
    options: { temperature: 0.2 },
    host,
    onToken: (t) => {
      // Прокидываем наружу, если нужно (можно оставить пустым для тихого режима)
      onToken?.(t);
      // Отслеживаем появление новых файлов в стриме
      watchBuf += t;
      // Ищем маркер начала файла и имя
      while (true) {
        const idx = watchBuf.indexOf('<<<FILE:');
        if (idx === -1) {
          // держим последний хвост, чтобы маркер не затерялся на границе токенов
          if (watchBuf.length > 256) watchBuf = watchBuf.slice(-256);
          break;
        }
        const after = idx + '<<<FILE:'.length;
        const end = watchBuf.indexOf('>>>', after);
        if (end === -1) {
          // неполный заголовок файла, ждём следующие токены
          watchBuf = watchBuf.slice(idx);
          break;
        }
        const path = watchBuf.slice(after, end).trim();
        if (path && !seen.has(path)) {
          seen.add(path);
          onFileStart?.(path);
        }
        // очистим обработанный сегмент, чтобы не триггерить повторно
        watchBuf = watchBuf.slice(end + 3);
      }
    },
  });

  return content;
}