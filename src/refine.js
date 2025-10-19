import { chat } from './openrouter.js';
import { asArray } from './codegen.js';
import { listAvailableTemplates } from './templates.js';

export async function refinePrompt(originalTask, options = {}) {
  const available = await listAvailableTemplates();
  const catalog = available.map(t => `- ${t.name}: ${t.description || ''}`.trim()).join('\n');

  const system = `Ты — инженер промтов, который нормализует входное задание в краткое техническое задание.
Твоя задача: уточнить цель, перечислить файлы, тесты, требования и ограничения.
Если задача соответствует одному или нескольким доступным шаблонам, выбери их.

Доступные шаблоны (имя: описание):\n${catalog || '- (нет шаблонов)'}\n
Выходной формат — строго JSON с полями:
- title (string)
- overview (string)
- requirements (string[])
- constraints (string[])
- files (string[])
- tests (string[])
- deliverables (string[])
- templates (string[]) // имена шаблонов из списка выше, если подходят, иначе []
- template_suggestion (string) // короткое имя, если подходящего шаблона нет
Никаких комментариев вне JSON.`;

  const user = `Задание:\n${originalTask}\n\nУточни и нормализуй, затем верни строго JSON по схеме выше.`;

  const res = await chat([
    { role: 'system', content: system },
    { role: 'user', content: user },
  ], { format: 'json' }, options);

  let spec;
  try {
    spec = typeof res === 'string' ? JSON.parse(res) : res;
  } catch (e) {
    // Fallback: minimal brief
    spec = {
      title: originalTask.slice(0, 80),
      overview: originalTask,
      requirements: [],
      constraints: [],
      files: [],
      tests: [],
      deliverables: [],
      templates: [],
      template_suggestion: '',
    };
  }

  // Normalize lists to arrays
  spec.requirements = asArray(spec.requirements);
  spec.constraints = asArray(spec.constraints);
  spec.files = asArray(spec.files);
  spec.tests = asArray(spec.tests);
  spec.deliverables = asArray(spec.deliverables);
  spec.templates = asArray(spec.templates);
  if (typeof spec.template_suggestion !== 'string') spec.template_suggestion = '';

  return spec;
}