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
  const retryMs = Number(process.env.OPENROUTER_RETRY_MS || 2000);
  const refineFallbackEnv = process.env.OR_MODEL_REFINE_FALLBACK || process.env.OR_MODEL_CODEGEN_FALLBACK || process.env.OPENROUTER_MODEL_FALLBACK || '';

  async function runOnce(m) {
    const { content } = await openrouterChat({
      model: m,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: originalTask }
      ],
      stream: false,
      format: 'json',
      options: { temperature: 0.2 },
      apiKey,
    });
    return content;
  }

  let content;
  try {
    content = await runOnce(model);
  } catch (e) {
    const msg = String(e?.message || e);
    const isRegionForbidden = msg.includes('OpenRouter chat error 403') && (/not available in your region/i.test(msg) || /Access Forbidden/i.test(msg));
    const isRateLimited = msg.includes('OpenRouter chat error 429') && /rate-limited upstream/i.test(msg);
    if (isRegionForbidden) {
      const fallback = 'qwen/qwen3-coder:free';
      if (fallback !== model) {
        content = await runOnce(fallback);
      } else {
        throw e;
      }
    } else if (isRateLimited) {
      if (retryMs > 0) {
        await new Promise(r => setTimeout(r, retryMs));
        try {
          content = await runOnce(model);
        } catch (e2) {
          const still429 = String(e2?.message || e2).includes('OpenRouter chat error 429');
          if (!still429) throw e2;
          const fallback = refineFallbackEnv || (model !== 'mistralai/mistral-small:free' ? 'mistralai/mistral-small:free' : 'qwen/qwen3-coder:free');
          if (fallback && fallback !== model) {
            content = await runOnce(fallback);
          } else {
            throw e2;
          }
        }
      } else {
        const fallback = refineFallbackEnv || (model !== 'mistralai/mistral-small:free' ? 'mistralai/mistral-small:free' : 'qwen/qwen3-coder:free');
        if (fallback && fallback !== model) {
          content = await runOnce(fallback);
        } else {
          throw e;
        }
      }
    } else {
      throw e;
    }
  }

  let spec;
  try {
    spec = JSON.parse(content);
  } catch (e) {
    spec = { title: 'Технический бриф', overview: originalTask, requirements: [], constraints: [], files: [], tests: [], deliverables: [] };
  }
  return spec;
}