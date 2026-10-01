import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { planScaffold, applyScaffold, buildMatrixConfig } from '../scripts/scaffold.mjs';
import { detect } from '../scripts/detect.mjs';
import { MARK_START, MARK_END } from '../scripts/lib/fs.mjs';
import { fixtureCopy, runScript } from './helpers.mjs';

const read = (cwd, f) => fs.readFileSync(path.join(cwd, f), 'utf8');
const scaffold = (cwd, opts = {}) => {
  const p = planScaffold({ cwd, det: detect(cwd, { expoCli: false }), modules: ['devices', 'matrix', 'testing', 'ui-ux', 'motion'], ...opts });
  return applyScaffold(p, cwd, opts.only ?? []);
};

test('matrix config is prefilled from detection', () => {
  const det = detect(fixtureCopy('expo-router-app'), { expoCli: false });
  const cfg = buildMatrixConfig(det);
  assert.deepEqual(cfg.app, { androidPackage: 'com.example.fixture', iosBundleId: 'com.example.fixture', scheme: 'fixture' });
  assert.deepEqual(cfg.screens, [{ name: 'home', path: '' }, { name: 'login', path: 'login' }, { name: 'settings', path: 'settings' }]);
  assert.deepEqual(cfg.locales, { list: ['bs', 'en'], strategy: 'none' });
  assert.ok(cfg.android.profiles.length >= 4);
  assert.equal(buildMatrixConfig(det, { scheme: 'other' }).app.scheme, 'other');
});

