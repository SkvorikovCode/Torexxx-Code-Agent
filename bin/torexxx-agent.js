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
import { 
  renderHeader, renderProgressBar, streamPrinter, 
  clearStreamPrinter, stageUpdate, renderSuccess, renderError, 
  renderInfo, renderMenu, renderTable, renderCelebration, 
  renderProjectStats, renderTips, renderHelp 
} from '../src/ui.js';
import { 
  createSpinner, 
  setSpinnerText, 
  succeedSpinner, 
  failSpinner,
  MultiStageSpinner,
  ProgressSpinner
} from '../src/loader.js';
import { listModels } from '../src/openrouter.js';
import { loadMemoryBank, matchTemplatesByText, getTemplateByName } from '../src/memorybank.js';

dotenv.config();

function parseList(val) {
  if (!val) return [];
  return String(val).split(',').map(s => s.trim()).filter(Boolean);
}

async function runWizard() {
  renderHeader(true); // Анимированный заголовок
  
  renderInfo(
    'Добро пожаловать в Torexxx Code Agent!', 
    'Этот инструмент поможет вам создать проект с использованием ИИ и готовых шаблонов.\nВыберите режим работы и опишите вашу задачу.',
    'tip'
  );
  
  const avail = await listAvailableTemplates();
  const choices = avail.map(t => ({ name: `${t.name}${t.description ? ' — ' + t.description : ''}`, value: t.name }));

  const { mode } = await inquirer.prompt([
    {
      type: 'list',
      name: 'mode',
      message: '🎯 Выберите режим работы:',
      choices: [
        { name: '🤖 Авто-выбор по описанию задачи (рекомендуется)', value: 'auto' },
        { name: '🎛️  Выбрать шаблоны вручную', value: 'manual' },
        { name: '🚀 Без шаблонов (чистая генерация)', value: 'none' },
      ],
      default: 'auto',
    }
  ]);

  const { task } = await inquirer.prompt([
    {
      type: 'input',
      name: 'task',
      message: '📝 Опишите вашу задачу подробно:',
      default: 'Новый проект',
      validate: (input) => {
        if (!input || input.trim().length < 5) {
          return 'Пожалуйста, опишите задачу более подробно (минимум 5 символов)';
        }
        return true;
      }
    }
  ]);

  let explicitTemplates = [];
  if (mode === 'manual' && choices.length) {
    renderMenu('Доступные шаблоны', choices.map(c => c.name));
    
    const sel = await inquirer.prompt([
      {
        type: 'checkbox',
        name: 'templates',
        message: '📋 Выберите шаблоны (пробел — выбрать, Enter — продолжить):',
        choices,
        validate: (answer) => {
          if (answer.length === 0) {
            return 'Выберите хотя бы один шаблон или используйте режим "Без шаблонов"';
          }
          return true;
        }
      },
      {
        type: 'input',
        name: 'extra',
        message: '➕ Дополнительные шаблоны (имена через запятую, опционально):',
        default: '',
      }
    ]);
    explicitTemplates = [...sel.templates, ...parseList(sel.extra)];
  }

  let apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_EMBEDDED_KEY || '';
  if (!apiKey) {
    renderInfo(
      'Требуется API ключ',
      'Для работы с ИИ необходим API ключ от OpenRouter.\nВы можете получить его на https://openrouter.ai/',
      'warning'
    );
    
    const k = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: '🔑 Введите OpenRouter API Key:',
        mask: '*',
        filter: (s) => String(s || '').trim(),
        validate: (input) => {
          if (!input || input.length < 10) {
            return 'API ключ должен содержать минимум 10 символов';
          }
          return true;
        }
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
    onFileStart: (p) => setSpinnerText(spinner, `Генерация файла: ${p}`, 'generate')
  });

  try {
    return await run();
  } catch (err) {
    const msg = String(err?.message || err);
    console.log('\n');
    
    const is429 = /\b429\b/i.test(msg) || /rate limit/i.test(msg) || /free-models-per-day/i.test(msg);
    const isAuth = /\b401\b/i.test(msg) || /unauthorized/i.test(msg) || /invalid.*key/i.test(msg);
    const isNetwork = /network/i.test(msg) || /timeout/i.test(msg) || /ENOTFOUND/i.test(msg);

    if (is429) {
      renderError(
        'Превышен лимит запросов к API',
        [
          'Подождите несколько минут перед повторной попыткой',
          'Проверьте ваш план подписки на OpenRouter',
          'Попробуйте использовать другую модель'
        ]
      );
    } else if (isAuth) {
      renderError(
        'Ошибка авторизации API',
        [
          'Проверьте правильность API ключа',
          'Убедитесь, что ключ активен на OpenRouter',
          'Проверьте баланс вашего аккаунта'
        ]
      );
    } else if (isNetwork) {
      renderError(
        'Проблемы с сетевым соединением',
        [
          'Проверьте подключение к интернету',
          'Попробуйте повторить запрос через несколько секунд',
          'Проверьте настройки прокси/VPN'
        ]
      );
    } else {
      renderError(
        'Ошибка генерации кода',
        [
          'Попробуйте упростить описание задачи',
          'Проверьте корректность выбранных шаблонов',
          'Обратитесь к документации API'
        ]
      );
    }

    // Попытка восстановления для некоторых ошибок
    if (is429) {
      const { retry } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'retry',
          message: '🔄 Попробовать снова через 30 секунд?',
          default: false,
        }
      ]);
      
      if (retry) {
        setSpinnerText(spinner, 'Ожидание перед повторной попыткой...', 'loading');
        await new Promise(resolve => setTimeout(resolve, 30000));
        setSpinnerText(spinner, 'Повторная попытка генерации...', 'generate');
        return await run();
      }
    }

    throw err;
  }
}

