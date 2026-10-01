#!/usr/bin/env node
// Install (or remove) the third-party skills/plugins for a set of modules, at project scope.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, handleHelp, list } from './lib/args.mjs';
import { run, which, formatCmd } from './lib/exec.mjs';
import { isDir, readJson, readLock, writeLock } from './lib/fs.mjs';
import { log, printJson, setJsonMode, die } from './lib/log.mjs';
import { loadManifest, resolveModules } from './lib/modules.mjs';

const HELP = `
Usage: node install-externals.mjs --modules <a,b,...> [options]
       node install-externals.mjs --remove <a,b,...> --modules <kept,...> [options]

Installs the externals (external-skills.json) of the given modules into the project at project scope:
  skills-cli → npx -y skills add <source> --skill <name>... -a claude-code -y   (into .claude/skills/)
  plugin     → claude plugin marketplace add <owner/repo> --scope project
               claude plugin install <plugin>@<marketplace> --scope project

  --modules <list>      Modules to install (core is always added)
  --remove <list>       Modules whose externals should be removed (externals still needed by --modules are kept)
  --cwd <dir>           Project root (default: current directory)
  --dry-run             Print the commands only; change nothing
  --allow-unlicensed    Also install externals whose source declares no license
  --refresh             Also update externals that are already installed
                        (npx skills update <names> -p -y / claude plugin update <plugin> --scope project)
  --print-plugin-cmds   Don't call the claude CLI; print plugin commands for the user to run
  --manifest <file>     Externals manifest (default: the kit's external-skills.json)
  --json                JSON summary on stdout
  --help                Show this help

Fail-soft: one external failing does not stop the others. Exit code 1 if any external failed.
Never overwrites a skill folder that came from a different source (reported as "collision").
`;

const SKILLS_ARGS = ['-a', 'claude-code', '-y'];

function skillsLock(cwd) { return readJson(path.join(cwd, 'skills-lock.json'))?.skills ?? {}; }
const sameSource = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** Decide what to do for one external. Pure apart from reading the project's files. */
export function planExternal(ext, cwd, opts = {}) {
  const base = { id: ext.id, module: ext.module, type: ext.type, source: ext.source, commands: [] };
  if (ext.license == null && !opts.allowUnlicensed)
    return { ...base, status: 'skipped', reason: ext.licenseWarning || 'Source declares no license; pass --allow-unlicensed to install.' };

  if (ext.type === 'skills-cli') {
    const lock = skillsLock(cwd);
    const missing = [];
    const present = [];
    for (const name of ext.skills) {
      if (!isDir(path.join(cwd, '.claude', 'skills', name))) { missing.push(name); continue; }
      const owner = lock[name]?.source;
      if (!sameSource(owner, ext.source))
        return { ...base, status: 'collision', reason: `.claude/skills/${name} already exists from ${owner || 'an unknown source'}; not overwriting (SPEC §6.4).` };
      present.push(name);
    }
    if (!missing.length) {
      if (!opts.refresh) return { ...base, status: 'present', skills: present };
      return { ...base, status: 'update', skills: present, commands: [{ bin: 'npx', args: ['-y', 'skills', 'update', ...present, '-p', '-y'] }] };
    }
    const args = ['-y', 'skills', 'add', ext.source, ...missing.flatMap((s) => ['--skill', s]), ...SKILLS_ARGS];
    return { ...base, status: 'install', skills: missing, commands: [{ bin: 'npx', args }] };
  }

  if (ext.type === 'plugin') {
    if (opts.refresh && opts.installedIds?.has(ext.id))
      return { ...base, status: 'update', plugin: ext.plugin, commands: [{ bin: 'claude', args: ['plugin', 'update', ext.plugin, '--scope', 'project'] }] };
    const commands = [];
    if (ext.marketplace) commands.push({ bin: 'claude', args: ['plugin', 'marketplace', 'add', ext.marketplace, '--scope', 'project'] });
    commands.push({ bin: 'claude', args: ['plugin', 'install', ext.plugin, '--scope', 'project'] });
    return { ...base, status: 'install', plugin: ext.plugin, commands };
  }

  return { ...base, status: 'skipped', reason: `Unknown type "${ext.type}"` };
}

export function planRemoval(ext, cwd) {
  const base = { id: ext.id, module: ext.module, type: ext.type, source: ext.source };
  if (ext.type === 'skills-cli') {
    const lock = skillsLock(cwd);
    const ours = ext.skills.filter((s) => isDir(path.join(cwd, '.claude', 'skills', s)) && sameSource(lock[s]?.source, ext.source));
    if (!ours.length) return { ...base, status: 'absent', commands: [] };
    return { ...base, status: 'remove', skills: ours, commands: [{ bin: 'npx', args: ['-y', 'skills', 'remove', ...ours, ...SKILLS_ARGS] }] };
  }
  return { ...base, status: 'remove', plugin: ext.plugin, commands: [{ bin: 'claude', args: ['plugin', 'uninstall', ext.plugin, '--scope', 'project'] }] };
}

