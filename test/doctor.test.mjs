import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { doctor, validateMatrixConfig } from '../scripts/doctor.mjs';
import { planScaffold, applyScaffold } from '../scripts/scaffold.mjs';
import { detect } from '../scripts/detect.mjs';
import { ROOT, fixtureCopy, shimDir, fakeSkill, runScript } from './helpers.mjs';

const example = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'skills/device-matrix-qa/assets/device-matrix.example.json'), 'utf8'));
const check = (r, name) => r.checks.find((c) => c.name === name);
const initProject = (modules = ['devices', 'matrix', 'motion']) => {
  const cwd = fixtureCopy('expo-router-app');
  applyScaffold(planScaffold({ cwd, det: detect(cwd, { expoCli: false }), modules }), cwd);
  return cwd;
};

test('validateMatrixConfig accepts the example and catches broken configs', () => {
  assert.deepEqual(validateMatrixConfig(example()).errors, []);
  const bad = example();
  bad.app.scheme = '';
  bad.screens.push({ name: 'home', path: 'x' });
  bad.android.profiles[0].dpi = 32;
  bad.android.stress.profile = 'ghost';
  bad.locales = { list: [], strategy: 'magic' };
  const errs = validateMatrixConfig(bad).errors.join('\n');
  for (const re of [/app.scheme is empty/, /duplicate screen name "home"/, /small-360" is 3600dp wide/, /stress.profile "ghost"/, /locales.list is empty/, /locales.strategy/])
    assert.match(errs, re);
});

test('empty PATH: tools missing are errors/warnings with a fix', () => {
  const cwd = initProject();
  const empty = shimDir({});
  const r = doctor(cwd, { env: { PATH: empty }, platform: 'linux' });
  assert.equal(check(r, 'adb').status, 'error');
  assert.ok(check(r, 'adb').fix);
  assert.equal(check(r, 'xcrun simctl').status, 'skip');
  assert.equal(check(r, 'agent-device').status, 'warn');
  assert.equal(r.ok, false);
});

test('fake tools on PATH: tool checks pass, AVD list is read', { skip: process.platform === 'win32' }, () => {
  const cwd = initProject();
  const shims = shimDir({ git: '', adb: '', emulator: 'echo Pixel_9; echo Small_Phone', java: 'echo "openjdk 17" >&2', 'agent-device': '', xcrun: '' });
  const r = doctor(cwd, { env: { PATH: shims }, platform: 'darwin' });
  for (const n of ['git', 'adb', 'java', 'agent-device', 'xcrun simctl']) assert.equal(check(r, n).status, 'ok', n);
  assert.equal(check(r, 'emulator').detail, 'AVDs: Pixel_9, Small_Phone');
  assert.equal(check(r, 'matrix config').status, 'ok');
});

test('lock and externals: missing lock, missing external, missing skill folder', () => {
  const bare = fixtureCopy('expo-router-app');
  assert.equal(check(doctor(bare, { env: { PATH: '' } }), '.mobile-kit.json').status, 'error');

  const cwd = initProject(['motion']);
  let r = doctor(cwd, { env: { PATH: '' } });
  assert.equal(check(r, 'external emil-animate-expo').status, 'error');
  assert.equal(check(r, 'external emil-animate-expo').fix, '/mobile-kit:update');

  const lockPath = path.join(cwd, '.mobile-kit.json');
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.externals = [{ id: 'emil-animate-expo' }, { id: 'expo-official' }];
  fs.writeFileSync(lockPath, JSON.stringify(lock));
  r = doctor(cwd, { env: { PATH: '' } });
  assert.match(check(r, 'external emil-animate-expo').fix, /npx -y skills add emilkowalski\/skills --skill animate-expo/);
  fakeSkill(cwd, 'animate-expo', 'emilkowalski/skills');
  fs.mkdirSync(path.join(cwd, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(cwd, '.claude/settings.json'), JSON.stringify({ enabledPlugins: { 'expo@claude-plugins-official': true } }));
  r = doctor(cwd, { env: { PATH: '' } });
  assert.equal(check(r, 'external emil-animate-expo').status, 'ok');
  assert.equal(check(r, 'external expo-official').status, 'warn');
});

test('collisions in .claude/skills are reported', () => {
  const cwd = initProject(['motion']);
  fakeSkill(cwd, 'react-native-best-practices', 'callstackincubator/agent-skills');
  fakeSkill(cwd, 'device-control', 'someone/else');
  const r = doctor(cwd, { env: { PATH: '' } });
  assert.equal(check(r, 'collision react-native-best-practices').status, 'error');
  assert.equal(check(r, 'collision device-control').status, 'warn');
});

test('CLI --json and exit code', () => {
  const r = runScript('doctor.mjs', ['--cwd', fixtureCopy('expo-router-app'), '--json']);
  assert.equal(r.code, 1);
  assert.equal(r.json.ok, false);
  assert.match(runScript('doctor.mjs', ['--help']).stdout, /Usage: node doctor.mjs/);
});

test('validateMatrixConfig: locale param and app-locale settle warning', () => {
  const cfg = example();
  cfg.locales = { list: ['en', 'de'], strategy: 'android-app-locale', param: 'bad param' };
  const v = validateMatrixConfig(cfg);
  assert.match(v.errors.join('\n'), /locales.param/);
  assert.match(v.warnings.join('\n'), /settleMs to 3000/);
  cfg.settleMs = 3000;
  delete cfg.locales.param;
  assert.deepEqual(validateMatrixConfig(cfg), { errors: [], warnings: [] });
});

test('disk space check reports free GB and warns below the threshold', async () => {
  const { diskCheck } = await import('../scripts/doctor.mjs');
  const ok = diskCheck(ROOT, 0);
  if (!ok) return; // fs.statfsSync unavailable on this Node
  assert.equal(ok.status, 'ok');
  assert.match(ok.detail, /GB free/);
  assert.equal(diskCheck(ROOT, 1e9).status, 'warn');
});
