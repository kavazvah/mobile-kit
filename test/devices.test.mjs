import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, tmpDir, runScript } from './helpers.mjs';
import * as dev from '../scripts/lib/devices.mjs';

const SHIMS = path.join(ROOT, 'test', 'shims');
const skipWin = { skip: process.platform === 'win32' };

/** Run fn with the fake adb/xcrun first on PATH; returns the logged calls. */
function withShims(fn) {
  const state = tmpDir('mk-state-');
  const saved = { PATH: process.env.PATH, MK_SHIM_STATE: process.env.MK_SHIM_STATE };
  process.env.PATH = `${SHIMS}${path.delimiter}${process.env.PATH}`;
  process.env.MK_SHIM_STATE = state;
  try { fn(state); } finally { Object.assign(process.env, saved); if (saved.MK_SHIM_STATE === undefined) delete process.env.MK_SHIM_STATE; }
  try { return fs.readFileSync(path.join(state, 'calls.log'), 'utf8').trim().split('\n'); } catch { return []; }
}

test('dp conversion', () => {
  assert.equal(dev.dp(720, 320), 360);
  assert.equal(dev.dp(1080, 420), 411);
  assert.equal(dev.dp(1344, 480), 448);
  assert.equal(dev.dp(2208, 420), 841);
});

test('parseAdbDevices keeps only ready devices', () => {
  assert.deepEqual(dev.parseAdbDevices('List of devices attached\nemulator-5554\tdevice\nR58M\tunauthorized\nemulator-5556\tdevice\n'), ['emulator-5554', 'emulator-5556']);
});

test('parseWm prefers the override', () => {
  assert.deepEqual(dev.parseWm('Physical size: 1080x2400\nOverride size: 720x1520', 'Physical density: 420\nOverride density: 320'), { width: 720, height: 1520, dpi: 320 });
  assert.deepEqual(dev.parseWm('Physical size: 1080x2400', 'Physical density: 420'), { width: 1080, height: 2400, dpi: 420 });
  assert.throws(() => dev.parseWm('', ''), /Cannot read/);
});

test('parseUiDump: small targets, overflow, other packages ignored, failed dump', () => {
  const xml = `noise<?xml version="1.0"?><hierarchy rotation="0">
    <node text="Save" clickable="true" package="com.x" bounds="[0,0][64,64]" />
    <node text="Big" clickable="true" package="com.x" bounds="[0,100][200,300]" />
    <node content-desc="Wide" clickable="false" package="com.x" bounds="[-10,400][700,500]" />
    <node text="Other app" clickable="true" package="com.other" bounds="[0,0][10,10]" />
  </hierarchy>trailing`;
  const r = dev.parseUiDump(xml, { width: 640, height: 1400, dpi: 320 }, 'com.x');
  assert.equal(r.ok, true);
  assert.deepEqual(r.issues.map((i) => [i.type, i.label, i.sizeDp ?? i.boundsPx]), [
    ['small-touch-target', 'Save', '32x32'],
    ['horizontal-overflow', 'Wide', '[-10,400][700,500]'],
  ]);
  assert.equal(dev.parseUiDump('ERROR: could not get idle state', {}, 'com.x').ok, false);
});

test('deepLink adds the locale param correctly', () => {
  assert.equal(dev.deepLink('fx', 'settings'), 'fx://settings');
  assert.equal(dev.deepLink('fx', '', 'de'), 'fx://?lang=de');
  assert.equal(dev.deepLink('fx', 'search?q=a', 'pt-BR', 'locale'), 'fx://search?q=a&locale=pt-BR');
  assert.equal(dev.deepLink('fx', null), 'fx://');
});

test('cmpVer', () => {
  assert.ok(dev.cmpVer('26.0', '18.4') > 0);
  assert.equal(dev.cmpVer('18.0', '18.0.0'), 0);
});

test('android actions issue the expected adb commands', skipWin, () => {
  const calls = withShims(() => {
    const s = dev.androidSerial();
    assert.equal(s, 'emulator-5554');
    dev.applyAndroid(s, { width: 720, height: 1520, dpi: 320 }, { fontScale: 1.3, dark: true }, 'gestural');
    assert.deepEqual(dev.androidDisplay(s), { width: 720, height: 1520, dpi: 320 });
    dev.resetAndroid(s);
    assert.deepEqual(dev.androidDisplay(s), { width: 1080, height: 2400, dpi: 420 });
    dev.openUrl('android', s, "fx://it's", 'com.x');
    dev.setAppLocale(s, 'com.x', 'de');
    dev.setAppLocale(s, 'com.x');
    assert.match(dev.logs('android', s, { appId: 'com.x', level: 'error', lines: 5 }), /ReactNativeJS/);
  });
  for (const c of [
    'adb -s emulator-5554 shell wm size 720x1520',
    'adb -s emulator-5554 shell wm density 320',
    'adb -s emulator-5554 shell settings put system font_scale 1.3',
    'adb -s emulator-5554 shell cmd uimode night yes',
    'adb -s emulator-5554 shell cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural',
    'adb -s emulator-5554 shell wm size reset',
    "adb -s emulator-5554 shell am start -W -a android.intent.action.VIEW -d 'fx://it'\\''s' com.x",
    'adb -s emulator-5554 shell cmd locale set-app-locales com.x --locales de',
    'adb -s emulator-5554 shell cmd locale set-app-locales com.x',
    'adb -s emulator-5554 logcat -d -t 5 --pid=4242 *:E',
  ]) assert.ok(calls.includes(c), `missing call: ${c}`);
});

