#!/usr/bin/env node
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import boxen from 'boxen';
import ora from 'ora';
import gradient from 'gradient-string';
import { renderHeader, stageUpdate } from '../src/ui.js';
import { refinePrompt } from '../src/refine.js';
import { generateCode } from '../src/codegen.js';
import { saveProjectArtifacts } from '../src/save.js';
import dotenv from 'dotenv';
import path from 'path';

// Load env from .env then .env.local (local overrides)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });

const program = new Command();
program
  .name('torexxx-agent')
  .description('LLM агент: чистка промта и генерация кода (OpenRouter)')
  .version('0.1.0');

program
  .command('new')
  .description('Создать новый проект из текстовой задачи')
  .option('-p, --prompt <text>', 'Задача на написание кода')
  .option('--openrouter-key <key>', 'OPENROUTER_API_KEY', process.env.OPENROUTER_API_KEY)
  .option('--model-refine <name>', 'Модель для нормализации промта')
  .option('--model-codegen <name>', 'Модель для генерации кода')
  .option('--editor', 'Открыть системный редактор для ввода многострочного ТЗ')
  .action(async (opts) => {
    renderHeader();

    let userTask = opts.prompt;
    if (!userTask) {
      const { task } = await inquirer.prompt({
        name: 'task',
        type: opts.editor ? 'editor' : 'input',
        message: opts.editor ? 'Опишите задачу на код (редактор откроется):' : 'Введите задачу на код (многострочный режим: --editor)',
        default: `Сделай небольшой веб-сервер на Node.js, который отдает страницу с кнопкой и считает клики.`
      });
      userTask = String(task || '').trim();
    }

    // Только OpenRouter
    const openrouterKey = opts.openrouterKey || process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_EMBEDDED_KEY;
    if (!openrouterKey) {
      console.error(chalk.red('Для OpenRouter требуется ключ: установите OPENROUTER_API_KEY или используйте OPENROUTER_EMBEDDED_KEY.'));
      process.exit(1);
    }

    console.log(chalk.gray('\n• Нормализую промт через Torexxx Mini'));
    const spinner1 = ora('Подготавливаю идеальный технический бриф…').start();
    let spec;
    try {
      spec = await refinePrompt(userTask, { apiKey: openrouterKey, modelRefine: opts.modelRefine });
      spinner1.succeed('Готово: получен структурированный бриф');
    } catch (err) {
      spinner1.fail('Ошибка при нормализации промта');
      console.error(chalk.red(String(err)));
      process.exit(1);
    }

    const specBox = boxen(chalk.bold(spec.title || 'Технический бриф') + '\n' + chalk.gray(spec.overview || '') + '\n\n' + chalk.white('Требования:') + '\n' + (spec.requirements || []).map((r, i) => `  ${i+1}. ${r}`).join('\n'), {
      padding: 1,
      margin: 1,
      borderColor: 'cyan',
      title: 'Torexxx-Mini',
      titleAlignment: 'center'
    });
    console.log(specBox);

    console.log(chalk.gray('\n• Генерирую код через Torexxx Mini Coder'));
    const spinner2 = ora('Запускаю генерацию проекта…').start();

    let rawOutput = '';
    try {
      rawOutput = await generateCode(spec, {
        apiKey: openrouterKey,
        onToken: () => {},
        onFileStart: (filePath) => stageUpdate(spinner2, `Генерирую: ${filePath}`),
        modelCodegen: opts.modelCodegen,
      });
      spinner2.succeed('Код сгенерирован');
    } catch (err) {
      spinner2.fail('Ошибка генерации кода');
      console.error(chalk.red(String(err)));
      process.exit(1);
    }

    console.log(chalk.gray('\n• Сохраняю проект…'));
    const spinner3 = ora('Пишу файлы и артефакты…').start();
    try {
      const projectPath = await saveProjectArtifacts(userTask, spec, rawOutput);
      spinner3.succeed('Проект сохранён');
      console.log(boxen(chalk.green(`Готово! Папка проекта:`) + '\n' + chalk.bold(projectPath), {
        padding: 1,
        margin: 1,
        borderColor: 'green',
        title: 'Torexxx-Agent',
        titleAlignment: 'center'
      }));
      console.log(chalk.gray('Дальше:') + '\n' + chalk.white(`  cd ${projectPath}`) + '\n' + chalk.white('  # изучите README.md и запустите пример'));
    } catch (err) {
      spinner3.fail('Ошибка сохранения проекта');
      console.error(chalk.red(String(err)));
      process.exit(1);
    }
  });

program.parseAsync().catch((e) => {
  console.error(chalk.red(String(e)));
  process.exit(1);
});