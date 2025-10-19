import chalk from 'chalk';
import boxen from 'boxen';
import gradient from 'gradient-string';
import logUpdate from 'log-update';
import ansiEscapes from 'ansi-escapes';

let streamBuffer = '';

export function renderHeader() {
  const title = gradient.atlas(' Torexxx Code Agent • CLI');
  const subtitle = chalk.gray('LLM CLI для чистки промта и генерации проекта');
  console.log(boxen(title + '\n' + subtitle, {
    padding: 1,
    margin: 1,
    borderColor: 'magenta',
    title: 'Torexxx-Code-Agent',
    titleAlignment: 'center'
  }));
}

// Стрим-тайпинг (можно не использовать, если хотим тихий режим)
export function streamPrinter(token) {
  streamBuffer += token;
  logUpdate(streamBuffer);
}

export function clearStreamPrinter() {
  streamBuffer = '';
  logUpdate.clear();
  process.stdout.write(ansiEscapes.cursorShow);
}

// Обновление этапов генерации (меняет текст спиннера, либо печатает строку)
export function stageUpdate(spinner, message) {
  if (spinner && spinner.isSpinning) {
    spinner.text = message;
  } else {
    console.log(chalk.gray('• ') + chalk.white(message));
  }
}