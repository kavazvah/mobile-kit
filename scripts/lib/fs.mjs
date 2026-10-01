// File helpers shared by the kit scripts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Root of the installed plugin (two levels above scripts/lib). */
export const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const LOCK_FILE = '.mobile-kit.json';
export const MARK_START = '<!-- mobile-kit:start -->';
export const MARK_END = '<!-- mobile-kit:end -->';

export const exists = (p) => fs.existsSync(p);
export const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };
export const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };

export function readJson(p) {
  const t = readText(p);
  if (t == null) return null;
  try { return JSON.parse(t); } catch { return null; }
}

export function writeText(p, text) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
export const writeJson = (p, obj) => writeText(p, JSON.stringify(obj, null, 2) + '\n');

export function kitVersion() {
  return readJson(path.join(KIT_ROOT, '.claude-plugin', 'plugin.json'))?.version ?? '0.0.0';
}

/**
 * Insert or replace the block between the mobile-kit markers.
 * Returns the new text; the same input always produces the same output (idempotent).
 */
export function upsertMarkedSection(text, body) {
  const block = `${MARK_START}\n${body.trim()}\n${MARK_END}`;
  const src = text ?? '';
  const s = src.indexOf(MARK_START);
  const e = src.indexOf(MARK_END);
  if (s >= 0 && e > s) return src.slice(0, s) + block + src.slice(e + MARK_END.length);
  if (!src.trim()) return block + '\n';
  return src.replace(/\s*$/, '') + '\n\n' + block + '\n';
}

/** Return text with each missing line appended (exact line match). */
export function ensureLines(text, lines) {
  const src = text ?? '';
  const have = new Set(src.split(/\r?\n/).map((l) => l.trim()));
  const missing = lines.filter((l) => !have.has(l.trim()));
  if (!missing.length) return src;
  const base = src && !src.endsWith('\n') ? src + '\n' : src;
  return base + missing.join('\n') + '\n';
}

/** Read the project lock, or a fresh skeleton. */
export function readLock(cwd) {
  return readJson(path.join(cwd, LOCK_FILE)) ?? { kitVersion: null, modules: [], externals: [], themeDir: null, configPath: null };
}
export function writeLock(cwd, lock) { writeJson(path.join(cwd, LOCK_FILE), lock); }

/** Recursively list files under dir (relative paths, forward slashes). */
export function walk(dir, { ignore = ['node_modules', '.git'] } = {}) {
  const outFiles = [];
  const rec = (d, rel) => {
    let entries;
    try { entries = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      if (ignore.includes(ent.name)) continue;
      const r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) rec(path.join(d, ent.name), r);
      else if (ent.isFile()) outFiles.push(r);
    }
  };
  rec(dir, '');
  return outFiles.sort();
}

/** Tiny line diff (LCS) for previews. Returns lines prefixed with ' ', '-', '+'. */
export function lineDiff(a, b) {
  const x = (a ?? '').split('\n'), y = (b ?? '').split('\n');
  const n = x.length, m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const res = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (x[i] === y[j]) { res.push(' ' + x[i]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) res.push('-' + x[i++]);
    else res.push('+' + y[j++]);
  }
  while (i < n) res.push('-' + x[i++]);
  while (j < m) res.push('+' + y[j++]);
  return res;
}