/** Build the full plan for a target module set (+ optional removals). */
export function plan({ manifest, modules, remove = [], cwd, allowUnlicensed = false, refresh = false }) {
  const installedIds = new Set((readLock(cwd).externals ?? []).map((e) => e.id));
  const keep = resolveModules(modules);
  const keepIds = new Set(manifest.externals.filter((e) => keep.includes(e.module)).map((e) => e.id));
  const installs = manifest.externals.filter((e) => keepIds.has(e.id)).map((e) => planExternal(e, cwd, { allowUnlicensed, refresh, installedIds }));
  const removals = manifest.externals
    .filter((e) => remove.includes(e.module) && !keepIds.has(e.id))
    .map((e) => planRemoval(e, cwd));
  return { modules: keep, installs, removals };
}

function execute(item, cwd, opts) {
  item.log = [];
  for (const c of item.commands) {
    const shown = formatCmd(c.bin, c.args);
    if (c.bin === 'claude' && (opts.printPluginCmds || !which('claude'))) {
      item.status = 'manual';
      item.reason = opts.printPluginCmds ? 'Requested: run these in your terminal.' : 'The claude CLI is not on PATH; run these in your terminal.';
      return item;
    }
    if (c.bin === 'npx' && !which('npx')) { item.status = 'failed'; item.reason = 'npx not found (install Node.js ≥ 18).'; return item; }
    const res = run(c.bin, c.args, { cwd });
    item.log.push({ cmd: shown, code: res.code });
    if (res.code !== 0) {
      const msg = (res.stderr || res.stdout || res.error || '').trim().split('\n').slice(-3).join(' ').slice(0, 300);
      // A nested `claude` call can fail inside a session: hand the commands to the user instead.
      if (c.bin === 'claude') { item.status = 'manual'; item.reason = `claude CLI failed (${msg || `exit ${res.code}`}); run these in your terminal.`; return item; }
      item.status = 'failed'; item.reason = msg || `exit ${res.code}`; return item;
    }
  }
  item.status = { remove: 'removed', update: 'updated' }[item.status] ?? 'installed';
  return item;
}

function updateLock(cwd, result, manifest) {
  const lock = readLock(cwd);
  const byId = new Map((lock.externals ?? []).map((e) => [e.id, e]));
  const sLock = skillsLock(cwd);
  const now = new Date().toISOString();
  for (const it of result.installs) {
    if (!['installed', 'present', 'updated'].includes(it.status)) continue;
    const ext = manifest.externals.find((e) => e.id === it.id);
    const prev = byId.get(it.id);
    const ref = ext.type === 'skills-cli'
      ? Object.fromEntries(ext.skills.map((s) => [s, sLock[s]?.computedHash ?? null]))
      : null;
    byId.set(it.id, {
      id: ext.id,
      type: ext.type,
      source: ext.source,
      ...(ext.type === 'plugin' ? { plugin: ext.plugin } : { skills: ext.skills }),
      installedAt: it.status === 'installed' ? now : prev?.installedAt ?? now,
      ...(it.status === 'updated' ? { updatedAt: now } : prev?.updatedAt ? { updatedAt: prev.updatedAt } : {}),
      ref,
      commands: it.status === 'installed' ? it.commands.map((c) => formatCmd(c.bin, c.args)) : prev?.commands ?? [],
    });
  }
  for (const it of result.removals) if (it.status === 'removed' || it.status === 'absent') byId.delete(it.id);
  lock.externals = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  writeLock(cwd, lock);
}

function report(result, dryRun) {
  const icon = { installed: '✔', present: '✔', removed: '✔', updated: '✔', absent: '·', install: '→', remove: '→', update: '→', manual: '!', skipped: '·', collision: '✖', failed: '✖' };
  for (const it of [...result.installs, ...result.removals]) {
    const what = it.plugin || (it.skills ? it.skills.join(', ') : it.source);
    log.info(`${icon[it.status] ?? '?'} ${it.id} [${it.module}] ${it.status}: ${what}${it.reason ? ` (${it.reason})` : ''}`);
    if (dryRun || it.status === 'manual') for (const c of it.commands ?? []) log.info(`    ${formatCmd(c.bin, c.args)}`);
  }
  const s = result.summary;
  log.info(`\nSummary: ${Object.entries(s).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing to do'}`);
}

export function main(argv) {
  const args = parseArgs(argv, {
    boolean: ['dry-run', 'json', 'allow-unlicensed', 'print-plugin-cmds', 'refresh', 'help'],
    string: ['modules', 'remove', 'cwd', 'manifest'],
    alias: { h: 'help' },
  });
  handleHelp(args, HELP);
  setJsonMode(args.json);
  if (!args.modules && !args.remove) die('Pass --modules <list> (and/or --remove <list>). See --help.');
  const cwd = path.resolve(args.cwd || '.');
  const manifest = loadManifest(args.manifest ? path.resolve(args.manifest) : undefined);
  let result;
  try {
    result = plan({ manifest, modules: list(args.modules), remove: list(args.remove), cwd, allowUnlicensed: args['allow-unlicensed'], refresh: args.refresh });
  } catch (e) { die(e.message); }

  if (!args['dry-run']) {
    for (const it of [...result.removals, ...result.installs])
      if (['install', 'remove', 'update'].includes(it.status)) execute(it, cwd, { printPluginCmds: args['print-plugin-cmds'] });
    updateLock(cwd, result, manifest);
  }
  const all = [...result.installs, ...result.removals];
  result.summary = all.reduce((acc, it) => ({ ...acc, [it.status]: (acc[it.status] ?? 0) + 1 }), {});
  result.dryRun = !!args['dry-run'];
  if (args.json) printJson(result); else report(result, args['dry-run']);
  return all.some((it) => it.status === 'failed') ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
