import chalk from 'chalk';
import boxen from 'boxen';
import gradient from 'gradient-string';
import logUpdate from 'log-update';
import ansiEscapes from 'ansi-escapes';

let streamBuffer = '';

// ASCII Art для заголовка
const ASCII_ART = `
████████╗ ██████╗ ██████╗ ███████╗██╗  ██╗██╗  ██╗██╗  ██╗
╚══██╔══╝██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝╚██╗██╔╝╚██╗██╔╝
   ██║   ██║   ██║██████╔╝█████╗   ╚███╔╝  ╚███╔╝  ╚███╔╝ 
   ██║   ██║   ██║██╔══██╗██╔══╝   ██╔██╗  ██╔██╗  ██╔██╗ 
   ██║   ╚██████╔╝██║  ██║███████╗██╔╝ ██╗██╔╝ ██╗██╔╝ ██╗
   ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝
                                                            
                    ⚡ CODE AGENT ⚡                        
`;

const MINI_ASCII = `
╔╦╗╔═╗╦═╗╔═╗═╗ ╦═╗ ╦═╗ ╦
 ║ ║ ║╠╦╝║╣ ╔╩╦╝╔╩╦╝╔╩╦╝
 ╩ ╚═╝╩╚═╚═╝╩ ╚═╩ ╚═╩ ╚═
    ⚡ CODE AGENT ⚡
`;

// Функция для создания анимированного градиента
function createAnimatedGradient(text, frame = 0) {
  const gradients = [
    gradient.rainbow,
    gradient.pastel,
    gradient.atlas,
    gradient.teen,
    gradient.mind,
    gradient.morning,
    gradient.vice,
    gradient.fruit,
    gradient.instagram,
    gradient.cristal
  ];
  
  const currentGradient = gradients[frame % gradients.length];
  return currentGradient(text);
}

// Улучшенный заголовок с анимацией
export function renderHeader(animated = false) {
  console.clear();
  
  const isSmallTerminal = process.stdout.columns < 80;
  const art = isSmallTerminal ? MINI_ASCII : ASCII_ART;
  
  if (animated) {
    let frame = 0;
    const interval = setInterval(() => {
      console.clear();
      const coloredArt = createAnimatedGradient(art, frame);
      const subtitle = chalk.gray.italic('🚀 LLM CLI для чистки промта и генерации проекта 🚀');
      const version = chalk.dim('v0.1.0');
      
      console.log(boxen(
        coloredArt + '\n' + 
        chalk.cyan.bold('                    ════════════════════════════════════════') + '\n' +
        '                    ' + subtitle + '\n' +
        '                    ' + chalk.gray('                    ') + version,
        {
          padding: { top: 1, bottom: 1, left: 2, right: 2 },
          margin: { top: 1, bottom: 1, left: 1, right: 1 },
          borderStyle: 'double',
          borderColor: 'cyan',
          backgroundColor: 'black',
          title: '🤖 TOREXXX CODE AGENT 🤖',
          titleAlignment: 'center'
        }
      ));
      
      frame++;
      if (frame > 20) {
        clearInterval(interval);
        renderStaticHeader();
      }
    }, 150);
  } else {
    renderStaticHeader();
  }
}

function renderStaticHeader() {
  const isSmallTerminal = process.stdout.columns < 80;
  const art = isSmallTerminal ? MINI_ASCII : ASCII_ART;
  
  const coloredArt = gradient.cristal(art);
  const subtitle = chalk.gray.italic('🚀 LLM CLI для чистки промта и генерации проекта 🚀');
  const version = chalk.dim('v0.1.0');
  const features = [
    chalk.green('✓ Автоматический выбор шаблонов'),
    chalk.green('✓ Поддержка 20+ технологий'),
    chalk.green('✓ Интеллектуальная генерация кода')
  ].join('  ');
  
  console.log(boxen(
    coloredArt + '\n' + 
    chalk.cyan.bold('                    ════════════════════════════════════════') + '\n' +
    '                    ' + subtitle + '\n' +
    '                    ' + chalk.gray('                    ') + version + '\n\n' +
    '  ' + features,
    {
      padding: { top: 1, bottom: 1, left: 2, right: 2 },
      margin: { top: 1, bottom: 1, left: 1, right: 1 },
      borderStyle: 'double',
      borderColor: 'cyan',
      backgroundColor: 'black',
      title: '🤖 TOREXXX CODE AGENT 🤖',
      titleAlignment: 'center'
    }
  ));
}

