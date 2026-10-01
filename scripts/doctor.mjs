#!/usr/bin/env node
// Check the machine and the project for everything mobile-kit needs. ✔ / ! / ✖ lines with one fix each.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs, handleHelp } from './lib/args.mjs';
import { run, which } from './lib/exec.mjs';
import { LOCK_FILE, exists, isDir, readJson } from './lib/fs.mjs';
import { log, printJson, setJsonMode } from './lib/log.mjs';
import { MODULES, DEFAULT_MODULES, loadManifest } from './lib/modules.mjs';

const HELP = `
Usage: node doctor.mjs [--cwd <dir>] [--json]

Checks tools (Node, git, adb, emulator, xcrun simctl, agent-device, Maestro, Java), the
${LOCK_FILE} lock, every installed external, the device matrix config, and skill-name
collisions in .claude/skills/. Prints one fix command per problem.

  --cwd <dir>   Project root (default: current directory)
  --json        JSON report on stdout
  --help        Show this help

Exit code: 0 when there are no ✖ errors (warnings allowed), 1 otherwise.
`;

const LOCALE_STRATEGIES = ['none', 'deeplink-param', 'android-app-locale'];

export function validateMatrixConfig(cfg) {
  const errors = [];
  const warnings = [];
  if (!cfg || typeof cfg !== 'object') return { errors: ['Not valid JSON'], warnings };
  const app = cfg.app ?? {};
  for (const k of ['androidPackage', 'iosBundleId', 'scheme']) if (!app[k]) errors.push(`app.${k} is empty`);
  if (!Array.isArray(cfg.screens) || !cfg.screens.length) errors.push('screens is empty');
  else {
    const names = new Set();
    cfg.screens.forEach((s, i) => {
      if (typeof s?.name !== 'string' || !s.name) errors.push(`screens[${i}].name missing`);
      if (typeof s?.path !== 'string') errors.push(`screens[${i}].path must be a string ("" for the start screen)`);
      if (names.has(s?.name)) errors.push(`duplicate screen name "${s.name}"`);
      names.add(s?.name);
    });
  }
  const profiles = cfg.android?.profiles;
  if (!Array.isArray(profiles) || !profiles.length) errors.push('android.profiles is empty');
  else {
    for (const p of profiles) {
      const ints = ['width', 'height', 'dpi'].every((k) => Number.isInteger(p[k]) && p[k] > 0);
      if (!p.name || !ints) { errors.push(`android profile "${p.name ?? '?'}" needs name and positive integer width/height/dpi`); continue; }
      const dpW = Math.round((Math.min(p.width, p.height) * 160) / p.dpi);
      if (dpW < 240 || dpW > 1400) errors.push(`android profile "${p.name}" is ${dpW}dp wide (expected 240–1400dp; check width/dpi)`);
    }
    const sp = cfg.android?.stress?.profile;
    if (sp && !profiles.some((p) => p.name === sp)) errors.push(`android.stress.profile "${sp}" is not a profile`);
  }
  const devices = cfg.ios?.devices;
  if (Array.isArray(devices)) {
    for (const d of devices) if (!d.name || !Array.isArray(d.match) || !d.match.length) errors.push(`ios device "${d.name ?? '?'}" needs name and a non-empty match list`);
    const sd = cfg.ios?.stress?.device;
    if (sd && !devices.some((d) => d.name === sd)) errors.push(`ios.stress.device "${sd}" is not a device`);
  } else warnings.push('ios.devices missing; iOS runs are disabled');
  if (cfg.locales) {
    if (!Array.isArray(cfg.locales.list) || !cfg.locales.list.length) errors.push('locales.list is empty');
    if (!LOCALE_STRATEGIES.includes(cfg.locales.strategy ?? 'none')) errors.push(`locales.strategy must be one of ${LOCALE_STRATEGIES.join(', ')}`);
    if (cfg.locales.param != null && !/^[\w-]+$/.test(cfg.locales.param)) errors.push('locales.param must be a simple query parameter name');
    if (cfg.locales.strategy === 'android-app-locale' && (cfg.settleMs ?? 2500) < 3000)
      warnings.push('android-app-locale restarts the app on each switch; set settleMs to 3000 or more');
  }
  return { errors, warnings };
}

