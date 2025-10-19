import ora from 'ora';
import cliSpinners from 'cli-spinners';

function detectAsciiPreference() {
  const simple = process.env.AGENT_SPINNER_SIMPLE === 'true';
  const isWin = process.platform === 'win32';
  const term = process.env.TERM || '';
  const noUnicode = term.toLowerCase().includes('dumb');
  return simple || isWin || noUnicode;
}

function resolveSpinnerStyle() {
  const preferAscii = detectAsciiPreference();
  const envStyle = process.env.AGENT_SPINNER_STYLE;
  if (envStyle && cliSpinners[envStyle]) return cliSpinners[envStyle];
  if (preferAscii) return cliSpinners.line;
  return cliSpinners.dots;
}

export function createLoader(text) {
  const spinnerStyle = resolveSpinnerStyle();
  const spinner = ora({ text, spinner: spinnerStyle });
  return spinner.start();
}

export function setLoaderText(spinner, text) {
  if (!spinner) return;
  spinner.text = text;
}

export function succeedLoader(spinner, text) {
  if (!spinner) return;
  if (text) spinner.text = text;
  spinner.succeed();
}

export function failLoader(spinner, text) {
  if (!spinner) return;
  if (text) spinner.text = text;
  spinner.fail();
}