// Улучшенный прогресс-бар
export function renderProgressBar(current, total, label = '') {
  const width = 40;
  const progress = Math.round((current / total) * width);
  const bar = '█'.repeat(progress) + '░'.repeat(width - progress);
  const percentage = Math.round((current / total) * 100);
  
  const progressBar = chalk.cyan('[') + 
    gradient.rainbow(bar) + 
    chalk.cyan(']') + 
    chalk.yellow(` ${percentage}%`);
  
  const status = label ? chalk.gray(` ${label}`) : '';
  
  return `${progressBar}${status}`;
}

// Стрим-тайпинг с улучшенным форматированием
export function streamPrinter(token) {
  streamBuffer += token;
  const formattedBuffer = chalk.green('💬 ') + chalk.white(streamBuffer);
  logUpdate(formattedBuffer);
}

export function clearStreamPrinter() {
  streamBuffer = '';
  logUpdate.clear();
  process.stdout.write(ansiEscapes.cursorShow);
}

// Улучшенное обновление этапов с иконками и цветами
export function stageUpdate(spinner, message, type = 'info') {
  const icons = {
    info: '🔄',
    success: '✅',
    warning: '⚠️',
    error: '❌',
    loading: '⏳',
    search: '🔍',
    generate: '⚡',
    save: '💾',
    template: '📋'
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
    template: chalk.blue
  };
  
  const icon = icons[type] || icons.info;
  const color = colors[type] || colors.info;
  const formattedMessage = `${icon} ${color(message)}`;
  
  if (spinner && spinner.isSpinning) {
    spinner.text = formattedMessage;
  } else {
    console.log(formattedMessage);
  }
}

// Красивое сообщение об успехе
export function renderSuccess(message, details = []) {
  const successBox = boxen(
    chalk.green.bold('🎉 УСПЕХ! 🎉\n\n') +
    chalk.white(message) + '\n\n' +
    (details.length > 0 ? details.map(d => chalk.gray('• ' + d)).join('\n') : ''),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'green',
      backgroundColor: 'black'
    }
  );
  
  console.log(successBox);
}

// Красивое сообщение об ошибке
export function renderError(message, suggestions = []) {
  const errorBox = boxen(
    chalk.red.bold('❌ ОШИБКА\n\n') +
    chalk.white(message) + '\n\n' +
    (suggestions.length > 0 ? 
      chalk.yellow.bold('💡 Возможные решения:\n') +
      suggestions.map(s => chalk.gray('• ' + s)).join('\n') : ''),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'red',
      backgroundColor: 'black'
    }
  );
  
  console.log(errorBox);
}

// Информационное сообщение
export function renderInfo(title, content, type = 'info') {
  const icons = {
    info: '💡',
    tip: '💭',
    warning: '⚠️',
    note: '📝'
  };
  
  const colors = {
    info: 'blue',
    tip: 'yellow',
    warning: 'yellow',
    note: 'cyan'
  };
  
  const icon = icons[type] || icons.info;
  const color = colors[type] || colors.info;
  
  const infoBox = boxen(
    chalk.bold(`${icon} ${title.toUpperCase()}\n\n`) +
    chalk.white(content),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: color,
      backgroundColor: 'black'
    }
  );
  
  console.log(infoBox);
}

// Интерактивное меню с улучшенным дизайном
export function renderMenu(title, options) {
  console.log('\n' + chalk.cyan.bold('═'.repeat(50)));
  console.log(chalk.cyan.bold(`📋 ${title}`));
  console.log(chalk.cyan.bold('═'.repeat(50)));
  
  options.forEach((option, index) => {
    const number = chalk.yellow.bold(`[${index + 1}]`);
    const text = chalk.white(option);
    console.log(`  ${number} ${text}`);
  });
  
  console.log(chalk.cyan.bold('═'.repeat(50)) + '\n');
}

