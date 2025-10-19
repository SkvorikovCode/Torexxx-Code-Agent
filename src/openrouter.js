const defaultBaseURL = process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
const EMBEDDED_OPENROUTER_KEY = process.env.OPENROUTER_EMBEDDED_KEY || '';

// Unified chat interface compatible with src/ollama.js
export async function chat({ model, messages, apiKey = (process.env.OPENROUTER_API_KEY || EMBEDDED_OPENROUTER_KEY), baseURL = defaultBaseURL, stream = true, format, options = {}, onToken }) {
  if (!apiKey) {
    throw new Error('Отсутствует OPENROUTER_API_KEY. Установите переменную окружения, зашьйте ключ (OPENROUTER_EMBEDDED_KEY) или передайте apiKey.');
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
  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const jsonStr = trimmed.replace(/^data:\s*/, '');
      if (jsonStr === '[DONE]') continue;
      try {
        const evt = JSON.parse(jsonStr);
        const token = evt?.choices?.[0]?.delta?.content ?? evt?.choices?.[0]?.text ?? '';
        if (token) {
          full += token;
          onToken?.(token);
        }
      } catch (e) {
        // ignore parse error
      }
    }
  }

  return { content: full };
}