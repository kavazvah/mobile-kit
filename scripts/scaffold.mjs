#!/usr/bin/env node
// Write mobile-kit project files idempotently: matrix config, .gitignore, CLAUDE.md section, theme templates, lock.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, handleHelp, list } from './lib/args.mjs';
import {
  KIT_ROOT, LOCK_FILE, MARK_START, MARK_END, exists, readText, readJson, writeText,
  kitVersion, upsertMarkedSection, ensureLines, readLock, lineDiff,
} from './lib/fs.mjs';
import { log, printJson, setJsonMode, die } from './lib/log.mjs';
import { DEFAULT_MODULES, resolveModules, routingRows } from './lib/modules.mjs';
import { detect } from './detect.mjs';

const HELP = `
Usage: node scaffold.mjs --modules <a,b,...> [options]

Plans and writes the project files for mobile-kit. Without --dry-run it applies every planned
change except conflicts (existing files are never overwritten unless named in --overwrite).

Actions (ids):
  matrix-config   qa/device-matrix.json, prefilled from detection (matrix module)
  gitignore       adds qa-shots/ to .gitignore
  claude-md       the mobile-kit section in CLAUDE.md, between ${MARK_START} / ${MARK_END}
  theme           tokens.ts + Screen.tsx, only with --theme (ask the user first)
  lock            ${LOCK_FILE}

Options:
  --modules <list>        Modules (default: the lock's modules, else ${DEFAULT_MODULES.join(',')}; core is always added)
  --cwd <dir>             Project root (default: current directory)
  --dry-run               Show the plan (with diffs) and change nothing
  --only <ids>            Apply only these actions
  --overwrite <ids>       Allow replacing existing files for these actions (e.g. matrix-config)
  --theme                 Include the theme templates
  --android-package <id>  Override the detected Android package
  --ios-bundle-id <id>    Override the detected iOS bundle id
  --scheme <scheme>       Override the detected URL scheme
  --no-expo-cli           Detection without "npx expo config"
  --json                  JSON plan/result on stdout
  --help                  Show this help
`;

const MATRIX_PATH = 'qa/device-matrix.json';
const MATRIX_TEMPLATE = path.join(KIT_ROOT, 'skills', 'device-matrix-qa', 'assets', 'device-matrix.example.json');

const screenName = (p) => (p === '' ? 'home' : p.replace(/[/[\]]+/g, '-').replace(/^-|-$/g, ''));

export function buildMatrixConfig(det, overrides = {}) {
  const cfg = readJson(MATRIX_TEMPLATE);
  cfg.app = {
    androidPackage: overrides.androidPackage || det.appIds.android || '',
    iosBundleId: overrides.iosBundleId || det.appIds.ios || '',
    scheme: overrides.scheme || det.scheme || '',
  };
  const routes = det.routes.filter((r) => !r.dynamic);
  if (routes.length) cfg.screens = routes.map((r) => ({ name: screenName(r.path), path: r.path }));
  const locales = det.i18n.locales.length ? det.i18n.locales : ['en'];
  cfg.locales = { list: locales, strategy: 'none' };
  return cfg;
}

function renderSection(modules, lock, det, themeDir) {
  const tpl = readText(path.join(KIT_ROOT, 'shared', 'claude-md-section.md'));
  const ext = new Set((lock.externals ?? []).map((e) => e.id));
  const rows = routingRows(modules, ext).map(([task, skill]) => `| ${task} | ${skill} |`).join('\n');
  const paths = [
    `- Lock file (modules, installed externals): \`${LOCK_FILE}\``,
    modules.includes('matrix') && `- Device matrix config: \`${MATRIX_PATH}\`; screenshots go to \`qa-shots/\` (git-ignored)`,
    `- Theme / tokens: ${themeDir ? `\`${themeDir}\`` : 'not set up yet'}`,
    det.routesRoot && `- Routes (expo-router): \`${det.routesRoot}/\``,
    modules.includes('testing') && '- E2E flows: `.maestro/`',
    modules.includes('ui-ux') && '- UI reviews: `qa/reviews/`',
    modules.includes('design') && '- Design decisions: `design/decisions/`; variants: `src/design-lab/`',
  ].filter(Boolean).join('\n');
  return tpl
    .replace('{{kitVersion}}', kitVersion())
    .replace('{{modules}}', modules.join(', '))
    .replace('{{routing}}', rows)
    .replace('{{paths}}', paths);
}

function fileAction(id, rel, cwd, next, { overwrite = false, mergeable = false } = {}) {
  const abs = path.join(cwd, rel);
  const cur = readText(abs);
  if (cur == null) return { id, path: rel, action: 'create', content: next };
  if (cur === next) return { id, path: rel, action: 'unchanged' };
  if (mergeable || overwrite) return { id, path: rel, action: 'update', content: next, diff: lineDiff(cur, next).filter((l) => l[0] !== ' ') };
  return { id, path: rel, action: 'conflict', reason: `${rel} exists and differs; pass --overwrite ${id} to replace it` };
}

/** Theme target: the detected theme dir if it lacks spacing tokens, else a new src/theme (or theme). */
function themeTargets(det) {
  if (det.themeDir && det.theme.hasSpacingTokens) return null;
  const themeDir = det.themeDir || (det.srcDir ? 'src/theme' : 'theme');
  const componentsDir = det.srcDir ? 'src/components' : 'components';
  let rel = path.posix.relative(componentsDir, `${themeDir}/tokens`);
  if (!rel.startsWith('.')) rel = './' + rel;
  return { themeDir, tokens: `${themeDir}/tokens.ts`, screen: `${componentsDir}/Screen.tsx`, tokensImport: rel };
}

