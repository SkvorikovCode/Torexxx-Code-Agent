import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

function toLowerTrim(s) {
  return String(s || '').toLowerCase().trim();
}

function normalizeList(list) {
  return (Array.isArray(list) ? list : [])
    .map((v) => String(v).trim())
    .filter(Boolean);
}

function normalizeWeightedTags(tags, weightDefault = 1) {
  const map = new Map();
  if (!tags) return map;
  if (Array.isArray(tags)) {
    for (const t of tags) {
      const key = toLowerTrim(t);
      if (!key) continue;
      map.set(key, Number(weightDefault) || 1);
    }
  } else if (typeof tags === 'object') {
    for (const [k, w] of Object.entries(tags)) {
      const key = toLowerTrim(k);
      const weight = Number(w) || Number(weightDefault) || 1;
      if (!key) continue;
      map.set(key, weight);
    }
  }
  return map;
}

function normalizeSynonymsMap(obj) {
  const out = {};
  if (!obj || typeof obj !== 'object') return out;
  for (const [canon, list] of Object.entries(obj)) {
    const canonKey = toLowerTrim(canon);
    out[canonKey] = normalizeList(list).map(toLowerTrim);
  }
  return out;
}

function tagsToSortedArray(tagsMap) {
  return Array.from(tagsMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([term, weight]) => ({ term, weight }));
}

async function loadMemoryBank(memoryBankPath = path.resolve(process.cwd(), 'templates', 'MemoryBank.yaml')) {
  try {
    const raw = fs.readFileSync(memoryBankPath, 'utf8');
    const parsed = yaml.load(raw);
    const mem = parsed?.memory || parsed || {};

    const version = Number(mem.version) || 1;
    const settings = mem.settings || {};
    const normalizedSettings = {
      auto_add_limit: Number(settings.auto_add_limit) || 3,
      weight_default: Number(settings.weight_default) || 1,
    };

    const synonymsRoot = normalizeSynonymsMap(mem.synonyms);

    const templates = (Array.isArray(mem.templates) ? mem.templates : []).map((t) => {
      const name = String(t.name || '').trim();
      const description = String(t.description || '').trim();
      const stack = normalizeList(t.stack);
      const style = normalizeList(t.style);
      const structure = normalizeList(t.structure);
      const rules = normalizeList(t.rules);

      const tagsWeights = normalizeWeightedTags(t.tags, normalizedSettings.weight_default);
      const synonyms = normalizeList(t.synonyms).map(toLowerTrim);

      return {
        name,
        description,
        stack,
        style,
        structure,
        rules,
        tagsWeights, // Map term -> weight
        synonyms,    // Array of lower-cased synonyms
      };
    }).filter((t) => t.name);

    return {
      version,
      settings: normalizedSettings,
      synonyms: synonymsRoot,
      templates,
    };
  } catch (err) {
    return {
      version: 0,
      settings: { auto_add_limit: 3, weight_default: 1 },
      synonyms: {},
      templates: [],
      error: `Failed to load MemoryBank.yaml: ${err.message}`,
    };
  }
}

function expandTemplateTerms(template, synonymsRoot) {
  const terms = new Set();
  // tags
  for (const term of template.tagsWeights.keys()) {
    if (!term) continue;
    terms.add(term);
    if (synonymsRoot[term]) {
      for (const syn of synonymsRoot[term]) terms.add(syn);
    }
  }
  // per-template synonyms
  for (const syn of template.synonyms || []) {
    if (!syn) continue;
    terms.add(syn);
    // Also add canonical forms if synonym maps back (best-effort): if synonym equals any list entry, include its canon
    for (const [canon, list] of Object.entries(synonymsRoot)) {
      if (list.includes(syn)) terms.add(canon);
    }
  }
  return Array.from(terms);
}

function scoreTemplateAgainstText(text, template, synonymsRoot, weightDefault = 1) {
  const s = toLowerTrim(text);
  let score = 0;

  // Weighted tags scoring
  for (const [term, w] of template.tagsWeights.entries()) {
    const weight = Number(w) || Number(weightDefault) || 1;
    if (!term) continue;
    if (s.includes(term)) score += weight * 2;
    const re = new RegExp(`(^|[^a-z0-9])${term}([^a-z0-9]|$)`, 'i');
    if (re.test(s)) score += weight * 3;

    // synonyms for this tag from root
    const syns = synonymsRoot[term] || [];
    for (const syn of syns) {
      if (!syn) continue;
      if (s.includes(syn)) score += weight * 1.5;
      const reSyn = new RegExp(`(^|[^a-z0-9])${syn}([^a-z0-9]|$)`, 'i');
      if (reSyn.test(s)) score += weight * 2;
    }
  }

  // Per-template synonyms scoring
  for (const syn of template.synonyms || []) {
    if (!syn) continue;
    if (s.includes(syn)) score += Number(weightDefault) || 1;
    const reSyn = new RegExp(`(^|[^a-z0-9])${syn}([^a-z0-9]|$)`, 'i');
    if (reSyn.test(s)) score += (Number(weightDefault) || 1) * 1.5;
  }

  return score;
}

function matchTemplatesByText(text, memory) {
  const mem = memory || {};
  const templates = Array.isArray(mem.templates) ? mem.templates : [];
  const limit = Number(mem.settings?.auto_add_limit) || 3;
  const weightDefault = Number(mem.settings?.weight_default) || 1;

  const scored = templates.map((t) => ({
    name: t.name,
    description: t.description,
    score: scoreTemplateAgainstText(text, t, mem.synonyms || {}, weightDefault),
  }));

  scored.sort((a, b) => b.score - a.score);
  const filtered = scored.filter((x) => x.score > 0);
  return filtered.slice(0, limit);
}

function getTemplateByName(memory, name) {
  const mem = memory || {};
  const nm = String(name || '').trim().toLowerCase();
  const list = Array.isArray(mem.templates) ? mem.templates : [];
  return list.find((t) => t.name.toLowerCase() === nm);
}

function getTopTags(template, topN = 5) {
  const arr = tagsToSortedArray(template.tagsWeights || new Map());
  return arr.slice(0, topN).map((x) => x.term);
}

export { loadMemoryBank, matchTemplatesByText, getTemplateByName, getTopTags };