import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

// Load templates by names (from ./templates/<name>.yaml) or absolute/relative paths
export async function loadTemplates(namesOrPaths = []) {
  const cwd = process.cwd();
  const templatesDir = path.resolve(cwd, 'templates');
  const results = [];

  for (const raw of namesOrPaths) {
    if (!raw) continue;
    let filePath;
    const str = String(raw).trim();
    if (!str) continue;
    if (str.endsWith('.yaml') || str.endsWith('.yml') || str.includes('/') || str.includes(path.sep)) {
      filePath = path.resolve(cwd, str);
    } else {
      filePath = path.join(templatesDir, `${str}.yaml`);
    }
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const parsed = yaml.load(content);
      const t = parsed?.template || parsed;
      if (t && typeof t === 'object') {
        results.push({ name: t.name || str, data: t, filePath });
      }
    } catch (e) {
      // silently skip missing or invalid files to allow combining
    }
  }

  return results;
}

// Merge loaded templates into spec: rules/style/stack -> constraints; structure -> files; description -> overview append
export function applyTemplatesToSpec(spec, loadedTemplates = []) {
  const out = { ...spec };
  const setUnique = (arr) => Array.from(new Set(arr.filter(Boolean).map(x => String(x))));

  const ensureArray = (v) => {
    if (v == null) return [];
    if (Array.isArray(v)) return v;
    return [v];
  };

  const addTo = (key, values) => {
    const current = ensureArray(out[key]);
    out[key] = setUnique([...current, ...values]);
  };

  for (const { data: t } of loadedTemplates) {
    const rules = Array.isArray(t.rules) ? t.rules : [];
    const style = Array.isArray(t.style) ? t.style : [];
    const stack = Array.isArray(t.stack) ? t.stack : [];
    const structure = Array.isArray(t.structure) ? t.structure : [];

    // constraints: rules + style + stack (prefix stack items for clarity)
    addTo('constraints', [...rules, ...style, ...stack.map(s => `stack:${s}`)]);

    // files: extract path before em dash or hyphen
    const files = structure.map(s => {
      if (typeof s !== 'string') return null;
      const emDashSplit = s.split('—');
      const hyphenSplit = s.split(' - ');
      let candidate = s;
      if (emDashSplit.length > 1) candidate = emDashSplit[0];
      else if (hyphenSplit.length > 1) candidate = hyphenSplit[0];
      return candidate.trim();
    }).filter(Boolean);
    addTo('files', files);

    // overview: append template description for extra context
    if (t.description) {
      const combined = out.overview ? `${out.overview}\n${t.description}` : String(t.description);
      out.overview = combined;
    }
  }

  return out;
}