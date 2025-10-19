import { chat as ollamaChat } from './ollama.js';
import { chat as openrouterChat } from './openrouter.js';

export async function refinePrompt(originalTask, { host, provider = 'ollama', apiKey, modelRefine } = {}) {
  const system = `Ты — инженер промтов для задач генерации кода.
Твоя цель: превратить свободный запрос пользователя в чёткое техническое ТЗ.
Выходной формат — строго JSON с полями:
- title: короткое название
- overview: 2-4 предложения контекста
- requirements: список требований в виде строк
- constraints: список ограничений/стека/версий
- files: список рекомендуемых файлов/путей
- tests: критерии приёмки/ручные шаги проверки
- deliverables: артефакты и ожидаемый результат
Никаких комментариев вне JSON.`;

  const useChat = provider === 'openrouter' ? openrouterChat : ollamaChat;
  const model = modelRefine || (provider === 'openrouter' ? (process.env.OR_MODEL_REFINE || 'qwen/qwen3-coder:free') : 'llama3.1:latest');

  const { content } = await useChat({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: originalTask }
    ],
    stream: false,
    format: 'json',
    options: { temperature: 0.2 },
    host, // используется только для Ollama
    apiKey, // используется только для OpenRouter
  });

  let spec;
  try {
    spec = JSON.parse(content);
  } catch (e) {
    // если модель вернула невалидный JSON, попробуем минимальный парсинг
    spec = { title: 'Технический бриф', overview: originalTask, requirements: [], constraints: [], files: [], tests: [], deliverables: [] };
  }
  return spec;
}