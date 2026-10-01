#!/usr/bin/env node
// Static check for raw spacing / radius / font-size numbers in styles and raw colour literals.
// Heuristic, regex + bracket matching ("AST-lite"); see --help for its limits.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, handleHelp, list } from './lib/args.mjs';
import { LOCK_FILE, isDir, readJson, readText, walk } from './lib/fs.mjs';
import { log, printJson, setJsonMode, die } from './lib/log.mjs';

const HELP = `
Usage: node scan-hardcoded.mjs [paths...] [options]

Scans .ts/.tsx/.js/.jsx files (default paths: src, app) and reports:
  - numeric literals other than 0 and 1 on padding*, margin*, gap, rowGap, columnGap,
    top/left/right/bottom/start/end, inset*, border*Radius and fontSize, inside
    StyleSheet.create(...) or a JSX style prop (style={...}, contentContainerStyle={...}, ...);
  - hex (#fff, #ffffff, #ffffffff) and rgb()/rgba()/hsl()/hsla() colour literals outside the theme dir.
Each finding gets the nearest token as a suggestion (spacing, radius or type scale; read from
<themeDir>/tokens.ts when it exists, else the mobile-kit defaults).

Skipped: node_modules, dot-directories, ios/, android/, build output, the theme dir, *.test.*,
*.spec.*, __tests__/ and __mocks__/. Silence one line with a trailing "// mk-ignore", the
next line with "// mk-ignore-next-line", or a whole file with "// mk-ignore-file".

Options:
  --cwd <dir>         Project root (default: current directory)
  --theme-dir <dir>   Theme dir to exclude and read tokens from (default: .mobile-kit.json themeDir)
  --max <n>           Exit 1 when there are more than n findings
  --json              JSON report on stdout
  --help              Show this help

Limits (heuristic): styles built in helpers, variables or styled-components are not seen;
values from expressions (16 * 2, someVar) are not flagged; an apostrophe in JSX text can hide
the rest of that line from the scan; colours in non-style strings (e.g. analytics ids) can be
false positives. Treat the output as a review aid, not a linter.
`;

const EXT = /\.(tsx?|jsx?)$/;
const SKIP_DIRS = ['node_modules', '.git', '.expo', 'ios', 'android', 'build', 'dist', 'coverage', 'web-build', '__tests__', '__mocks__'];
const SKIP_FILE = /\.(test|spec)\.[tj]sx?$|\.d\.ts$/;

export const DEFAULT_SCALES = {
  space: { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 },
  radius: { sm: 6, md: 10, lg: 16, pill: 999 },
  type: { caption: 13, body: 16, heading: 20, title: 28 },
};

const SPACING_PROP = /^(?:padding\w*|margin\w*|gap|rowGap|columnGap|top|left|right|bottom|start|end|inset\w*)$/;
const RADIUS_PROP = /^border\w*Radius$/;
const FONT_PROP = /^fontSize$/;
const NUM_PROP_RE = /(?<![\w.$])([A-Za-z]+)\s*:\s*(-?(?:\d+\.?\d*|\.\d+))(?=\s*[,}\]\n]|\s*$)/g;
const COLOR_RE = /(['"`])(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4}))\1|\b((?:rgba?|hsla?)\(\s*[\d.]+%?\s*[,\s]\s*[\d.]+%?[^)]*\))/g;
const STYLE_START_RE = /StyleSheet\.create\s*\(|\b\w*[sS]tyle\s*=\s*\{/g;

/**
 * Blank comments (and, with blankStrings, string contents) while keeping offsets and newlines.
 * ' and " strings end at a newline, so a stray apostrophe can only hide one line.
 */
export function mask(src, { blankStrings }) {
  const out = src.split('');
  const blank = (i) => { if (out[i] !== '\n') out[i] = ' '; };
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') blank(i++); continue; }
    if (c === '/' && n === '*') { blank(i++); blank(i++); while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) blank(i++); if (i < src.length) { blank(i++); blank(i++); } continue; }
    if (c === '"' || c === "'" || c === '`') {
      i++;
      while (i < src.length && src[i] !== c && !(c !== '`' && src[i] === '\n')) {
        if (src[i] === '\\') { if (blankStrings) blank(i); i++; }
        if (blankStrings) blank(i);
        i++;
      }
      i++;
      continue;
    }
    i++;
  }
  return out.join('');
}

/** Index of the bracket that closes the one at `open` (in masked text), or -1. */
function matchBracket(text, open) {
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const stack = [];
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === '}' || c === ')' || c === ']') { if (stack.pop() !== c) return -1; if (!stack.length) return i; }
  }
  return -1;
}

export function styleRegions(masked) {
  const regions = [];
  for (const m of masked.matchAll(STYLE_START_RE)) {
    const open = m.index + m[0].length - 1;
    const close = matchBracket(masked, open);
    if (close > open) regions.push([open, close]);
  }
  return regions;
}

function nearest(scale, value, prefix) {
  let best = null;
  for (const [k, v] of Object.entries(scale)) if (best == null || Math.abs(v - Math.abs(value)) < Math.abs(best[1] - Math.abs(value))) best = [k, v];
  if (!best) return null;
  return `${value < 0 ? '-' : ''}${prefix}.${best[0]} (${best[1]})`;
}

