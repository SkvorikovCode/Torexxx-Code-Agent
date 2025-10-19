#!/usr/bin/env node
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import inquirer from 'inquirer';
import { refinePrompt } from '../src/refine.js';
import { generateCode } from '../src/codegen.js';
import { saveProjectArtifacts } from '../src/save.js';
import { loadTemplates, applyTemplatesToSpec, logMissingTemplate, listAvailableTemplates } from '../src/templates.js';
import { renderHeader, stageUpdate } from '../src/ui.js';
import { createLoader } from '../src/loader.js';

dotenv.config();

function parseList(val) {
  if (!val) return [];
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

async function runWizard() {
  renderHeader();
  const avail = await listAvailableTemplates();
  const choices = avail.map(t => ({ name: `${t.name}${t.description ? ' — ' + t.description : ''}`, value: t.name }));

  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: 'Выбор шаблонов:',
      choices: [
        { name: 'Авто-выбор по описанию задачи', value: 'auto' },
        { name: 'Выбрать вручную', value: 'manual' },
        { name: 'Без шаблонов', value: 'none' },
      ],
      default: 'auto',
    }
  ]);

  const { task } = await inquirer.prompt([
    {
      type: 'input',
      name: 'task',
      message: 'Опишите вашу задачу (кратко):',
      default: 'Новый проект',
    }
  ]);

  let explicitTemplates = [];
  if (mode === 'manual' && choices.length) {
    const sel = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'templates',
        message: 'Выберите шаблоны (пробел — выбрать, Enter — продолжить):',
        choices,
      },
      {
        type: 'input',
        name: 'extra',
        message: 'Доп. шаблоны (имена/пути через запятую, опционально):',
        default: '',
      }
    ]);
    explicitTemplates = [...sel.templates, ...parseList(sel.extra)];
  }

  let apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_EMBEDDED_KEY || '';
  if (!apiKey) {
    const k = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: 'Введите OpenRouter API Key (скрыто при вводе):',
        mask: '*',
        filter: (s) => String(s || '').trim(),
      }
    ]);
    apiKey = k.apiKey || '';
  }

  return { originalTask: task || 'Новый проект', mode, explicitTemplates, apiKey };
}

async function main() {
  const argv = yargs(hideBin(process.argv))
    .option('prompt', { type: 'string', describe: 'Задание на генерацию', demandOption: false })
    .option('templates', { type: 'string', describe: 'Явно применяемые шаблоны (через запятую)', default: '' })
    .option('out', { type: 'string', describe: 'Папка для сохранения проекта', default: 'Torexxx-Agent/output' })
    .help().argv;

  let originalTask = argv.prompt;
  let explicitTemplates = parseList(argv.templates || process.env.AGENT_TEMPLATES);
  let apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_EMBEDDED_KEY || '';
  let mode = 'cli';

  if (!originalTask) {
    const w = await runWizard();
    originalTask = w.originalTask;
    explicitTemplates = w.explicitTemplates;
    apiKey = w.apiKey;
    mode = w.mode;
  }

  // 1) Нормализация запроса (нейронка выбирает шаблоны)
  const spinner = createLoader('Нормализуем задачу…');
  stageUpdate(spinner, 'Нормализуем задачу…');
  const spec = await refinePrompt(originalTask, { apiKey });

  // 2) Вычисляем итоговый список шаблонов: приоритет — выбор режима
  const modelTemplates = Array.isArray(spec.templates) ? spec.templates : [];
  const effectiveTemplates = (mode === 'manual')
    ? explicitTemplates
    : (mode === 'none')
      ? []
      : (modelTemplates.length ? modelTemplates : explicitTemplates);

  // 3) Загружаем и применяем шаблоны; логируем отсутствие
  stageUpdate(spinner, 'Подбираем и применяем шаблоны…');
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
    stageUpdate(spinner, 'Генерация кода…');
    const rawOutput = await generateCode(specWithTemplates, { apiKey, onFileStart: (p) => stageUpdate(spinner, `Генерация: ${p}`) });
    const projPath = await saveProjectArtifacts(originalTask, specWithTemplates, rawOutput);
    spinner.succeed('[ok] проект сгенерирован и сохранён: ' + projPath);
  } else {
    // Без шаблонов продолжаем; рекомендацию логируем только в авто-режиме
    if (mode === 'auto' && spec.template_suggestion && !explicitTemplates.length) {
      await logMissingTemplate(spec.template_suggestion, spec, originalTask);
      console.log(`[templates] рекомендован новый шаблон "${spec.template_suggestion}" — записан в requests.jsonl`);
    }
    stageUpdate(spinner, 'Генерация кода…');
    const rawOutput = await generateCode(spec, { apiKey, onFileStart: (p) => stageUpdate(spinner, `Генерация: ${p}`) });
    const projPath = await saveProjectArtifacts(originalTask, spec, rawOutput);
    spinner.succeed('[ok] проект сгенерирован без шаблонов и сохранён: ' + projPath);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});