import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.torexxx-agent');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

export async function loadConfig() {
  try {
    const data = await fs.readFile(CONFIG_PATH, 'utf8');
    const json = JSON.parse(data);
    return json || {};
  } catch (e) {
    return {};
  }
}

export async function saveConfig(cfg) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  const safe = JSON.stringify(cfg || {}, null, 2);
  await fs.writeFile(CONFIG_PATH, safe, 'utf8');
}