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
import { listModels } from '../src/openrouter.js';
import { loadMemoryBank, matchTemplatesByText, getTemplateByName } from '../src/memorybank.js';

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

async function tryGenerateWithRecovery(specObj, { apiKey, spinner }) {
  const run = async (opts = {}) => generateCode(specObj, {
    apiKey,
    ...opts,
    onFileStart: (p) => stageUpdate(spinner, `Генерация: ${p}`)
  });

  try {
    return await run();
  } catch (err) {
    const msg = String(err?.message || err);
    console.log('\n[agent] Ошибка кодогенерации:', msg);
    const is429 = /\b429\b/i.test(msg) || /rate limit/i.test(msg) || /free-models-per-day/i.test(msg);
    const is404 = /\b404\b/i.test(msg) || /No endpoints found/i.test(msg);

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Проблемы с OpenRouter. Выберите действие:',
        choices: [
          { name: 'Ввести другой OpenRouter API Key и повторить', value: 'key' },
          { name: 'Повторить с текущим ключом (через несколько секунд)', value: 'retry' },
          { name: 'Выбрать доступные модели и повторить', value: 'models' },
          { name: 'Прервать', value: 'abort' },
        ],
        default: is429 ? 'key' : (is404 ? 'models' : 'retry'),
      }
    ]);

    if (action === 'abort') throw err;

    if (action === 'key') {
      const kk = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Новый OpenRouter API Key (скрыто):',
          mask: '*',
          filter: (s) => String(s || '').trim(),
        }
      ]);
      apiKey = kk.apiKey || apiKey;
      stageUpdate(spinner, 'Ключ обновлён, повторяем генерацию…');
      return await run();
    }

    if (action === 'retry') {
      const ms = Number(process.env.OPENROUTER_RETRY_MS || 3000);
      stageUpdate(spinner, `Повтор через ${Math.round(ms / 1000)} с…`);
      await new Promise(r => setTimeout(r, ms));
      return await run();
    }

    if (action === 'models') {
      stageUpdate(spinner, 'Запрашиваем доступные модели…');
      let ids = [];
      try {
        const { ids: list } = await listModels({ apiKey });
        ids = list;
      } catch (e) {
        console.log('[agent] Не удалось получить список моделей:', String(e?.message || e));
      }
      const suggested = ids.filter(x => /coder|code|gpt|llama|claude|gemini/i.test(String(x))).slice(0, 12);
      const choices = (suggested.length ? suggested : ids.slice(0, 24)).map(id => ({ name: id, value: id }));
      const res = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'models',
          message: 'Выберите модели для попытки кодогенерации:',
          choices,
          pageSize: 24,
          validate: (arr) => arr.length ? true : 'Выберите хотя бы одну модель',
        }
      ]);
      const selected = res.models?.length ? res.models : suggested;
      stageUpdate(spinner, 'Повторяем генерацию с выбранными моделями…');
      return await run({ modelsCodegen: selected });
    }

    return await run();
  }
}

