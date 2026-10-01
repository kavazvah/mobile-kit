import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, tmpDir } from './helpers.mjs';
import { localePlan, renderReport } from '../skills/device-matrix-qa/scripts/matrix.mjs';

const MATRIX = path.join(ROOT, 'skills', 'device-matrix-qa', 'scripts', 'matrix.mjs');
const SHIMS = path.join(ROOT, 'test', 'shims');
const EXAMPLE = path.join(ROOT, 'skills', 'device-matrix-qa', 'assets', 'device-matrix.example.json');
const skipWin = { skip: process.platform === 'win32' };

/** A temp project with a fast matrix config; `patch` edits the config. */
function project(patch = (c) => c) {
  const cwd = tmpDir('mk-matrix-');
  const cfg = JSON.parse(fs.readFileSync(EXAMPLE, 'utf8'));
  cfg.app = { androidPackage: 'com.x', iosBundleId: 'com.x', scheme: 'fx' };
  cfg.screens = [{ name: 'home', path: '' }, { name: 'settings', path: 'settings' }];
  cfg.settleMs = 0;
  cfg.android.applySettleMs = 0;
  fs.mkdirSync(path.join(cwd, 'qa'));
  fs.writeFileSync(path.join(cwd, 'qa', 'device-matrix.json'), JSON.stringify(patch(cfg)));
  return cwd;
}

function matrix(cwd, args, extraEnv = {}) {
  const state = path.join(cwd, '.shim');
  const res = spawnSync(process.execPath, [MATRIX, ...args], {
    cwd, encoding: 'utf8',
    env: { ...process.env, PATH: `${SHIMS}${path.delimiter}${process.env.PATH}`, MK_SHIM_STATE: state, ...extraEnv },
  });
  let json; try { json = JSON.parse(res.stdout); } catch { /* human output */ }
  let calls = []; try { calls = fs.readFileSync(path.join(state, 'calls.log'), 'utf8').trim().split('\n'); } catch { /* none */ }
  return { ...res, json, calls };
}

test('android-list shows dp math for every profile', () => {
  const r = matrix(project(), ['android-list']);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /small-360\s+360x760dp\s+720x1520@320/);
  assert.match(r.stdout, /standard-411\s+411x914dp/);
  assert.match(r.stdout, /fold-inner\s+841x701dp.*\(optional\)/);
  assert.match(r.stdout, /stress on small-360: font-130, font-200, dark, 3button/);
});

test('help and unknown command', () => {
  assert.equal(matrix(project(), []).status, 0);
  assert.equal(matrix(project(), ['nope']).status, 1);
});

test('shoot android: jobs, nav reset between variants, final reset, --json summary', skipWin, () => {
  const cwd = project((c) => { c.android.stress.variants = [{ name: '3button', nav: 'threebutton' }, { name: 'dark', dark: true }]; return c; });
  const r = matrix(cwd, ['shoot', '--profiles', 'small-360,standard-411', '--out', 'run', '--json']);
  assert.equal(r.status, 0, r.stderr);
  const navs = r.calls.filter((c) => c.includes('enable-exclusive')).map((c) => c.split('.').pop());
  // small, standard, small+3button, small+dark, then the final reset.
  assert.deepEqual(navs, ['gestural', 'gestural', 'threebutton', 'gestural', 'gestural']);
  assert.equal(r.calls.filter((c) => c.endsWith('wm size reset')).length, 1);
  assert.equal(r.json.count, 8);
  assert.deepEqual([...new Set(r.json.entries.map((e) => e.profile))], ['small-360', 'standard-411', 'small-360+3button', 'small-360+dark']);
  const e = r.json.entries[0];
  assert.equal(e.file, 'android/small-360/home.png');
  assert.equal(e.sizeDp, '360x760');
  assert.ok(fs.existsSync(e.path) && fs.existsSync(e.audit));
  assert.ok(fs.existsSync(r.json.index));
  assert.ok(r.calls.includes("adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW -d 'fx://settings' com.x"));
  assert.match(r.stderr, /android emulator reset/, 'progress goes to stderr in --json mode');
});

test('shoot android: audit hints are counted from the ui dump', skipWin, () => {
  const cwd = project();
  const dump = path.join(cwd, 'dump.xml');
  fs.writeFileSync(dump, '<?xml version="1.0"?><hierarchy><node text="x" clickable="true" package="com.x" bounds="[0,0][40,40]" /></hierarchy>');
  const r = matrix(cwd, ['shoot', '--profiles', 'small-360', '--no-stress', '--screens', 'home', '--out', 'run', '--json'], { MK_SHIM_UIDUMP: dump });
  assert.equal(r.json.entries[0].issues, 1);
  const audit = JSON.parse(fs.readFileSync(r.json.entries[0].audit, 'utf8'));
  assert.equal(audit.issues[0].sizeDp, '20x20');
});

test('locales: deeplink-param adds ?lang and per-locale folders', skipWin, () => {
  const cwd = project((c) => ({ ...c, locales: { list: ['en', 'de'], strategy: 'deeplink-param' } }));
  const r = matrix(cwd, ['shoot', '--profiles', 'small-360', '--no-stress', '--out', 'run', '--json']);
  assert.deepEqual(r.json.entries.map((e) => e.file), [
    'android/small-360/en/home.png', 'android/small-360/en/settings.png',
    'android/small-360/de/home.png', 'android/small-360/de/settings.png',
  ]);
  assert.ok(r.calls.includes("adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW -d 'fx://settings?lang=de' com.x"));
  assert.ok(!r.calls.some((c) => c.includes('set-app-locales')));
});

