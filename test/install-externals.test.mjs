import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { plan } from '../scripts/install-externals.mjs';
import { loadManifest } from '../scripts/lib/modules.mjs';
import { formatCmd } from '../scripts/lib/exec.mjs';
import { fixtureCopy, shimDir, calls, runScript, fakeSkill } from './helpers.mjs';

const manifest = loadManifest();
const cmds = (it) => it.commands.map((c) => formatCmd(c.bin, c.args));
const byId = (p, id) => p.installs.find((i) => i.id === id);

test('dry-run plan for the default modules: exact commands', () => {
  const cwd = fixtureCopy('expo-router-app');
  const p = plan({ manifest, modules: ['devices', 'matrix', 'testing', 'ui-ux', 'motion'], cwd });
  assert.deepEqual(p.modules, ['core', 'devices', 'matrix', 'testing', 'ui-ux', 'motion']);
  assert.deepEqual(p.installs.map((i) => i.id), [
    'expo-official', 'vercel-rn', 'agent-device', 'callstack-github-actions', 'callstack-rn-testing',
    'platform-design', 'swm-rn-best-practices', 'emil-animate-expo',
  ]);
  assert.deepEqual(cmds(byId(p, 'expo-official')), [
    'claude plugin marketplace add anthropics/claude-plugins-official --scope project',
    'claude plugin install expo@claude-plugins-official --scope project',
  ]);
  assert.deepEqual(cmds(byId(p, 'agent-device')), [
    'npx -y skills add callstack/agent-device --skill agent-device --skill dogfood --skill android-emulator --skill ios-simulator -a claude-code -y',
  ]);
  assert.ok(p.installs.every((i) => i.status === 'install'));
});

test('unlicensed external is skipped unless allowed', () => {
  const cwd = fixtureCopy('expo-router-app');
  assert.equal(byId(plan({ manifest, modules: ['motion-skia'], cwd }), 'reanimated-skia-performance').status, 'skipped');
  const allowed = byId(plan({ manifest, modules: ['motion-skia'], cwd, allowUnlicensed: true }), 'reanimated-skia-performance');
  assert.equal(allowed.status, 'install');
});

test('same-source skill is present, other-source folder is a collision, partial installs only missing', () => {
  const cwd = fixtureCopy('expo-router-app');
  fakeSkill(cwd, 'animate-expo', 'emilkowalski/skills');
  fakeSkill(cwd, 'react-native-best-practices', 'callstackincubator/agent-skills');
  fakeSkill(cwd, 'dogfood', 'callstack/agent-device');
  const p = plan({ manifest, modules: ['motion', 'devices'], cwd });
  assert.equal(byId(p, 'emil-animate-expo').status, 'present');
  assert.equal(byId(p, 'swm-rn-best-practices').status, 'collision');
  assert.match(byId(p, 'swm-rn-best-practices').reason, /callstackincubator\/agent-skills/);
  assert.deepEqual(byId(p, 'agent-device').skills, ['agent-device', 'android-emulator', 'ios-simulator']);
});

test('folder without a skills-lock entry counts as a collision', () => {
  const cwd = fixtureCopy('expo-router-app');
  fakeSkill(cwd, 'animate-expo', null);
  assert.equal(byId(plan({ manifest, modules: ['motion'], cwd }), 'emil-animate-expo').status, 'collision');
});

test('--refresh turns present externals into updates', () => {
  const cwd = fixtureCopy('expo-router-app');
  fakeSkill(cwd, 'animate-expo', 'emilkowalski/skills');
  fs.writeFileSync(path.join(cwd, '.mobile-kit.json'), JSON.stringify({ modules: ['core', 'perf'], externals: [{ id: 'callstack-rn-best-practices' }] }));
  const p = plan({ manifest, modules: ['motion', 'perf'], cwd, refresh: true });
  assert.deepEqual(cmds(byId(p, 'emil-animate-expo')), ['npx -y skills update animate-expo -p -y']);
  assert.deepEqual(cmds(byId(p, 'callstack-rn-best-practices')), ['claude plugin update building-react-native-apps@callstack-agent-skills --scope project']);
  assert.equal(byId(p, 'expo-official').status, 'install');
});

test('removal keeps externals still needed and removes only our skills', () => {
  const cwd = fixtureCopy('expo-router-app');
  fakeSkill(cwd, 'animate-expo', 'emilkowalski/skills');
  const p = plan({ manifest, modules: ['devices'], remove: ['motion', 'core'], cwd });
  assert.deepEqual(p.removals.map((r) => [r.id, r.status]), [['swm-rn-best-practices', 'absent'], ['emil-animate-expo', 'remove']]);
  assert.deepEqual(cmds(p.removals[1]), ['npx -y skills remove animate-expo -a claude-code -y']);
});

test('CLI --dry-run changes nothing', () => {
  const cwd = fixtureCopy('expo-router-app');
  const r = runScript('install-externals.mjs', ['--modules', 'motion', '--cwd', cwd, '--dry-run', '--json']);
  assert.equal(r.code, 0);
  assert.equal(r.json.dryRun, true);
  assert.equal(fs.existsSync(path.join(cwd, '.mobile-kit.json')), false);
});

test('CLI real run with fake npx/claude: fail-soft, manual fallback, lock written', { skip: process.platform === 'win32' }, () => {
  const cwd = fixtureCopy('expo-router-app');
  const shims = shimDir({
    npx: 'case "$*" in *pulsar*) echo "network down" >&2; exit 1;; esac; exit 0',
    claude: 'case "$*" in *"plugin install"*) echo "nested session" >&2; exit 1;; esac; exit 0',
  });
  const r = runScript('install-externals.mjs', ['--modules', 'motion,haptics', '--cwd', cwd, '--json'], { env: { PATH: `${shims}:${process.env.PATH}` } });
  assert.equal(r.code, 1, 'exit 1 because one external failed');
  const status = Object.fromEntries(r.json.installs.map((i) => [i.id, i.status]));
  assert.deepEqual(status, {
    'expo-official': 'manual',
    'vercel-rn': 'installed',
    'swm-rn-best-practices': 'installed',
    'emil-animate-expo': 'installed',
    'swm-pulsar-haptics': 'failed',
  });
  assert.ok(calls(shims).includes('npx -y skills add emilkowalski/skills --skill animate-expo -a claude-code -y'));
  const lock = JSON.parse(fs.readFileSync(path.join(cwd, '.mobile-kit.json'), 'utf8'));
  assert.deepEqual(lock.externals.map((e) => e.id), ['emil-animate-expo', 'swm-rn-best-practices', 'vercel-rn']);
  assert.deepEqual(lock.externals[0].commands, ['npx -y skills add emilkowalski/skills --skill animate-expo -a claude-code -y']);
});

test('CLI --print-plugin-cmds never calls claude', { skip: process.platform === 'win32' }, () => {
  const cwd = fixtureCopy('expo-router-app');
  const shims = shimDir({ npx: 'exit 0', claude: 'exit 0' });
  const r = runScript('install-externals.mjs', ['--modules', 'core', '--cwd', cwd, '--json', '--print-plugin-cmds'], { env: { PATH: `${shims}:${process.env.PATH}` } });
  assert.equal(r.json.installs.find((i) => i.id === 'expo-official').status, 'manual');
  assert.ok(!calls(shims).some((c) => c.startsWith('claude')));
});

test('CLI errors: missing --modules, unknown module', () => {
  assert.equal(runScript('install-externals.mjs', []).code, 1);
  const r = runScript('install-externals.mjs', ['--modules', 'nope', '--dry-run']);
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Unknown module/);
});
