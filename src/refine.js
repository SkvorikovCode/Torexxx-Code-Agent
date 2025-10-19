import { chat } from './ollama.js';

export async function refinePrompt(originalTask, { host } = {}) {
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

  const { content } = await chat({
    model: 'llama3.1:latest',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: originalTask }
    ],
    stream: false,
    format: 'json',
    options: { temperature: 0.2 },
    host,
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