async function tryRefineWithRecovery(originalTask, { apiKey, spinner }) {
  const run = async (opts = {}) => refinePrompt(originalTask, {
    apiKey,
    ...opts,
    onToken: (token) => {
      // Можно добавить стрим-вывод здесь если нужно
    }
  });

  try {
    return await run();
  } catch (err) {
    const msg = String(err?.message || err);
    console.log('\n');
    
    const is429 = /\b429\b/i.test(msg) || /rate limit/i.test(msg) || /free-models-per-day/i.test(msg);
    const isAuth = /\b401\b/i.test(msg) || /unauthorized/i.test(msg) || /invalid.*key/i.test(msg);

    if (is429) {
      renderError(
        'Превышен лимит запросов при анализе задачи',
        [
          'Подождите несколько минут',
          'Проверьте лимиты вашего аккаунта OpenRouter'
        ]
      );
      
      const { useSimple } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'useSimple',
          message: '🔄 Продолжить с упрощенным анализом?',
          default: true,
        }
      ]);
      
      if (useSimple) {
        return {
          title: originalTask,
          overview: `Проект: ${originalTask}`,
          requirements: [originalTask],
          templates: [],
          template_suggestion: null
        };
      }
    } else if (isAuth) {
      renderError(
        'Ошибка авторизации при анализе задачи',
        [
          'Проверьте API ключ',
          'Убедитесь в наличии средств на балансе'
        ]
      );
    } else {
      renderError(
        'Ошибка анализа задачи',
        [
          'Попробуйте переформулировать задачу',
          'Проверьте подключение к интернету'
        ]
      );
    }

    throw err;
  }
}

// Функция для подсчета статистики проекта
function calculateProjectStats(outputPath, templates, startTime) {
  try {
    const fs = require('fs-extra');
    const path = require('path');
    
    let filesCreated = 0;
    let linesOfCode = 0;
    let totalSize = 0;
    
    function countFiles(dir) {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const fullPath = path.join(dir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          countFiles(fullPath);
        } else if (stat.isFile()) {
          filesCreated++;
          totalSize += stat.size;
          
          // Подсчет строк кода для текстовых файлов
          const ext = path.extname(item).toLowerCase();
          const codeExtensions = ['.js', '.jsx', '.ts', '.tsx', '.vue', '.py', '.go', '.html', '.css', '.scss', '.json', '.md'];
          
          if (codeExtensions.includes(ext)) {
            try {
              const content = fs.readFileSync(fullPath, 'utf8');
              linesOfCode += content.split('\n').length;
            } catch (e) {
              // Игнорируем ошибки чтения файлов
            }
          }
        }
      }
    }
    
    if (fs.existsSync(outputPath)) {
      countFiles(outputPath);
    }
    
    return {
      filesCreated,
      linesOfCode,
      templates: templates.map(t => t.name || t),
      duration: Date.now() - startTime,
      size: totalSize
    };
  } catch (error) {
    return {
      filesCreated: 0,
      linesOfCode: 0,
      templates: templates.map(t => t.name || t),
      duration: Date.now() - startTime,
      size: 0
    };
  }
}

