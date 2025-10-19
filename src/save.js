import fs from 'fs-extra';
import path from 'path';
import slugify from 'slugify';

function parseFileBlocks(raw) {
  const files = [];
  let pos = 0;
  while (true) {
    const start = raw.indexOf('<<<FILE:', pos);
    if (start === -1) break;
    const after = start + '<<<FILE:'.length;
    // поддержка как '>>>' так и '>>' в заголовке
    let headerEnd = raw.indexOf('>>>', after);
    let headerToken = '>>>';
    if (headerEnd === -1) {
      headerEnd = raw.indexOf('>>', after);
      headerToken = '>>';
    }
    if (headerEnd === -1) break;
    const relPath = raw.slice(after, headerEnd).trim();

    const end = raw.indexOf('<<<END FILE>>>', headerEnd);
    if (end === -1) break;

    const block = raw.slice(headerEnd + headerToken.length, end);
    // Пытаемся вытащить содержимое из тройных бэктиков, а также метку языка
    let content = block;
    let lang = null;
    const fenceStart = block.indexOf('```');
    if (fenceStart !== -1) {
      const firstNewline = block.indexOf('\n', fenceStart + 3);
      if (firstNewline !== -1) {
        lang = block.slice(fenceStart + 3, firstNewline).trim();
      }
      const fenceEnd = block.indexOf('```', (firstNewline !== -1 ? firstNewline : fenceStart) + 1);
      if (fenceEnd !== -1) {
        content = block.slice((firstNewline !== -1 ? firstNewline + 1 : fenceStart + 3), fenceEnd);
      }
    }
    files.push({ relPath, content: content.replace(/^\n+|\n+$/g, ''), lang });
    pos = end + '<<<END FILE>>>'.length;
  }
  return files;
}

// Санитизация относительного пути файла, чтобы избежать ENAMETOOLONG и недопустимых символов
function sanitizeRelPath(p) {
  const s = String(p || '').trim();
  if (!s) return null;
  if (s.length > 256) return null;
  if (/\r|\n/.test(s)) return null;
  if (/[<>:"\\|?*\x00-\x1F]/.test(s)) return null;
  // нормализуем в POSIX-вид и убираем потенциальный путь наверх
  let normalized = s.replace(/\\/g, '/');
  normalized = normalized.replace(/^(\.\.(\/|\\))+/, '');
  normalized = normalized.replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized === '..') return null;
  return normalized;
}

function extForLang(lang) {
  const l = (lang || '').toLowerCase();
  if (l.includes('html')) return 'html';
  if (l.includes('css')) return 'css';
  if (l.includes('javascript') || l === 'js') return 'js';
  if (l.includes('json')) return 'json';
  if (l.includes('markdown') || l === 'md') return 'md';
  return 'txt';
}

function extForContent(content) {
  const c = String(content || '');
  if (c.includes('<!DOCTYPE html') || c.includes('<html')) return 'html';
  if (/^[^{]*\{[\s\S]*\}/.test(c) && /;|:\s*\w/.test(c)) return 'css';
  if (/\b(function|const|let|=>|document\.)\b/.test(c)) return 'js';
  return 'txt';
}

function fallbackName(index, spec, file) {
  const deliverables = Array.from(new Set([
    ...((spec?.deliverables || []).map(d => (typeof d === 'string' ? d : d.name)).filter(Boolean)),
    ...((spec?.files || []).map(f => (typeof f === 'string' ? f : f.name)).filter(Boolean)),
  ]));
  const candidate = deliverables[index];
  const safeFromSpec = candidate ? sanitizeRelPath(candidate) : null;
  if (safeFromSpec) return safeFromSpec;
  const ext = file.lang ? extForLang(file.lang) : extForContent(file.content);
  const bases = ['index', 'styles', 'script'];
  const base = bases[index] || `file-${index + 1}`;
  return `${base}.${ext}`;
}

export async function saveProjectArtifacts(originalPrompt, spec, rawOutput) {
  const root = path.resolve(process.cwd(), 'Torexxx-Agent', 'projects');
  const slug = slugify(spec.title || 'project', { lower: true, strict: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const proj = path.join(root, `${stamp}-${slug}`);
  await fs.ensureDir(proj);

  await fs.writeFile(path.join(proj, 'prompt.original.txt'), originalPrompt, 'utf-8');
  await fs.writeFile(path.join(proj, 'prompt.refined.json'), JSON.stringify(spec, null, 2), 'utf-8');
  await fs.writeFile(path.join(proj, 'generation.raw.md'), rawOutput, 'utf-8');

  const files = parseFileBlocks(rawOutput);
  const written = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const safeRel = sanitizeRelPath(f.relPath) || fallbackName(i, spec, f);
    const dest = path.join(proj, safeRel);
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, f.content, 'utf-8');
    written.push(safeRel);
  }

  const meta = {
    createdAt: new Date().toISOString(),
    filesWritten: written,
  };
  await fs.writeFile(path.join(proj, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  return proj;
}