// Таблица с результатами
export function renderTable(headers, rows) {
  const maxWidths = headers.map((header, i) => 
    Math.max(header.length, ...rows.map(row => String(row[i] || '').length))
  );
  
  // Заголовок
  const headerRow = headers.map((header, i) => 
    chalk.cyan.bold(header.padEnd(maxWidths[i]))
  ).join(' │ ');
  
  const separator = maxWidths.map(width => '─'.repeat(width)).join('─┼─');
  
  console.log('\n┌─' + separator + '─┐');
  console.log('│ ' + headerRow + ' │');
  console.log('├─' + separator + '─┤');
  
  // Строки данных
  rows.forEach(row => {
    const dataRow = row.map((cell, i) => 
      chalk.white(String(cell || '').padEnd(maxWidths[i]))
    ).join(' │ ');
    console.log('│ ' + dataRow + ' │');
  });
  
  console.log('└─' + separator + '─┘\n');
}

// Анимация успешного завершения с празднованием
export function renderCelebration(title, details = []) {
  const celebration = [
    '🎉', '🎊', '✨', '🌟', '⭐', '💫', '🎈', '🎁', 
    '🏆', '🥇', '🎯', '🚀', '💎', '🔥', '⚡', '🌈'
  ];
  
  const colors = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan'];
  
  console.log('\n');
  
  // Анимированная строка празднования
  const celebLine = celebration.map(emoji => 
    chalk[colors[Math.floor(Math.random() * colors.length)]](emoji)
  ).join(' ');
  
  console.log(boxen(
    `${celebLine}\n\n` +
    `${chalk.bold.green('🎊 ПОЗДРАВЛЯЕМ! 🎊')}\n\n` +
    `${chalk.bold.white(title)}\n\n` +
    (details.length ? details.map(d => `${chalk.green('✓')} ${chalk.white(d)}`).join('\n') + '\n\n' : '') +
    `${celebLine}`,
    {
      padding: 2,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'green',
      backgroundColor: 'black'
    }
  ));
  
  // Анимация конфетти в консоли
  setTimeout(() => {
    const confetti = ['🎊', '🎉', '✨', '🌟'];
    let line = '';
    for (let i = 0; i < 50; i++) {
      line += confetti[Math.floor(Math.random() * confetti.length)] + ' ';
    }
    console.log(gradient.rainbow(line));
  }, 500);
}

// Анимированный прогресс-бар для длительных операций
export function renderAnimatedProgress(current, total, label = '') {
  const percentage = Math.round((current / total) * 100);
  const barLength = 30;
  const filledLength = Math.round((percentage / 100) * barLength);
  
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  const colors = percentage < 30 ? 'red' : percentage < 70 ? 'yellow' : 'green';
  
  logUpdate(
    `${label ? chalk.bold(label) + '\n' : ''}` +
    `${chalk[colors]('▶')} ${chalk[colors](bar)} ${chalk.bold(percentage)}%\n` +
    `${chalk.gray(`${current}/${total} завершено`)}`
  );
  
  if (current === total) {
    logUpdate.clear();
    renderSuccess('Операция завершена!', [`Обработано ${total} элементов`]);
  }
}

// Интерактивное меню с поиском
export async function renderSearchableMenu(title, choices, searchPlaceholder = 'Поиск...') {
  console.log('\n' + chalk.bold.cyan(`🔍 ${title}`));
  console.log(chalk.gray('Начните вводить для поиска или используйте стрелки для навигации\n'));
  
  return await inquirer.prompt([
    {
      type: 'autocomplete',
      name: 'selection',
      message: '📋 Выберите опцию:',
      source: async (answersSoFar, input) => {
        if (!input) return choices;
        return choices.filter(choice => 
          choice.name.toLowerCase().includes(input.toLowerCase()) ||
          (choice.description && choice.description.toLowerCase().includes(input.toLowerCase()))
        );
      },
      pageSize: 10,
      suggestOnly: false,
    }
  ]);
}