async function tryRefineWithRecovery(originalTask, { apiKey, spinner }) {
  const run = async (opts = {}) => refinePrompt(originalTask, {
    apiKey,
    ...opts,
  });

  try {
    const spec = await run();
    if (spec && spec.__fallback) {
      console.log('\n[agent] Рефайн вернул минимальное ТЗ (невалидный JSON).');
      const { action } = await inquirer.prompt([
        {
          type: 'list',
          name: 'action',
          message: 'Исправить рефайн: выберите действие',
          choices: [
            { name: 'Ввести другой OpenRouter API Key и повторить', value: 'key' },
            { name: 'Повторить с текущим ключом (через несколько секунд)', value: 'retry' },
            { name: 'Выбрать доступные модели и повторить', value: 'models' },
            { name: 'Продолжить с минимальным ТЗ', value: 'continue' },
          ],
          default: 'retry',
        }
      ]);

      if (action === 'continue') return spec;

      if (action === 'key') {
        const kk = await inquirer.prompt([
          {
            type: 'password',
            name: 'apiKey',
            message: 'Новый OpenRouter API Key (скрыто):',
            mask: '*',
            filter: (s) => String(s || '').trim(),
          }
        ]);
        apiKey = kk.apiKey || apiKey;
        stageUpdate(spinner, 'Ключ обновлён, повторяем рефайн…');
        return await run();
      }

      if (action === 'retry') {
        const ms = Number(process.env.OPENROUTER_RETRY_MS || 3000);
        stageUpdate(spinner, `Повтор рефайна через ${Math.round(ms / 1000)} с…`);
        await new Promise(r => setTimeout(r, ms));
        return await run();
      }

      if (action === 'models') {
        stageUpdate(spinner, 'Запрашиваем доступные модели…');
        let ids = [];
        try {
          const { ids: list } = await listModels({ apiKey });
          ids = list;
        } catch (e) {
          console.log('[agent] Не удалось получить список моделей:', String(e?.message || e));
        }
        const suggested = ids.filter(x => /json|gpt|claude|mistral|qwen|instruct|chat/i.test(String(x))).slice(0, 12);
        const choices = (suggested.length ? suggested : ids.slice(0, 24)).map(id => ({ name: id, value: id }));
        const res = await inquirer.prompt([
          {
            type: 'checkbox',
            name: 'models',
            message: 'Выберите модели для рефайна (строгий JSON):',
            choices,
            pageSize: 24,
            validate: (arr) => arr.length ? true : 'Выберите хотя бы одну модель',
          }
        ]);
        const selected = res.models?.length ? res.models : suggested;
        stageUpdate(spinner, 'Повторяем рефайн с выбранными моделями…');
        return await run({ modelsRefine: selected });
      }
    }
    return spec;
  } catch (err) {
    const msg = String(err?.message || err);
    console.log('\n[agent] Ошибка рефайна:', msg);
    const is429 = /\b429\b/i.test(msg) || /rate limit/i.test(msg) || /free-models-per-day/i.test(msg);
    const is404 = /\b404\b/i.test(msg) || /No endpoints found/i.test(msg);

    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Проблемы с OpenRouter при рефайне. Выберите действие:',
        choices: [
          { name: 'Ввести другой OpenRouter API Key и повторить', value: 'key' },
          { name: 'Повторить с текущим ключом (через несколько секунд)', value: 'retry' },
          { name: 'Выбрать доступные модели и повторить', value: 'models' },
          { name: 'Прервать', value: 'abort' },
        ],
        default: is429 ? 'key' : (is404 ? 'models' : 'retry'),
      }
    ]);

    if (action === 'abort') throw err;

    if (action === 'key') {
      const kk = await inquirer.prompt([
        {
          type: 'password',
          name: 'apiKey',
          message: 'Новый OpenRouter API Key (скрыто):',
          mask: '*',
          filter: (s) => String(s || '').trim(),
        }
      ]);
      apiKey = kk.apiKey || apiKey;
      stageUpdate(spinner, 'Ключ обновлён, повторяем рефайн…');
      return await run();
    }

    if (action === 'retry') {
      const ms = Number(process.env.OPENROUTER_RETRY_MS || 3000);
      stageUpdate(spinner, `Повтор рефайна через ${Math.round(ms / 1000)} с…`);
      await new Promise(r => setTimeout(r, ms));
      return await run();
    }

    if (action === 'models') {
      stageUpdate(spinner, 'Запрашиваем доступные модели…');
      let ids = [];
      try {
        const { ids: list } = await listModels({ apiKey });
        ids = list;
      } catch (e) {
        console.log('[agent] Не удалось получить список моделей:', String(e?.message || e));
      }
      const suggested = ids.filter(x => /json|gpt|claude|mistral|qwen|instruct|chat/i.test(String(x))).slice(0, 12);
      const choices = (suggested.length ? suggested : ids.slice(0, 24)).map(id => ({ name: id, value: id }));
      const res = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'models',
          message: 'Выберите модели для рефайна (строгий JSON):',
          choices,
          pageSize: 24,
          validate: (arr) => arr.length ? true : 'Выберите хотя бы одну модель',
        }
      ]);
      const selected = res.models?.length ? res.models : suggested;
      stageUpdate(spinner, 'Повторяем рефайн с выбранными моделями…');
      return await run({ modelsRefine: selected });
    }

    return await run();
  }
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
  const spec = await tryRefineWithRecovery(originalTask, { apiKey, spinner });

  // 2) Вычисляем итоговый список шаблонов: приоритет — выбор режима
  const modelTemplates = Array.isArray(spec.templates) ? spec.templates : [];
  const effectiveTemplates = (mode === 'manual')
    ? explicitTemplates
    : (mode === 'none')
      ? []
      : (modelTemplates.length ? modelTemplates : explicitTemplates);
  
  // Эвристика: авто-выбор web_landing_plain при запросе лендинга
  const looksLikeLanding = (t) => {
  const s = String(t || '').toLowerCase();
  return /лендинг|landing|landing page|landing-page|homepage|промо|презентационный сайт|главная страница/i.test(s);
  };
  const wantLanding = looksLikeLanding(originalTask) || looksLikeLanding(spec?.title) || looksLikeLanding(spec?.overview);
  if (mode === 'auto' && wantLanding && !effectiveTemplates.includes('web_landing_plain')) {
  effectiveTemplates.push('web_landing_plain');
  console.log('[templates] эвристика: выбран web_landing_plain для лендинга');
  }

  // Подбор по MemoryBank: добавить кандидатов по тегам
  if (mode === 'auto') {
    const memory = await loadMemoryBank();
    const text = `${originalTask}\n${spec?.title || ''}\n${spec?.overview || ''}`;
    const candidates = matchTemplatesByText(text, memory);
    for (const c of candidates) {
      const name = c.name;
      if (!effectiveTemplates.includes(name)) {
        effectiveTemplates.push(name);
        console.log(`[templates] MemoryBank: добавлен шаблон по тегам — ${name}`);
      }
    }
  }

  // 3) Загружаем и применяем шаблоны; логируем отсутствие
  stageUpdate(spinner, 'Подбираем и применяем шаблоны…');
  const loaded = await loadTemplates(effectiveTemplates);
  const loadedNames = new Set(loaded.map(t => t.name));
  let missing = effectiveTemplates.filter(n => !loadedNames.has(n));

  // Фолбэк: если YAML-шаблон отсутствует, пытаемся взять данные из MemoryBank
  if (missing.length) {
    const memory = await loadMemoryBank();
    const looksLikePath = (s) => /[\\\/.]/.test(String(s || ''));
    for (const miss of [...missing]) {
      const memT = getTemplateByName(memory, miss);
      if (memT) {
        const data = {
          description: memT.description || '',
          rules: Array.isArray(memT.rules) ? memT.rules : [],
          style: Array.isArray(memT.style) ? memT.style : [],
          stack: Array.isArray(memT.stack) ? memT.stack : [],
          // structure из MemoryBank может быть секциями; добавляем только похожие на пути
          structure: (Array.isArray(memT.structure) ? memT.structure.filter(looksLikePath) : []),
        };
        loaded.push({ name: miss, filePath: 'MemoryBank', data });
        loadedNames.add(miss);
        console.log(`[templates] фолбэк: применены данные из MemoryBank для отсутствующего шаблона "${miss}"`);
      }
    }
    // Обновляем список отсутствующих после фолбэка
    missing = effectiveTemplates.filter(n => !loadedNames.has(n));
  }

  // Логируем оставшиеся отсутствующие
  for (const miss of missing) {
    await logMissingTemplate(miss, spec, originalTask);
    console.log(`[templates] отсутствует шаблон "${miss}" — записан в requests.jsonl`);
  }

  if (loaded.length) {
    const specWithTemplates = applyTemplatesToSpec(spec, loaded);
    console.log(`[templates] применены: ${loaded.map(t => t.name).join(', ')}`);
    stageUpdate(spinner, 'Генерация кода…');
    const rawOutput = await tryGenerateWithRecovery(specWithTemplates, { apiKey, spinner });
    const projPath = await saveProjectArtifacts(originalTask, specWithTemplates, rawOutput);
    spinner.succeed('[ок] проект сгенерирован и сохранён: ' + projPath);
  } else {
    // Без шаблонов продолжаем; рекомендацию логируем только в авто-режиме
    if (mode === 'auto' && spec.template_suggestion && !explicitTemplates.length) {
      await logMissingTemplate(spec.template_suggestion, spec, originalTask);
      console.log(`[templates] рекомендован новый шаблон "${spec.template_suggestion}" — записан в requests.jsonl`);
    }
    stageUpdate(spinner, 'Генерация кода…');
    const rawOutput = await tryGenerateWithRecovery(spec, { apiKey, spinner });
    const projPath = await saveProjectArtifacts(originalTask, spec, rawOutput);
    spinner.succeed('[ок] проект сгенерирован без шаблонов и сохранён: ' + projPath);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});