test('locales: android-app-locale sets and resets the app locale; --locales filters', skipWin, () => {
  const cwd = project((c) => ({ ...c, locales: { list: ['en', 'de', 'bs'], strategy: 'android-app-locale' } }));
  const r = matrix(cwd, ['shoot', '--profiles', 'small-360', '--no-stress', '--screens', 'home', '--locales', 'de,bs', '--out', 'run', '--json']);
  const loc = r.calls.filter((c) => c.includes('set-app-locales'));
  assert.deepEqual(loc, [
    'adb -s emulator-5554 shell cmd locale set-app-locales com.x --locales de',
    'adb -s emulator-5554 shell cmd locale set-app-locales com.x --locales bs',
    'adb -s emulator-5554 shell cmd locale set-app-locales com.x',
  ]);
  assert.deepEqual(r.json.entries.map((e) => e.file), ['android/small-360/de/home.png', 'android/small-360/bs/home.png']);
  assert.ok(r.calls.includes("adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW -d 'fx://' com.x"), 'no ?lang with app-locale');
});

test('locales: a single locale keeps the old path layout', skipWin, () => {
  const cwd = project((c) => ({ ...c, locales: { list: ['en'], strategy: 'deeplink-param', param: 'locale' } }));
  const r = matrix(cwd, ['shoot', '--profiles', 'small-360', '--no-stress', '--screens', 'home', '--out', 'run', '--json']);
  assert.equal(r.json.entries[0].file, 'android/small-360/home.png');
  assert.equal(r.json.entries[0].locale, 'en');
  assert.ok(r.calls.some((c) => c.includes("-d 'fx://?locale=en'")));
});

test('localePlan: iOS falls back from android-app-locale to deeplink-param', () => {
  const cfg = { locales: { list: ['en', 'de'], strategy: 'android-app-locale' } };
  assert.equal(localePlan(cfg, 'ios').strategy, 'deeplink-param');
  assert.equal(localePlan(cfg, 'android').strategy, 'android-app-locale');
  assert.deepEqual(localePlan({}, 'android'), { strategy: 'none', locales: [null], subdir: false });
});

test('shoot ios with locales: openurl with ?lang, screenshots, simulator restored', skipWin, () => {
  const cwd = project((c) => ({ ...c, locales: { list: ['en', 'de'], strategy: 'android-app-locale' } }));
  const r = matrix(cwd, ['shoot', '--platform', 'ios', '--profiles', 'base', '--screens', 'settings', '--out', 'run', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.json.entries.map((e) => e.file), ['ios/base/en/settings.png', 'ios/base/de/settings.png']);
  assert.ok(r.calls.includes('xcrun simctl openurl UDID-BASE fx://settings?lang=de'));
  assert.ok(r.calls.includes('xcrun simctl status_bar UDID-BASE clear'));
  assert.ok(r.calls.includes('xcrun simctl shutdown UDID-BASE'));
  assert.match(r.stderr, /falls back|deep-link parameter/);
});

test('capture --json (android) and missing config', skipWin, () => {
  const cwd = project();
  const r = matrix(cwd, ['capture', '--name', 'x', '--json']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.sizeDp, '411x914');
  assert.deepEqual(r.json.issues, []);
  assert.ok(fs.existsSync(r.json.file) && fs.existsSync(r.json.audit));
  const empty = tmpDir();
  const shoot = matrix(empty, ['shoot']);
  assert.equal(shoot.status, 1);
  assert.match(shoot.stderr, /Config not found/);
});

test('report generator: one row per screen, locale and dp in captions, escaping', () => {
  const html = renderReport('/x/run-1', [
    { platform: 'android', profile: 'small-360', locale: 'de', screen: 'home', file: 'android/small-360/de/home.png', sizeDp: '360x760', issues: 2 },
    { platform: 'ios', profile: 'se', screen: 'home', file: 'ios/se/home.png' },
    { platform: 'ios', profile: 'se', screen: '<b>', file: 'ios/se/b.png' },
  ]);
  assert.equal((html.match(/<section>/g) || []).length, 2);
  assert.match(html, /<b>android<\/b> small-360 · de · 360x760dp · <span class="w">2 hint\(s\)<\/span>/);
  assert.match(html, /<h2>&lt;b&gt;<\/h2>/);
  assert.match(html, /Device matrix · run-1/);
});

test('report command rebuilds index.html from manifest.json', () => {
  const cwd = tmpDir();
  fs.mkdirSync(path.join(cwd, 'run'));
  fs.writeFileSync(path.join(cwd, 'run', 'manifest.json'), JSON.stringify({ entries: [{ platform: 'ios', profile: 'se', screen: 'home', file: 'a.png' }] }));
  assert.equal(matrix(cwd, ['report', 'run']).status, 0);
  assert.match(fs.readFileSync(path.join(cwd, 'run', 'index.html'), 'utf8'), /a\.png/);
});
