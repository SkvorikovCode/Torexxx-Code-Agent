import fs from 'fs-extra';
import path from 'path';
import slugify from 'slugify';

function parseFileBlocks(raw) {
  const files = [];
  let pos = 0;
  while (true) {
    const start = raw.indexOf('<<<FILE:', pos);
    if (start === -1) break;
    const headerEnd = raw.indexOf('>>>', start);
    if (headerEnd === -1) break;
    const relPath = raw.slice(start + '<<<FILE:'.length, headerEnd).trim();

    const end = raw.indexOf('<<<END FILE>>>', headerEnd);
    if (end === -1) break;

    const block = raw.slice(headerEnd + '>>>'.length, end);
    // Пытаемся вытащить содержимое из тройных бэктиков, если они есть
    let content = block;
    const fenceStart = block.indexOf('```');
    if (fenceStart !== -1) {
      const fenceEnd = block.indexOf('```', fenceStart + 3);
      if (fenceEnd !== -1) {
        content = block.slice(fenceStart + 3, fenceEnd);
        // удаляем метку языка в первой строке (например, "javascript"/"html"/"css" или "<lang or text>")
        content = content.replace(/^\s*(?:[A-Za-z0-9._+-]+|<[^>]+>)\s*\n/, '');
      }
    }
    files.push({ relPath, content: content.replace(/^\n+|\n+$/g, '') });
    pos = end + '<<<END FILE>>>'.length;
  }
  return files;
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
  for (const f of files) {
    const dest = path.join(proj, f.relPath);
    await fs.ensureDir(path.dirname(dest));
    await fs.writeFile(dest, f.content, 'utf-8');
  }

  const meta = {
    createdAt: new Date().toISOString(),
    filesWritten: files.map(f => f.relPath),
  };
  await fs.writeFile(path.join(proj, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8');

  return proj;
}