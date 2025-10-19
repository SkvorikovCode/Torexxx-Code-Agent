import { chat as openrouterChat } from './openrouter.js';

export async function refinePrompt(originalTask, { apiKey, modelRefine, modelsRefine } = {}) {
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

  const primary = modelRefine || (process.env.OR_MODEL_REFINE || 'qwen/qwen3-coder:free');
  const listEnv = (process.env.OR_MODELS_REFINE || '').split(',').map(s => s.trim()).filter(Boolean);
  let models = Array.isArray(modelsRefine) && modelsRefine.length ? modelsRefine : (listEnv.length ? listEnv : [primary]);

  // Добавим конфигурируемые фолбэки в конец списка (уникальные)
  const extras = [];
  const addExtra = (val) => {
    if (!val) return; const parts = String(val).split(',').map(s => s.trim()).filter(Boolean);
    for (const p of parts) { if (!models.includes(p)) extras.push(p); }
  };
  addExtra(process.env.OR_MODEL_REFINE_FALLBACK);
  addExtra(process.env.OR_MODEL_CODEGEN_FALLBACK);
  addExtra(process.env.OPENROUTER_MODEL_FALLBACK);
  addExtra('mistralai/mistral-small:free');
  addExtra('qwen/qwen3-coder:free');
  models = models.concat(extras);

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

  // Последовательные попытки по пулу моделей
  for (const m of models) {
    try {
      const content = await runOnce(m);
      try {
        const spec = JSON.parse(content);
        return spec;
      } catch {
        // Невалидный JSON — пробуем следующую модель
        continue;
      }
    } catch (e) {
      // Любая ошибка провайдера — пробуем следующую
      continue;
    }
  }

  // Если все модели не сработали — минимальный бриф
  return { title: 'Технический бриф', overview: originalTask, requirements: [], constraints: [], files: [], tests: [], deliverables: [] };
}