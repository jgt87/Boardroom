#!/usr/bin/env node
// Merge a filled-in recreate file into a whiteboard REST export, so one file imports into Boardroom with the
// rebuilt objects. Dependency-free; Node 18 or later. Works offline: it only reads local files.
//
//   node scripts/merge-recreate.mjs <export.json> <export.recreate.json> [out.json]
//
// Entries whose "content" is null are left out (their objects import as placeholders). In an entry's content,
// "file" (an image) and "csvFile" (a CSV or TSV file) are read relative to the recreate file and embedded as
// "dataUrl" and "csv". See README-export-whiteboard.md.
import { readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RECREATE_FORMAT = 'boardroom-recreate-v1';
const MAX_IMAGE_BYTES = 4_000_000;
const MAX_CSV_BYTES = 5_000_000;
const USAGE = 'Usage: node scripts/merge-recreate.mjs <export.json> <export.recreate.json> [out.json]';

export class MergeError extends Error {}

/** The image type from the file's first bytes (PNG, JPEG, GIF or WebP), else null. */
export function sniffImage(bytes) {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b.subarray(0, 4).toString('latin1') === 'GIF8') return 'image/gif';
  if (
    b.length >= 12 &&
    b.subarray(0, 4).toString('latin1') === 'RIFF' &&
    b.subarray(8, 12).toString('latin1') === 'WEBP'
  )
    return 'image/webp';
  return null;
}

/** A file next to the recreate file; absolute paths and paths that leave its folder are refused. */
function localPath(baseDir, name, what) {
  if (typeof name !== 'string' || !name.trim()) throw new MergeError(`Give the ${what} file name.`);
  if (path.isAbsolute(name)) throw new MergeError(`Write the ${what} path relative to the recreate file: ${name}`);
  const full = path.resolve(baseDir, name);
  const rel = path.relative(baseDir, full);
  if (rel.startsWith('..') || path.isAbsolute(rel))
    throw new MergeError(`The ${what} file must be in the recreate file's folder: ${name}`);
  return full;
}

/** One entry's content with its local files read in. */
async function resolveContent(content, baseDir, read) {
  const next = { ...content };
  if (next.file !== undefined) {
    const full = localPath(baseDir, next.file, 'image');
    const bytes = await read(full);
    if (bytes.length > MAX_IMAGE_BYTES) throw new MergeError(`${next.file} is larger than 4 MB.`);
    const mime = sniffImage(bytes);
    if (!mime) throw new MergeError(`${next.file} is not a PNG, JPEG, GIF or WebP image.`);
    next.dataUrl = `data:${mime};base64,${bytes.toString('base64')}`;
    if (!next.title) next.title = path.basename(next.file).slice(0, 200);
    delete next.file;
  }
  if (next.csvFile !== undefined) {
    const full = localPath(baseDir, next.csvFile, 'CSV');
    const bytes = await read(full);
    if (bytes.length > MAX_CSV_BYTES) throw new MergeError(`${next.csvFile} is larger than 5 MB.`);
    next.csv = bytes.toString('utf8').replace(/^﻿/, '');
    if (!next.title)
      next.title = path
        .basename(next.csvFile)
        .replace(/\.(csv|tsv|txt)$/i, '')
        .slice(0, 200);
    delete next.csvFile;
  }
  return next;
}

/**
 * The export with the filled entries of `recreate` under `recreate` (an array). `read(path)` returns a Buffer.
 * Returns the merged export and how many entries were used and left empty.
 */
export async function mergeRecreate(exported, recreate, baseDir, read = p => readFile(p)) {
  if (!exported || typeof exported !== 'object' || !Array.isArray(exported.items))
    throw new MergeError('The first file is not a whiteboard export (no "items").');
  if (!recreate || recreate.format !== RECREATE_FORMAT || !Array.isArray(recreate.entries))
    throw new MergeError(`The second file is not a recreate file (format "${RECREATE_FORMAT}").`);
  const entries = [];
  let empty = 0;
  for (const [k, entry] of recreate.entries.entries()) {
    if (!entry || typeof entry !== 'object' || entry.content == null) {
      empty++;
      continue;
    }
    if (typeof entry.content !== 'object') throw new MergeError(`Entry ${k + 1}: "content" must be an object.`);
    try {
      entries.push({ ...entry, content: await resolveContent(entry.content, baseDir, read) });
    } catch (err) {
      const label = entry.sourceId ? `${entry.type ?? 'object'} ${entry.sourceId}` : `entry ${k + 1}`;
      throw new MergeError(
        `${label}: ${err instanceof MergeError ? err.message : `could not read a file (${err?.code ?? err})`}`,
      );
    }
  }
  return { merged: { ...exported, recreate: entries }, used: entries.length, empty };
}

export async function main(argv = process.argv.slice(2)) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length < 2 || argv.length > 3) {
    console.error(USAGE);
    return argv.includes('--help') || argv.includes('-h') ? 0 : 2;
  }
  const [exportPath, recreatePath, outArg] = argv;
  const out = outArg ?? exportPath.replace(/(\.json)?$/i, '.filled.json');
  try {
    for (const p of [exportPath, recreatePath])
      if (!(await stat(p).catch(() => null))?.isFile()) throw new MergeError(`File not found: ${p}`);
    const parse = async (p, what) => {
      try {
        return JSON.parse(await readFile(p, 'utf8'));
      } catch {
        throw new MergeError(`The ${what} is not valid JSON: ${p}`);
      }
    };
    const exported = await parse(exportPath, 'export file');
    const recreate = await parse(recreatePath, 'recreate file');
    const { merged, used, empty } = await mergeRecreate(exported, recreate, path.dirname(path.resolve(recreatePath)));
    await writeFile(out, JSON.stringify(merged));
    console.error(
      `Wrote ${out}: ${used} objects to recreate, ${empty} left as placeholders. Import it in Boardroom with "Whiteboard JSON (REST export)".`,
    );
    return 0;
  } catch (err) {
    console.error(err instanceof MergeError ? err.message : `Merge failed: ${err?.message ?? err}`);
    return 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exitCode = await main();