test('first run creates files; second run changes nothing (idempotent)', () => {
  const cwd = fixtureCopy('expo-router-app');
  const first = scaffold(cwd);
  assert.deepEqual(first.actions.map((a) => [a.id, a.action]), [
    ['matrix-config', 'create'], ['gitignore', 'create'], ['claude-md', 'create'], ['lock', 'create'],
  ]);
  const claude = read(cwd, 'CLAUDE.md');
  assert.ok(claude.startsWith(MARK_START));
  assert.match(claude, /mobile-kit:device-matrix-qa/);
  assert.match(claude, /Enabled modules: core, devices, matrix, testing, ui-ux, motion/);
  assert.doesNotMatch(claude, /\{\{/);
  assert.equal(read(cwd, '.gitignore'), 'qa-shots/\n');
  const lock = JSON.parse(read(cwd, '.mobile-kit.json'));
  assert.equal(lock.configPath, 'qa/device-matrix.json');
  assert.equal(lock.themeDir, 'src/theme');

  const second = scaffold(cwd);
  assert.ok(second.actions.every((a) => a.action === 'unchanged'), JSON.stringify(second.actions.map((a) => a.action)));
});

test('existing CLAUDE.md keeps its content; section is replaced in place', () => {
  const cwd = fixtureCopy('expo-router-app');
  fs.writeFileSync(path.join(cwd, 'CLAUDE.md'), `# My app\n\nOwn notes.\n\n${MARK_START}\nold\n${MARK_END}\n\n## Footer\n`);
  scaffold(cwd);
  const text = read(cwd, 'CLAUDE.md');
  assert.ok(text.startsWith('# My app\n\nOwn notes.\n\n' + MARK_START));
  assert.ok(text.endsWith(`${MARK_END}\n\n## Footer\n`));
  assert.doesNotMatch(text, /\nold\n/);
  assert.equal(text.split(MARK_START).length, 2);
});

test('new CLAUDE.md imports AGENTS.md when present', () => {
  const cwd = fixtureCopy('expo-router-app');
  fs.writeFileSync(path.join(cwd, 'AGENTS.md'), '# Agents\n');
  scaffold(cwd);
  assert.ok(read(cwd, 'CLAUDE.md').startsWith('@AGENTS.md\n\n' + MARK_START));
});

test('a changed matrix config is a conflict and is never overwritten without --overwrite', () => {
  const cwd = fixtureCopy('expo-router-app');
  scaffold(cwd);
  fs.writeFileSync(path.join(cwd, 'qa/device-matrix.json'), '{"mine":true}\n');
  const p = scaffold(cwd);
  assert.equal(p.actions.find((a) => a.id === 'matrix-config').action, 'conflict');
  assert.equal(read(cwd, 'qa/device-matrix.json'), '{"mine":true}\n');
  const forced = scaffold(cwd, { overwrite: ['matrix-config'] });
  assert.equal(forced.actions.find((a) => a.id === 'matrix-config').action, 'update');
  assert.match(read(cwd, 'qa/device-matrix.json'), /com\.example\.fixture/);
});

test('--only applies just the named actions', () => {
  const cwd = fixtureCopy('expo-router-app');
  scaffold(cwd, { only: ['gitignore'] });
  assert.ok(fs.existsSync(path.join(cwd, '.gitignore')));
  assert.ok(!fs.existsSync(path.join(cwd, 'CLAUDE.md')));
  assert.ok(!fs.existsSync(path.join(cwd, 'qa/device-matrix.json')));
});

test('theme templates only with --theme, into the theme dir that lacks spacing tokens', () => {
  const cwd = fixtureCopy('expo-router-app');
  const without = scaffold(cwd);
  assert.ok(!without.actions.some((a) => a.id === 'theme'));
  assert.match(without.todo.join('\n'), /src\/theme has no spacing tokens/);
  const withTheme = scaffold(cwd, { theme: true });
  assert.deepEqual(withTheme.actions.filter((a) => a.id === 'theme').map((a) => [a.path, a.action]), [
    ['src/theme/tokens.ts', 'create'], ['src/components/Screen.tsx', 'create'],
  ]);
  assert.match(read(cwd, 'src/components/Screen.tsx'), /from '\.\.\/theme\/tokens'/);
  assert.match(read(cwd, 'src/theme/tokens.ts'), /export const space/);
  // Now the theme dir has spacing tokens: nothing more to offer.
  assert.ok(!scaffold(cwd, { theme: true }).actions.some((a) => a.id === 'theme'));
});

test('missing app ids become todo items and empty config values', () => {
  const cwd = fixtureCopy('expo-router-app');
  fs.writeFileSync(path.join(cwd, 'app.json'), '{"expo":{"name":"x"}}');
  const p = scaffold(cwd);
  assert.equal(p.todo.filter((t) => /androidPackage|iosBundleId|scheme/.test(t)).length, 3);
  assert.equal(JSON.parse(read(cwd, 'qa/device-matrix.json')).app.androidPackage, '');
});

test('CLI: --dry-run writes nothing, conflict exits 2', () => {
  const cwd = fixtureCopy('expo-router-app');
  const dry = runScript('scaffold.mjs', ['--cwd', cwd, '--dry-run', '--no-expo-cli', '--json']);
  assert.equal(dry.code, 0);
  assert.equal(dry.json.dryRun, true);
  assert.ok(!fs.existsSync(path.join(cwd, 'CLAUDE.md')));
  assert.equal(runScript('scaffold.mjs', ['--cwd', cwd, '--no-expo-cli']).code, 0);
  fs.writeFileSync(path.join(cwd, 'qa/device-matrix.json'), '{}');
  assert.equal(runScript('scaffold.mjs', ['--cwd', cwd, '--no-expo-cli']).code, 2);
});

test('CLI without --modules reuses the lock modules', () => {
  const cwd = fixtureCopy('expo-router-app');
  assert.equal(runScript('scaffold.mjs', ['--cwd', cwd, '--no-expo-cli', '--modules', 'design']).code, 0);
  const again = runScript('scaffold.mjs', ['--cwd', cwd, '--no-expo-cli', '--dry-run', '--json']);
  assert.deepEqual(again.json.modules, ['core', 'design']);
  assert.ok(again.json.actions.every((a) => a.action === 'unchanged'));
});