test('ios: ensureSim reuses QA sims and creates missing ones on the newest runtime', skipWin, () => {
  let created;
  const calls = withShims(() => {
    assert.equal(dev.ensureSim(['iPhone 17'], { name: 'base' }), 'UDID-BASE');
    created = dev.ensureSim(['iPhone 99', 'iPhone SE (3rd generation)'], { name: 'se' });
    assert.equal(dev.ensureSim(['iPhone 99'], { name: 'none' }), null);
    assert.equal(dev.bootedSim(), 'UDID-BOOTED');
  });
  assert.equal(created, 'UDID-QA-se');
  assert.ok(calls.includes('xcrun simctl create QA se com.apple.CoreSimulator.SimDeviceType.iPhone-SE-3rd-generation com.apple.CoreSimulator.SimRuntime.iOS-26-0'));
});

test('ios: logs use the app executable name', skipWin, () => {
  const calls = withShims(() => { assert.match(dev.logs('ios', 'UDID-1', { appId: 'com.x', lines: 1 }), /line2/); });
  assert.ok(calls.includes('xcrun simctl spawn UDID-1 log show --last 5m --style compact --info --predicate process == "MyApp"'));
});

test('device.mjs CLI with shims', skipWin, () => {
  const state = tmpDir('mk-state-');
  const env = { PATH: `${SHIMS}${path.delimiter}${process.env.PATH}`, MK_SHIM_STATE: state };
  const file = path.join(state, 'shot.png');
  const shot = runScript('device.mjs', ['screenshot', file, '--json'], { env });
  assert.equal(shot.code, 0, shot.stderr);
  assert.deepEqual(shot.json, { platform: 'android', target: 'emulator-5554', file });
  assert.equal(fs.readFileSync(file, 'utf8'), 'PNG-FAKE');
  const open = runScript('device.mjs', ['open', 'fx://a', '--platform', 'ios', '--json'], { env });
  assert.deepEqual(open.json, { platform: 'ios', target: 'UDID-BOOTED', opened: 'fx://a' });
  const logs = runScript('device.mjs', ['logs', '--app', 'com.x', '--json'], { env });
  assert.equal(logs.json.lines.length, 1);
  assert.equal(runScript('device.mjs', ['launch'], { env }).code, 1);
  assert.equal(runScript('device.mjs', ['nope'], { env }).code, 1);
  assert.match(runScript('device.mjs', ['--help']).stdout, /Usage: node device.mjs/);
});

test('device.mjs reports a missing adb cleanly', skipWin, () => {
  const r = runScript('device.mjs', ['launch', 'com.x'], { env: { PATH: tmpDir() } });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /adb not found/);
});

test('record: Android screenrecord + pull, iOS recordVideo stopped with SIGINT', skipWin, () => {
  const state = tmpDir('mk-state-');
  const env = { PATH: `${SHIMS}${path.delimiter}${process.env.PATH}`, MK_SHIM_STATE: state };
  const a = runScript('device.mjs', ['record', path.join(state, 'a.mp4'), '--seconds', '2', '--json'], { env });
  assert.equal(a.code, 0, a.stderr);
  assert.equal(fs.readFileSync(path.join(state, 'a.mp4'), 'utf8'), 'MP4-FAKE');
  const i = runScript('device.mjs', ['record', path.join(state, 'i.mov'), '--seconds', '1', '--platform', 'ios', '--json'], { env });
  assert.equal(i.code, 0, i.stderr);
  assert.deepEqual(i.json, { platform: 'ios', target: 'UDID-BOOTED', file: path.join(state, 'i.mov'), seconds: 1 });
  assert.equal(fs.readFileSync(path.join(state, 'i.mov'), 'utf8'), 'MOV-FAKE');
  const calls = fs.readFileSync(path.join(state, 'calls.log'), 'utf8');
  assert.match(calls, /adb -s emulator-5554 shell screenrecord --time-limit 2 \/sdcard\/mk-record\.mp4/);
  assert.match(calls, /adb -s emulator-5554 shell rm -f \/sdcard\/mk-record\.mp4/);
  assert.match(calls, /xcrun simctl io UDID-BOOTED recordVideo --codec=h264 --force /);
  assert.equal(runScript('device.mjs', ['record', 'x.mp4', '--seconds', '0'], { env }).code, 1);
});