/** Read `export const space|radius = {...}` and type sizes from a tokens file; fall back to defaults. */
export function loadScales(tokensText) {
  const scales = structuredClone(DEFAULT_SCALES);
  if (!tokensText) return scales;
  for (const name of ['space', 'radius']) {
    const body = tokensText.match(new RegExp(`export\\s+const\\s+${name}\\s*=\\s*\\{([^}]*)\\}`))?.[1];
    if (!body) continue;
    const entries = [...body.matchAll(/(\w+)\s*:\s*(\d+(?:\.\d+)?)/g)].map((m) => [m[1], Number(m[2])]);
    if (entries.length) scales[name] = Object.fromEntries(entries);
  }
  const typeBody = tokensText.match(/export\s+const\s+type\s*=\s*\{([\s\S]*?)\n\}/)?.[1];
  if (typeBody) {
    const entries = [...typeBody.matchAll(/(\w+)\s*:\s*\{[^}]*fontSize\s*:\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]);
    if (entries.length) scales.type = Object.fromEntries(entries);
  }
  return scales;
}

/** Scan one file's source. Returns findings without the file name. */
export function scanSource(src, { scales = DEFAULT_SCALES, colors = true } = {}) {
  const findings = [];
  if (/\/\/\s*mk-ignore-file\b/.test(src)) return findings;
  const lines = src.split('\n');
  const lineStarts = [0];
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') lineStarts.push(i + 1);
  const lineOf = (idx) => { let lo = 0, hi = lineStarts.length - 1; while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= idx) lo = mid; else hi = mid - 1; } return lo + 1; };
  const ignored = (line) => /\/\/\s*mk-ignore\b(?!-)|\/\*\s*mk-ignore\s*\*\//.test(lines[line - 1] ?? '') || /\/\/\s*mk-ignore-next-line\b/.test(lines[line - 2] ?? '');

  const noStrings = mask(src, { blankStrings: true });
  for (const [a, b] of styleRegions(noStrings)) {
    const region = noStrings.slice(a, b);
    for (const m of region.matchAll(NUM_PROP_RE)) {
      const [, prop, raw] = m;
      const value = Number(raw);
      if (value === 0 || value === 1) continue;
      let kind, suggestion;
      if (SPACING_PROP.test(prop)) { kind = 'spacing'; suggestion = nearest(scales.space, value, 'space'); }
      else if (RADIUS_PROP.test(prop)) { kind = 'radius'; suggestion = nearest(scales.radius, value, 'radius'); }
      else if (FONT_PROP.test(prop)) { kind = 'fontSize'; suggestion = nearest(scales.type, value, 'type') ; }
      else continue;
      const idx = a + m.index;
      const line = lineOf(idx);
      if (ignored(line)) continue;
      findings.push({ line, column: idx - lineStarts[line - 1] + 1, kind, property: prop, value, suggestion });
    }
  }

  if (colors) {
    const noComments = mask(src, { blankStrings: false });
    for (const m of noComments.matchAll(COLOR_RE)) {
      const value = m[2] ?? m[3];
      const idx = m.index + (m[2] ? 1 : 0);
      const line = lineOf(idx);
      if (ignored(line)) continue;
      findings.push({ line, column: idx - lineStarts[line - 1] + 1, kind: 'color', property: null, value, suggestion: 'a colour token from the theme' });
    }
  }
  // Same line can be matched by overlapping regions (nested style props): dedupe.
  const seen = new Set();
  return findings
    .filter((f) => { const k = `${f.line}:${f.column}:${f.kind}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((x, y) => x.line - y.line || x.column - y.column);
}

export function scan({ cwd, paths, themeDir }) {
  const theme = themeDir ? path.normalize(themeDir) : null;
  const tokens = theme ? readText(path.join(cwd, theme, 'tokens.ts')) : null;
  const scales = loadScales(tokens);
  const files = [];
  for (const p of paths) {
    const abs = path.resolve(cwd, p);
    if (isDir(abs)) for (const f of walk(abs, { ignore: SKIP_DIRS })) files.push(path.relative(cwd, path.join(abs, f)));
    else if (fs.existsSync(abs)) files.push(path.relative(cwd, abs));
  }
  const findings = [];
  let scanned = 0;
  for (const rel of [...new Set(files)].sort()) {
    const posix = rel.split(path.sep).join('/');
    if (!EXT.test(posix) || SKIP_FILE.test(posix)) continue;
    if (posix.split('/').some((s) => s.startsWith('.') && s.length > 1)) continue;
    if (theme && (posix === theme || posix.startsWith(theme.split(path.sep).join('/') + '/'))) continue;
    scanned++;
    for (const f of scanSource(readText(path.join(cwd, rel)) ?? '', { scales })) findings.push({ file: posix, ...f });
  }
  return { scanned, count: findings.length, themeDir: theme, findings };
}

export function main(argv) {
  const args = parseArgs(argv, { boolean: ['json', 'help'], string: ['cwd', 'theme-dir', 'max'], alias: { h: 'help' } });
  handleHelp(args, HELP);
  setJsonMode(args.json);
  const cwd = path.resolve(args.cwd || '.');
  const themeDir = args['theme-dir'] || readJson(path.join(cwd, LOCK_FILE))?.themeDir || null;
  const paths = args._.length ? args._ : ['src', 'app'].filter((p) => isDir(path.join(cwd, p)));
  if (!paths.length) die('Nothing to scan: pass paths, or run from a project with src/ or app/.');
  const max = args.max != null ? Number(args.max) : null;
  if (args.max != null && !Number.isInteger(max)) die('--max needs an integer');
  const r = scan({ cwd, paths: list(paths), themeDir });
  if (args.json) printJson({ ...r, max });
  else {
    for (const f of r.findings) log.info(`${f.file}:${f.line}:${f.column}  ${f.property ? `${f.property}: ` : ''}${f.value}  → ${f.suggestion}`);
    log.info(`\n${r.count} finding(s) in ${r.scanned} file(s)${r.themeDir ? ` (theme dir ${r.themeDir} excluded)` : ''}${max != null ? `; max ${max}` : ''}`);
  }
  return max != null && r.count > max ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