function toolCheck(bin, { name = bin, level, fix, versionArgs, env } = {}) {
  const p = which(bin, env);
  if (!p) return { name, status: level, detail: 'not found', fix };
  if (versionArgs) {
    const r = run(p, versionArgs, { timeout: 20000 });
    if (r.code !== 0) return { name, status: level, detail: `found at ${p} but "${bin} ${versionArgs.join(' ')}" failed`, fix };
    const v = (r.stdout + r.stderr).split('\n').find((l) => l.trim()) ?? '';
    return { name, status: 'ok', detail: v.trim().slice(0, 80) };
  }
  return { name, status: 'ok', detail: p };
}

export function doctor(cwd, { env = process.env, platform = process.platform } = {}) {
  const checks = [];
  const add = (c) => checks.push(c);
  const lock = readJson(path.join(cwd, LOCK_FILE));
  const modules = lock?.modules ?? DEFAULT_MODULES;
  const has = (m) => modules.includes(m);
  const lockIds = new Set((lock?.externals ?? []).map((e) => e.id));

  // Machine
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  add(nodeMajor >= 18 ? { name: 'node', status: 'ok', detail: process.versions.node } : { name: 'node', status: 'error', detail: process.versions.node, fix: 'Install Node.js 18 or newer (https://nodejs.org)' });
  add(toolCheck('git', { level: 'error', fix: 'Install git (https://git-scm.com)', env }));

  if (has('devices') || has('matrix')) {
    const sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
    const sdkHint = sdk ? `export PATH="${sdk}/platform-tools:${sdk}/emulator:$PATH"` : 'Install Android Studio, then set ANDROID_HOME and add $ANDROID_HOME/platform-tools and $ANDROID_HOME/emulator to PATH';
    add(toolCheck('adb', { level: 'error', fix: sdkHint, env }));
    const emu = toolCheck('emulator', { level: 'error', fix: sdkHint, env });
    if (emu.status === 'ok') {
      const avds = run(emu.detail, ['-list-avds'], { timeout: 20000 }).stdout.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('INFO'));
      emu.detail = avds.length ? `AVDs: ${avds.join(', ')}` : 'no AVDs';
      if (!avds.length) Object.assign(emu, { status: 'warn', fix: 'Create an AVD in Android Studio (Device Manager), e.g. a Pixel with a recent API level' });
    }
    add(emu);
    if (platform === 'darwin') {
      const x = which('xcrun', env) && run('xcrun', ['simctl', 'help'], { timeout: 20000, env });
      add(x && x.code === 0 ? { name: 'xcrun simctl', status: 'ok', detail: 'available' } : { name: 'xcrun simctl', status: 'error', detail: 'not available', fix: 'Install Xcode from the App Store, then: sudo xcode-select -s /Applications/Xcode.app && xcodebuild -runFirstLaunch' });
    } else add({ name: 'xcrun simctl', status: 'skip', detail: 'iOS needs macOS + Xcode; Android only on this machine' });
    add(toolCheck('java', { level: 'warn', versionArgs: ['-version'], fix: 'Install a JDK 17 (e.g. the one bundled with Android Studio) for local Gradle builds', env }));
    add(toolCheck('agent-device', { level: lockIds.has('agent-device') ? 'error' : 'warn', fix: 'npm i -g agent-device@latest', env }));
  }
  if (has('testing')) add(toolCheck('maestro', { level: 'warn', fix: 'curl -fsSL "https://get.maestro.mobile.dev" | bash   (needed for E2E flows only)', env }));

  // Project
  if (!lock) add({ name: LOCK_FILE, status: 'error', detail: 'missing', fix: 'Run /mobile-kit:init in Claude Code' });
  else add({ name: LOCK_FILE, status: 'ok', detail: `kit ${lock.kitVersion}, modules: ${modules.join(', ')}` });

  let manifest = null;
  try { manifest = loadManifest(); } catch (e) { add({ name: 'external-skills.json', status: 'error', detail: e.message }); }
  const sLock = readJson(path.join(cwd, 'skills-lock.json'))?.skills ?? {};

  if (lock && manifest) {
    let pluginList = null;
    const pl = which('claude', env) ? run('claude', ['plugin', 'list', '--json'], { cwd, timeout: 60000, env }) : null;
    if (pl?.code === 0) { try { pluginList = JSON.parse(pl.stdout); } catch { /* ignore */ } }
    const projectSettings = readJson(path.join(cwd, '.claude', 'settings.json')) ?? {};

    for (const ext of manifest.externals.filter((e) => modules.includes(e.module))) {
      const name = `external ${ext.id}`;
      if (!lockIds.has(ext.id)) {
        if (ext.license == null) { add({ name, status: 'skip', detail: 'not installed (no license; opt-in)' }); continue; }
        add({ name, status: 'error', detail: `module "${ext.module}" is on but this external is not installed`, fix: '/mobile-kit:update' });
        continue;
      }
      if (ext.type === 'skills-cli') {
        const missing = ext.skills.filter((s) => !exists(path.join(cwd, '.claude', 'skills', s, 'SKILL.md')));
        add(missing.length
          ? { name, status: 'error', detail: `missing .claude/skills/${missing.join(', ')}`, fix: `npx -y skills add ${ext.source} ${missing.map((s) => `--skill ${s}`).join(' ')} -a claude-code -y` }
          : { name, status: 'ok', detail: ext.skills.join(', ') });
      } else {
        const fix = `claude plugin install ${ext.plugin} --scope project`;
        if (pluginList) {
          const hit = pluginList.find((p) => p.id === ext.plugin && p.enabled);
          add(hit ? { name, status: 'ok', detail: `${ext.plugin} ${hit.version ?? ''}`.trim() } : { name, status: 'error', detail: `${ext.plugin} not installed/enabled`, fix });
        } else if (projectSettings.enabledPlugins?.[ext.plugin]) {
          add({ name, status: 'warn', detail: `${ext.plugin} enabled in .claude/settings.json; install not verified (claude CLI unavailable)`, fix });
        } else add({ name, status: 'error', detail: `${ext.plugin} not enabled`, fix });
      }
    }
  }

  // Matrix config
  if (has('matrix')) {
    const cp = lock?.configPath || 'qa/device-matrix.json';
    const cfg = readJson(path.join(cwd, cp));
    if (!exists(path.join(cwd, cp))) add({ name: 'matrix config', status: 'error', detail: `${cp} missing`, fix: '/mobile-kit:init' });
    else {
      const v = validateMatrixConfig(cfg);
      if (v.errors.length) add({ name: 'matrix config', status: 'error', detail: `${cp}: ${v.errors.join('; ')}`, fix: `Edit ${cp}` });
      else add({ name: 'matrix config', status: v.warnings.length ? 'warn' : 'ok', detail: v.warnings.join('; ') || `${cfg.screens.length} screens, ${cfg.android.profiles.length} Android profiles` });
    }
  }

  // Collisions in .claude/skills
  const skillsDir = path.join(cwd, '.claude', 'skills');
  if (isDir(skillsDir) && manifest) {
    const owners = new Map();
    for (const e of manifest.externals) for (const s of e.skills ?? []) owners.set(s, e.source);
    const ownSkills = new Set(Object.values(MODULES).flatMap((m) => m.skills).concat(['init', 'doctor', 'update']));
    for (const dir of fs.readdirSync(skillsDir)) {
      if (!isDir(path.join(skillsDir, dir))) continue;
      const expected = owners.get(dir);
      const actual = sLock[dir]?.source;
      if (expected && actual && actual.toLowerCase() !== expected.toLowerCase())
        add({ name: `collision ${dir}`, status: 'error', detail: `.claude/skills/${dir} comes from ${actual}, mobile-kit expects ${expected}`, fix: `Remove or rename .claude/skills/${dir}, then run /mobile-kit:update` });
      else if (expected && !actual)
        add({ name: `collision ${dir}`, status: 'warn', detail: `.claude/skills/${dir} has no skills-lock.json entry; source unknown`, fix: `Check the folder; if it is not from ${expected}, rename it` });
      else if (ownSkills.has(dir))
        add({ name: `collision ${dir}`, status: 'warn', detail: `.claude/skills/${dir} has the same name as a mobile-kit skill and may be picked instead of mobile-kit:${dir}`, fix: `Rename .claude/skills/${dir}` });
    }
  }

  const errors = checks.filter((c) => c.status === 'error').length;
  const warnings = checks.filter((c) => c.status === 'warn').length;
  return { ok: errors === 0, errors, warnings, modules, checks };
}

function report(r) {
  const icon = { ok: '✔', warn: '!', error: '✖', skip: '·' };
  for (const c of r.checks) {
    log.info(`${icon[c.status]} ${c.name}: ${c.detail ?? ''}`);
    if (c.fix && c.status !== 'ok') log.info(`    fix: ${c.fix}`);
  }
  log.info(`\n${r.errors} error(s), ${r.warnings} warning(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2), { boolean: ['json', 'help'], string: ['cwd'], alias: { h: 'help' } });
  handleHelp(args, HELP);
  setJsonMode(args.json);
  const r = doctor(path.resolve(args.cwd || '.'));
  if (args.json) printJson(r); else report(r);
  process.exit(r.ok ? 0 : 1);
}