async function main() {
  const startTime = Date.now();
  
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
  } else {
    renderHeader(); // Статичный заголовок для CLI режима
  }

  // Создаем многоэтапный спиннер
  const stages = [
    'Анализ и нормализация задачи',
    'Подбор подходящих шаблонов',
    'Применение шаблонов к спецификации',
    'Генерация кода проекта',
    'Сохранение файлов проекта'
  ];
  
  const multiSpinner = new MultiStageSpinner(stages);
  multiSpinner.start();

  try {
    // 1) Нормализация запроса (нейронка выбирает шаблоны)
    setSpinnerText(multiSpinner.spinner, 'Анализируем вашу задачу с помощью ИИ...', 'ai');
    const spec = await tryRefineWithRecovery(originalTask, { apiKey, spinner: multiSpinner.spinner });
    multiSpinner.nextStage();

    // 2) Вычисляем итоговый список шаблонов: приоритет — выбор режима
    setSpinnerText(multiSpinner.spinner, 'Подбираем оптимальные шаблоны...', 'search');
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
      console.log('\n🎯 Автоматически выбран шаблон web_landing_plain для лендинга');
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
          console.log(`\n🔍 MemoryBank: добавлен шаблон ${name} по совпадению тегов`);
        }
      }
    }

    multiSpinner.nextStage();

    // 3) Загружаем и применяем шаблоны; логируем отсутствие
    setSpinnerText(multiSpinner.spinner, 'Загружаем и применяем шаблоны...', 'template');
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
          console.log(`\n📋 Применены данные из MemoryBank для шаблона "${miss}"`);
        }
      }
      // Обновляем список отсутствующих после фолбэка
      missing = effectiveTemplates.filter(n => !loadedNames.has(n));
    }

    // Логируем оставшиеся отсутствующие
    for (const miss of missing) {
      await logMissingTemplate(miss, spec, originalTask);
      console.log(`\n⚠️  Шаблон "${miss}" не найден — запрос записан в requests.jsonl`);
    }

    multiSpinner.nextStage();

    if (loaded.length) {
      const specWithTemplates = applyTemplatesToSpec(spec, loaded);
      console.log(`\n✅ Применены шаблоны: ${loaded.map(t => t.name).join(', ')}`);
      
      setSpinnerText(multiSpinner.spinner, 'Генерируем код проекта...', 'generate');
      const rawOutput = await tryGenerateWithRecovery(specWithTemplates, { apiKey, spinner: multiSpinner.spinner });
      
      multiSpinner.nextStage();
      setSpinnerText(multiSpinner.spinner, 'Сохраняем файлы проекта...', 'save');
      const projPath = await saveProjectArtifacts(originalTask, specWithTemplates, rawOutput);
      
      multiSpinner.complete('Проект успешно создан!');
      
      // Подсчитываем статистику
      const stats = calculateProjectStats(projPath, loaded, startTime);
      
      // Показываем празднование
      renderCelebration(
        'Проект успешно создан!',
        [
          `Создано файлов: ${stats.filesCreated}`,
          `Строк кода: ${stats.linesOfCode.toLocaleString()}`,
          `Время генерации: ${Math.round(stats.duration / 1000)}с`,
          `Сохранено в: ${projPath}`
        ]
      );
      
      // Показываем детальную статистику
      renderProjectStats(stats);
      
      // Показываем полезные советы
      const tips = [
        'Проверьте README.md для инструкций по запуску',
        'Установите зависимости командой npm install или pip install -r requirements.txt',
        'Используйте git init для инициализации репозитория',
        'Настройте переменные окружения в .env файле если требуется'
      ];
      
      renderTips(tips.slice(0, 3));
    } else {
      // Без шаблонов продолжаем; рекомендацию логируем только в авто-режиме
      if (mode === 'auto' && spec.template_suggestion && !explicitTemplates.length) {
        await logMissingTemplate(spec.template_suggestion, spec, originalTask);
        console.log(`\n💡 Рекомендован новый шаблон "${spec.template_suggestion}" — записан в requests.jsonl`);
      }
      
      setSpinnerText(multiSpinner.spinner, 'Генерируем код без шаблонов...', 'generate');
      const rawOutput = await tryGenerateWithRecovery(spec, { apiKey, spinner: multiSpinner.spinner });
      
      multiSpinner.nextStage();
      setSpinnerText(multiSpinner.spinner, 'Сохраняем файлы проекта...', 'save');
      const projPath = await saveProjectArtifacts(originalTask, spec, rawOutput);
      
      multiSpinner.complete('Проект создан без шаблонов!');
      
      // Подсчитываем статистику
      const stats = calculateProjectStats(projPath, [], startTime);
      
      // Показываем празднование
      renderCelebration(
        'Проект создан без шаблонов!',
        [
          `Создано файлов: ${stats.filesCreated}`,
          `Строк кода: ${stats.linesOfCode.toLocaleString()}`,
          `Время генерации: ${Math.round(stats.duration / 1000)}с`,
          `Сохранено в: ${projPath}`
        ]
      );
      
      // Показываем детальную статистику
      renderProjectStats(stats);
      
      // Показываем полезные советы для проектов без шаблонов
      const tips = [
        'Проект создан с помощью чистой генерации ИИ',
        'Рекомендуем добавить README.md с описанием проекта',
        'Проверьте структуру проекта и добавьте недостающие файлы',
        'Рассмотрите возможность использования шаблонов в будущем'
      ];
      
      renderTips(tips.slice(0, 3));
    }
  } catch (err) {
    multiSpinner.fail('Ошибка при создании проекта');
    
    renderError(
      'Не удалось создать проект',
      [
        'Проверьте подключение к интернету',
        'Убедитесь в корректности API ключа',
        'Попробуйте упростить описание задачи',
        'Обратитесь к документации для получения помощи'
      ]
    );
    
    console.error('\n🔍 Детали ошибки:', err.message);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n💥 Критическая ошибка:', err);
  process.exit(1);
});