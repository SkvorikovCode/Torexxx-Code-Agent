const defaultBaseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';

// Unified chat interface compatible with src/ollama.js
export async function chat({ model, messages, apiKey = process.env.OPENROUTER_API_KEY, baseURL = defaultBaseURL, stream = true, format, options = {}, onToken }) {
  if (!apiKey) {
    throw new Error('Отсутствует OPENROUTER_API_KEY. Установите переменную окружения или передайте apiKey.');
  }

  const body = {
    model,
    messages,
    stream,
    // Map common options
    temperature: options?.temperature,
  };

  // Map json format hint to OpenAI-style response_format
  if (format === 'json') {
    body.response_format = { type: 'json_object' };
  }

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      // Optional headers recommended by OpenRouter
      'HTTP-Referer': process.env.OPENROUTER_REFERER || 'http://localhost',
      'X-Title': process.env.OPENROUTER_TITLE || 'Torexxx-Agent',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter chat error ${res.status}: ${text}`);
  }

  // Non-streaming path: parse JSON result
  if (!stream) {
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? '';
    return { content };
  }

  // Streaming (SSE) parsing
  let full = '';
  const decoder = new TextDecoder('utf-8');
  const reader = res.body.getReader();
  let buf = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // Split server-sent events by blank lines
    const events = buf.split('\n\n');
    // keep last partial event in buffer
    buf = events.pop();

    for (const evt of events) {
      const lines = evt.split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const dataStr = line.slice('data:'.length).trim();
        if (!dataStr) continue;
        if (dataStr === '[DONE]') {
          // End of stream
          buf = '';
          break;
        }
        try {
          const json = JSON.parse(dataStr);
          const token = json?.choices?.[0]?.delta?.content ?? json?.choices?.[0]?.text ?? '';
          if (token) {
            full += token;
            onToken?.(token);
          }
        } catch (e) {
          // ignore malformed JSON lines
        }
      }
    }
  }

  return { content: full };
}