export function planScaffold({ cwd, modules, det, overrides = {}, theme = false, overwrite = [] }) {
  const mods = resolveModules(modules);
  const lock = readLock(cwd);
  const actions = [];
  const todo = [];

  if (mods.includes('matrix')) {
    const cfg = buildMatrixConfig(det, overrides);
    if (!cfg.app.androidPackage) todo.push('Set app.androidPackage in qa/device-matrix.json (or android.package in app.json).');
    if (!cfg.app.iosBundleId) todo.push('Set app.iosBundleId in qa/device-matrix.json (or ios.bundleIdentifier in app.json).');
    if (!cfg.app.scheme) todo.push('Set a URL scheme (app.json "scheme") so screens open by deep link.');
    if (det.routes.some((r) => r.dynamic)) todo.push(`Dynamic routes were left out of the matrix screens: ${det.routes.filter((r) => r.dynamic).map((r) => r.path).join(', ')}. Add them with real ids if needed.`);
    actions.push(fileAction('matrix-config', MATRIX_PATH, cwd, JSON.stringify(cfg, null, 2) + '\n', { overwrite: overwrite.includes('matrix-config') }));
  }

  actions.push(fileAction('gitignore', '.gitignore', cwd, ensureLines(readText(path.join(cwd, '.gitignore')), ['qa-shots/']), { mergeable: true }));

  let themeDir = det.themeDir;
  const tt = themeTargets(det);
  if (theme && tt) {
    themeDir = tt.themeDir;
    const tokens = readText(path.join(KIT_ROOT, 'shared', 'templates', 'tokens.ts'));
    const screen = readText(path.join(KIT_ROOT, 'shared', 'templates', 'Screen.tsx')).replace('{{tokensImport}}', tt.tokensImport);
    actions.push(fileAction('theme', tt.tokens, cwd, tokens, { overwrite: overwrite.includes('theme') }));
    actions.push(fileAction('theme', tt.screen, cwd, screen, { overwrite: overwrite.includes('theme') }));
  } else if (tt && !theme) {
    todo.push(det.themeDir
      ? `${det.themeDir} has no spacing tokens. Offer the token templates (re-run with --theme).`
      : 'No theme/tokens found. Offer the token templates (re-run with --theme).');
  }

  // Lock: keep installed externals, record modules/paths.
  const nextLock = {
    kitVersion: kitVersion(),
    modules: mods,
    externals: lock.externals ?? [],
    themeDir: themeDir ?? null,
    configPath: mods.includes('matrix') ? MATRIX_PATH : null,
  };

  // CLAUDE.md last: its routing table reflects the lock.
  const claudePath = path.join(cwd, 'CLAUDE.md');
  let claudeText = readText(claudePath);
  if (claudeText == null && det.agentsMd) claudeText = '@AGENTS.md\n';
  actions.push(fileAction('claude-md', 'CLAUDE.md', cwd, upsertMarkedSection(claudeText, renderSection(mods, nextLock, det, themeDir)), { mergeable: true }));

  actions.push(fileAction('lock', LOCK_FILE, cwd, JSON.stringify(nextLock, null, 2) + '\n', { mergeable: true }));
  return { modules: mods, actions, todo };
}

export function applyScaffold(planned, cwd, only = []) {
  for (const a of planned.actions) {
    if (only.length && !only.includes(a.id)) { if (a.content) a.action = `skip (${a.action})`; continue; }
    if (a.action === 'create' || a.action === 'update') { writeText(path.join(cwd, a.path), a.content); a.applied = true; }
  }
  return planned;
}

function report(p, dryRun) {
  for (const a of p.actions) {
    log.info(`${a.applied ? '✔' : a.action === 'conflict' ? '✖' : '·'} [${a.id}] ${a.path}: ${a.action}${a.applied ? '' : dryRun && /create|update/.test(a.action) ? ' (planned)' : ''}${a.reason ? ` (${a.reason})` : ''}`);
    if (dryRun && a.diff?.length) for (const l of a.diff.slice(0, 60)) log.info(`    ${l}`);
    if (dryRun && a.action === 'create' && a.id !== 'lock') log.info(`    (new file, ${a.content.split('\n').length} lines)`);
  }
  if (p.todo.length) { log.info('\nStill to do:'); for (const t of p.todo) log.warn(t); }
}

export function main(argv) {
  const args = parseArgs(argv, {
    boolean: ['dry-run', 'json', 'theme', 'expo-cli', 'help'],
    string: ['modules', 'cwd', 'only', 'overwrite', 'android-package', 'ios-bundle-id', 'scheme'],
    alias: { h: 'help' },
  });
  handleHelp(args, HELP);
  setJsonMode(args.json);
  const cwd = path.resolve(args.cwd || '.');
  if (!exists(path.join(cwd, 'package.json'))) die(`No package.json in ${cwd}`);
  const det = detect(cwd, { expoCli: !argv.includes('--no-expo-cli') });
  let planned;
  try {
    planned = planScaffold({
      cwd,
      det,
      modules: args.modules ? list(args.modules) : readLock(cwd).modules?.length ? readLock(cwd).modules : DEFAULT_MODULES,
      theme: args.theme,
      overwrite: list(args.overwrite),
      overrides: { androidPackage: args['android-package'], iosBundleId: args['ios-bundle-id'], scheme: args.scheme },
    });
  } catch (e) { die(e.message); }
  if (!args['dry-run']) applyScaffold(planned, cwd, list(args.only));
  if (args.json) printJson({ dryRun: !!args['dry-run'], ...planned, actions: planned.actions.map(({ content, ...a }) => a) });
  else report(planned, args['dry-run']);
  return planned.actions.some((a) => a.action === 'conflict') ? 2 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
