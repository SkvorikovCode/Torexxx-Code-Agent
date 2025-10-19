#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { refinePrompt } from '../src/refine.js';
import { generateCode } from '../src/codegen.js';
import { saveProjectArtifacts } from '../src/save.js';
import { loadTemplates, applyTemplatesToSpec, logMissingTemplate } from '../src/templates.js';

function parseList(val) {
  if (!val) return [];
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('prompt', { type: 'string', describe: 'Задание на генерацию', demandOption: true })
    .option('templates', { type: 'string', describe: 'Явно применяемые шаблоны (через запятую)', default: '' })
    .option('out', { type: 'string', describe: 'Папка для сохранения проекта', default: 'Torexxx-Agent/output' })
    .help().argv;

  const originalTask = argv.prompt;
  const explicitTemplates = parseList(argv.templates || process.env.AGENT_TEMPLATES);

  // 1) Нормализация запроса (нейронка выбирает шаблоны)
  const spec = await refinePrompt(originalTask, {});

  // 2) Вычисляем итоговый список шаблонов: приоритет — выбор нейросети
  const modelTemplates = Array.isArray(spec.templates) ? spec.templates : [];
  const effectiveTemplates = modelTemplates.length ? modelTemplates : explicitTemplates;

  // 3) Загружаем и применяем шаблоны; логируем отсутствие
  const loaded = await loadTemplates(effectiveTemplates);
  const loadedNames = new Set(loaded.map(t => t.name));
  const missing = effectiveTemplates.filter(n => !loadedNames.has(n));

  for (const miss of missing) {
    await logMissingTemplate(miss, spec, originalTask);
    console.log(`[templates] отсутствует шаблон "${miss}" — записан в requests.jsonl`);
  }

  if (loaded.length) {
    const specWithTemplates = applyTemplatesToSpec(spec, loaded);
    console.log(`[templates] применены: ${loaded.map(t => t.name).join(', ')}`);
    // 4) Генерация кода
    const rawOutput = await generateCode(specWithTemplates, {});
    const projPath = await saveProjectArtifacts(originalTask, specWithTemplates, rawOutput);
    console.log('[ok] проект сгенерирован и сохранён: ' + projPath);
  } else {
    // Без шаблонов продолжаем, но фиксируем рекомендацию
    if (spec.template_suggestion && !explicitTemplates.length) {
      await logMissingTemplate(spec.template_suggestion, spec, originalTask);
      console.log(`[templates] рекомендован новый шаблон "${spec.template_suggestion}" — записан в requests.jsonl`);
    }
    const rawOutput = await generateCode(spec, {});
    const projPath = await saveProjectArtifacts(originalTask, spec, rawOutput);
    console.log('[ok] проект сгенерирован без шаблонов и сохранён: ' + projPath);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});