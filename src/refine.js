import { chat as openrouterChat } from './openrouter.js';

export async function refinePrompt(originalTask, { apiKey, modelRefine } = {}) {
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

  const model = modelRefine || (process.env.OR_MODEL_REFINE || 'qwen/qwen3-coder:free');

  let content;
  try {
    ({ content } = await openrouterChat({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: originalTask }
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.2 },
      apiKey,
    }));
  } catch (e) {
    const msg = String(e?.message || e);
    const isRegionForbidden = msg.includes('OpenRouter chat error 403') && (/not available in your region/i.test(msg) || /Access Forbidden/i.test(msg));
    if (isRegionForbidden) {
      const fallback = 'qwen/qwen3-coder:free';
      if (fallback !== model) {
        ({ content } = await openrouterChat({
          model: fallback,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: originalTask }
          ],
          stream: false,
          format: 'json',
          options: { temperature: 0.2 },
          apiKey,
        }));
      } else {
        throw e;
      }
    } else {
      throw e;
    }
  }

  let spec;
  try {
    spec = JSON.parse(content);
  } catch (e) {
    // если модель вернула невалидный JSON, попробуем минимальный парсинг
    spec = { title: 'Технический бриф', overview: originalTask, requirements: [], constraints: [], files: [], tests: [], deliverables: [] };
  }
  return spec;
}