// Статистика проекта с красивым форматированием
export function renderProjectStats(stats) {
  const {
    filesCreated = 0,
    linesOfCode = 0,
    templates = [],
    duration = 0,
    size = 0
  } = stats;
  
  const formatSize = (bytes) => {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };
  
  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}м ${seconds % 60}с`;
    }
    return `${seconds}с`;
  };
  
  console.log('\n' + boxen(
    chalk.bold.cyan('📊 СТАТИСТИКА ПРОЕКТА') + '\n\n' +
    `${chalk.green('📁')} Файлов создано: ${chalk.bold.white(filesCreated)}\n` +
    `${chalk.blue('📝')} Строк кода: ${chalk.bold.white(linesOfCode.toLocaleString())}\n` +
    `${chalk.yellow('🎯')} Шаблонов: ${chalk.bold.white(templates.length)}\n` +
    `${chalk.magenta('⏱️')} Время: ${chalk.bold.white(formatDuration(duration))}\n` +
    `${chalk.cyan('💾')} Размер: ${chalk.bold.white(formatSize(size))}` +
    (templates.length ? '\n\n' + chalk.gray('Использованные шаблоны:\n') + 
      templates.map(t => `  • ${chalk.white(t)}`).join('\n') : ''),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'cyan'
    }
  ));
}

// Подсказки и советы
export function renderTips(tips = []) {
  if (!tips.length) return;
  
  console.log('\n' + boxen(
    chalk.bold.yellow('💡 ПОЛЕЗНЫЕ СОВЕТЫ') + '\n\n' +
    tips.map((tip, i) => 
      `${chalk.yellow(`${i + 1}.`)} ${chalk.white(tip)}`
    ).join('\n'),
    {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'yellow'
    }
  ));
}

// Интерактивная помощь
export function renderHelp() {
  console.log('\n' + boxen(
    chalk.bold.blue('❓ СПРАВКА TOREXXX CODE AGENT') + '\n\n' +
    
    chalk.bold.white('🚀 БЫСТРЫЙ СТАРТ:') + '\n' +
    `  ${chalk.cyan('npm start')} - запуск интерактивного режима\n` +
    `  ${chalk.cyan('npm start -- --prompt "описание"')} - прямая генерация\n\n` +
    
    chalk.bold.white('🎯 РЕЖИМЫ РАБОТЫ:') + '\n' +
    `  ${chalk.green('•')} Авто-выбор - ИИ подбирает шаблоны автоматически\n` +
    `  ${chalk.green('•')} Ручной выбор - вы выбираете шаблоны сами\n` +
    `  ${chalk.green('•')} Без шаблонов - чистая генерация ИИ\n\n` +
    
    chalk.bold.white('🛠️ ДОСТУПНЫЕ ШАБЛОНЫ:') + '\n' +
    `  ${chalk.yellow('•')} Frontend: React, Vue, Next.js, Nuxt, Svelte\n` +
    `  ${chalk.yellow('•')} Backend: Express, Django, FastAPI, Golang\n` +
    `  ${chalk.yellow('•')} Mobile: React Native, Flutter\n` +
    `  ${chalk.yellow('•')} Desktop: Electron\n` +
    `  ${chalk.yellow('•')} Боты: Discord Bot\n` +
    `  ${chalk.yellow('•')} Расширения: Chrome Extension\n\n` +
    
    chalk.bold.white('🔑 API КЛЮЧ:') + '\n' +
    `  Получите бесплатный ключ на ${chalk.blue('https://openrouter.ai')}\n` +
    `  Установите в переменную ${chalk.cyan('OPENROUTER_API_KEY')}\n\n` +
    
    chalk.bold.white('📚 ПРИМЕРЫ:') + '\n' +
    `  ${chalk.gray('•')} "Создай лендинг для IT-компании"\n` +
    `  ${chalk.gray('•')} "React приложение для управления задачами"\n` +
    `  ${chalk.gray('•')} "Discord бот для модерации сервера"\n` +
    `  ${chalk.gray('•')} "API для интернет-магазина на Express"`,
    {
      padding: 2,
      margin: 1,
      borderStyle: 'double',
      borderColor: 'blue'
    }
  ));
}