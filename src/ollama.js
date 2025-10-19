import chalk from 'chalk';

const defaultHost = process.env.OLLAMA_HOST || 'http://localhost:11434';

export async function chat({ model, messages, host = defaultHost, stream = true, format, options = {}, onToken }) {
  const body = {
    model,
    messages,
    stream,
    format,
    options,
  };

  const res = await fetch(`${host}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Ollama chat error ${res.status}: ${text}`);
  }

  if (!stream) {
    const data = await res.json();
    const content = data?.message?.content ?? '';
    return { content };
  }

  let full = '';
  const decoder = new TextDecoder('utf-8');
  const reader = res.body.getReader();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    // keep last partial line in buffer
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const evt = JSON.parse(line);
        const token = evt?.message?.content ?? '';
        if (token) {
          full += token;
          onToken?.(token);
        }
      } catch (e) {
        // ignore non-JSON line
      }
    }
  }
  return { content: full };
}

export async function ensureOllamaUp(host = defaultHost) {
  try {
    const res = await fetch(`${host}/api/tags`);
    if (!res.ok) return false;
    return true;
  } catch (e) {
    console.error(chalk.red('Не удалось подключиться к Ollama. Убедитесь, что запущен ollama serve.'));
    return false;
  }
}