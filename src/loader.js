import ora from 'ora';
import cliSpinners from 'cli-spinners';
import chalk from 'chalk';
import gradient from 'gradient-string';

// Кастомные спиннеры с эмодзи и цветами
const customSpinners = {
  torexxx: {
    interval: 120,
    frames: [
      '🚀 Запуск...',
      '⚡ Обработка...',
      '🔥 Генерация...',
      '✨ Финализация...',
      '🎯 Готово!'
    ]
  },
  rainbow: {
    interval: 100,
    frames: [
      '🔴 ●○○○○○○',
      '🟠 ○●○○○○○',
      '🟡 ○○●○○○○',
      '🟢 ○○○●○○○',
      '🔵 ○○○○●○○',
      '🟣 ○○○○○●○',
      '🟤 ○○○○○○●'
    ]
  },
  code: {
    interval: 150,
    frames: [
      '📝 Анализ кода...',
      '🔍 Поиск шаблонов...',
      '⚙️  Настройка...',
      '🛠️  Сборка...',
      '📦 Упаковка...',
      '✅ Завершено!'
    ]
  },
  ai: {
    interval: 200,
    frames: [
      '🤖 Думаю...',
      '🧠 Анализирую...',
      '💭 Генерирую идеи...',
      '⚡ Создаю код...',
      '🎨 Оформляю...',
      '🚀 Готово!'
    ]
  }
};

// Функция для определения ASCII предпочтений
function isAsciiPreferred() {
  return process.env.TERM === 'dumb' || 
         process.env.CI === 'true' || 
         process.platform === 'win32';
}

// Функция для выбора спиннера
function resolveSpinner(spinnerName = 'torexxx') {
  if (isAsciiPreferred()) {
    return cliSpinners.line;
  }
  
  return customSpinners[spinnerName] || customSpinners.torexxx;
}

// Создание улучшенного спиннера
export function createSpinner(text = 'Загрузка...', spinnerType = 'torexxx') {
  const spinner = resolveSpinner(spinnerType);
  
  return ora({
    text: chalk.cyan(text),
    spinner: spinner,
    color: 'cyan',
    hideCursor: true,
    indent: 2
  });
}

// Установка текста с форматированием
export function setSpinnerText(spinner, text, type = 'info') {
  if (!spinner) return;
  
  const icons = {
    info: '🔄',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    loading: '⏳',
    search: '🔍',
    generate: '⚡',
    save: '💾',
    template: '📋',
    ai: '🤖'
  };
  
  const colors = {
    info: chalk.cyan,
    success: chalk.green,
    warning: chalk.yellow,
    error: chalk.red,
    loading: chalk.blue,
    search: chalk.magenta,
    generate: chalk.yellow,
    save: chalk.green,
    template: chalk.blue,
    ai: chalk.magenta
  };
  
  const icon = icons[type] || icons.info;
  const color = colors[type] || colors.info;
  
  spinner.text = `${icon} ${color(text)}`;
}

// Успешное завершение с анимацией
export function succeedSpinner(spinner, text = 'Готово!') {
  if (!spinner) return;
  
  const successText = `✨ ${chalk.green.bold(text)}`;
  spinner.succeed(successText);
  
  // Добавляем небольшую анимацию успеха
  setTimeout(() => {
    console.log(chalk.green('  🎉 Операция выполнена успешно!'));
  }, 100);
}

// Завершение с ошибкой
export function failSpinner(spinner, text = 'Ошибка!', suggestions = []) {
  if (!spinner) return;
  
  const errorText = `💥 ${chalk.red.bold(text)}`;
  spinner.fail(errorText);
  
  if (suggestions.length > 0) {
    console.log(chalk.yellow('\n💡 Возможные решения:'));
    suggestions.forEach(suggestion => {
      console.log(chalk.gray(`  • ${suggestion}`));
    });
  }
}

// Предупреждение
export function warnSpinner(spinner, text = 'Предупреждение!') {
  if (!spinner) return;
  
  const warnText = `⚠️  ${chalk.yellow.bold(text)}`;
  spinner.warn(warnText);
}

// Информационное сообщение
export function infoSpinner(spinner, text = 'Информация') {
  if (!spinner) return;
  
  const infoText = `💡 ${chalk.blue.bold(text)}`;
  spinner.info(infoText);
}

// Многоэтапный спиннер
export class MultiStageSpinner {
  constructor(stages = []) {
    this.stages = stages;
    this.currentStage = 0;
    this.spinner = null;
  }
  
  start() {
    if (this.stages.length === 0) return;
    
    this.spinner = createSpinner(this.stages[0], 'ai');
    this.spinner.start();
  }
  
  nextStage(customText = null) {
    if (!this.spinner) return;
    
    this.currentStage++;
    
    if (this.currentStage < this.stages.length) {
      const text = customText || this.stages[this.currentStage];
      setSpinnerText(this.spinner, text, 'generate');
    }
  }
  
  complete(successText = 'Все этапы завершены!') {
    if (this.spinner) {
      succeedSpinner(this.spinner, successText);
    }
  }
  
  fail(errorText = 'Ошибка на этапе выполнения', suggestions = []) {
    if (this.spinner) {
      failSpinner(this.spinner, errorText, suggestions);
    }
  }
}

// Прогресс-бар спиннер
export class ProgressSpinner {
  constructor(total, text = 'Обработка') {
    this.total = total;
    this.current = 0;
    this.text = text;
    this.spinner = null;
  }
  
  start() {
    this.spinner = createSpinner(this.getProgressText(), 'rainbow');
    this.spinner.start();
  }
  
  increment(step = 1) {
    this.current = Math.min(this.current + step, this.total);
    if (this.spinner) {
      setSpinnerText(this.spinner, this.getProgressText(), 'loading');
    }
  }
  
  getProgressText() {
    const percentage = Math.round((this.current / this.total) * 100);
    const progressBar = this.createProgressBar();
    return `${this.text} ${progressBar} ${percentage}% (${this.current}/${this.total})`;
  }
  
  createProgressBar() {
    const width = 20;
    const filled = Math.round((this.current / this.total) * width);
    const empty = width - filled;
    
    return chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  }
  
  complete(successText = null) {
    this.current = this.total;
    const text = successText || `${this.text} завершена!`;
    if (this.spinner) {
      succeedSpinner(this.spinner, text);
    }
  }
}

// Экспорт для обратной совместимости
export { createSpinner as createLoader };
export { setSpinnerText as setLoaderText };
export { succeedSpinner as succeedLoader };
export { failSpinner as failLoader };