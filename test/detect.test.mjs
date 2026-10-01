import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { detect } from '../scripts/detect.mjs';
import { FIXTURES, tmpDir, runScript } from './helpers.mjs';

test('expo-router fixture', () => {
  const d = detect(path.join(FIXTURES, 'expo-router-app'), { expoCli: false });
  assert.equal(d.ok, true);
  assert.equal(d.isExpo, true);
  assert.equal(d.expoSdk, 54);
  assert.equal(d.router, true);
  assert.equal(d.reanimated, '4.1.1');
  assert.equal(d.gestureHandler, '2.28.0');
  assert.equal(d.skia, null);
  assert.deepEqual(d.platforms, { android: false, ios: false, cng: true });
  assert.equal(d.packageManager, 'npm');
  assert.deepEqual(d.appIds, { android: 'com.example.fixture', ios: 'com.example.fixture' });
  assert.equal(d.scheme, 'fixture');
  assert.deepEqual(d.i18n.locales, ['bs', 'en']);
  assert.ok(d.i18n.libs.includes('i18next'));
  assert.equal(d.themeDir, 'src/theme');
  assert.equal(d.theme.hasSpacingTokens, false);
  assert.equal(d.hasJest, true);
  assert.equal(d.hasMaestro, false);
  assert.equal(d.routesRoot, 'app');
  assert.deepEqual(d.routes.map((r) => [r.path, r.dynamic]), [['', false], ['login', false], ['profile/[id]', true], ['settings', false]]);
  assert.deepEqual(d.warnings, []);
});

test('bare RN fixture: ids and scheme from native files, warning', () => {
  const d = detect(path.join(FIXTURES, 'bare-rn-app'));
  assert.equal(d.isExpo, false);
  assert.equal(d.isReactNative, true);
  assert.equal(d.packageManager, 'yarn');
  assert.deepEqual(d.appIds, { android: 'com.example.bare', ios: 'com.example.bare.ios' });
  assert.equal(d.scheme, 'bareapp');
  assert.deepEqual(d.platforms, { android: true, ios: true, cng: false });
  assert.equal(d.routes.length, 0);
  assert.match(d.warnings.join('\n'), /Bare React Native/);
});

test('no package.json', () => {
  const d = detect(tmpDir());
  assert.equal(d.ok, false);
  const r = runScript('detect.mjs', ['--cwd', tmpDir(), '--json']);
  assert.equal(r.code, 1);
  assert.equal(r.json.ok, false);
});

test('CLI --json prints parseable output', () => {
  const r = runScript('detect.mjs', ['--cwd', path.join(FIXTURES, 'expo-router-app'), '--json', '--no-expo-cli']);
  assert.equal(r.code, 0);
  assert.equal(r.json.scheme, 'fixture');
  assert.equal(r.json.configSource, 'static');
});

test('--help', () => {
  const r = runScript('detect.mjs', ['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Usage: node detect.mjs/);
});
