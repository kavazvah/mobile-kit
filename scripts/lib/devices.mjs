// Raw device backend: adb / emulator (Android) and xcrun simctl (iOS). Shared by device-control and device-matrix-qa.
// Functions throw on failure (Error with .stderr when a command failed); callers decide how to report.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// ───────────────────────── process helpers ─────────────────────────
export function sh(bin, args, opts = {}) {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...opts });
}
export function trySh(bin, args, opts) { try { return sh(bin, args, opts); } catch { return null; } }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Quote for the device-side shell (adb shell). */
export const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

// ───────────────────────── pure helpers (unit-tested) ─────────────────────────
/** px → dp (Android density-independent pixels). */
export function dp(px, dpi) { return Math.round((px * 160) / dpi); }

export function parseAdbDevices(out) {
  return out.split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((p) => p[1] === 'device').map((p) => p[0]);
}

/** Parse `wm size` + `wm density` output; the override wins over the physical value. */
export function parseWm(sizeOut, densOut) {
  const pick = (s, re) => s.match(new RegExp(`Override ${re}`)) || s.match(new RegExp(`Physical ${re}`));
  const sm = pick(sizeOut, 'size: (\\d+)x(\\d+)');
  const dm = pick(densOut, 'density: (\\d+)');
  if (!sm || !dm) throw new Error(`Cannot read display size/density:\n${sizeOut}\n${densOut}`);
  return { width: +sm[1], height: +sm[2], dpi: +dm[1] };
}

/** Heuristic audit from a uiautomator dump: small tap targets and content wider than the screen. */
export function parseUiDump(raw, disp, pkg) {
  let xml = raw;
  if (!xml || !xml.includes('<hierarchy')) return { ok: false, note: 'uiautomator dump failed (screen still animating?)', issues: [] };
  xml = xml.slice(xml.indexOf('<?xml') >= 0 ? xml.indexOf('<?xml') : xml.indexOf('<hierarchy'), xml.lastIndexOf('>') + 1);
  const issues = [];
  for (const m of xml.matchAll(/<node\b([^>]*)>/g)) {
    const a = {};
    for (const am of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) a[am[1]] = am[2];
    if (pkg && a.package && a.package !== pkg) continue;
    const b = (a.bounds || '').match(/\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/);
    if (!b) continue;
    const [x1, y1, x2, y2] = b.slice(1).map(Number);
    const w = dp(x2 - x1, disp.dpi), h = dp(y2 - y1, disp.dpi);
    const label = a.text || a['content-desc'] || a['resource-id'] || a.class;
    if (a.clickable === 'true' && w > 0 && h > 0 && (w < 48 || h < 48))
      issues.push({ type: 'small-touch-target', label, sizeDp: `${w}x${h}`, hint: 'Minimum 48x48dp (Android) / 44x44pt (iOS); use padding or hitSlop' });
    if (x1 < 0 || x2 > disp.width)
      issues.push({ type: 'horizontal-overflow', label, boundsPx: a.bounds, hint: 'Element extends past the screen edge; check flexShrink/flexWrap/fixed widths' });
  }
  return { ok: true, issues };
}

/** Deep link for a screen path, optionally with a locale query param. */
export function deepLink(scheme, screenPath, locale, param = 'lang') {
  const base = `${scheme}://${screenPath ?? ''}`;
  if (!locale) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${encodeURIComponent(param)}=${encodeURIComponent(locale)}`;
}

export function cmpVer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; }
  return 0;
}

// ───────────────────────── Android ─────────────────────────
export function adb(serial, ...a) { return sh('adb', ['-s', serial, ...a]); }

export function listAndroid() {
  const out = trySh('adb', ['devices']);
  if (out == null) throw new Error('adb not found. Add Android SDK platform-tools to PATH.');
  return parseAdbDevices(out);
}

/** The serial to use: explicit, else the first emulator, else the first device. */
export function androidSerial(explicit) {
  if (explicit) return explicit;
  const devs = listAndroid();
  if (!devs.length) throw new Error('No Android emulator running. List AVDs: emulator -list-avds, start one: emulator -avd <name>');
  return devs.find((d) => d.startsWith('emulator-')) || devs[0];
}

export function listAvds() {
  const out = trySh('emulator', ['-list-avds']);
  if (out == null) throw new Error('emulator not on PATH (add $ANDROID_HOME/emulator).');
  return out.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('INFO'));
}

/** Start an AVD in the background and return its serial once adb sees it. */
export async function bootAvd(name, { headless = false, timeoutMs = 120000 } = {}) {
  if (!listAvds().includes(name)) throw new Error(`Unknown AVD "${name}". Available: ${listAvds().join(', ') || 'none'}`);
  for (const s of listAndroid().filter((d) => d.startsWith('emulator-')))
    if ((trySh('adb', ['-s', s, 'emu', 'avd', 'name']) || '').split('\n')[0].trim() === name) return s;
  const args = ['-avd', name, ...(headless ? ['-no-window', '-no-audio', '-no-boot-anim'] : [])];
  spawn('emulator', args, { detached: true, stdio: 'ignore' }).unref();
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    for (const s of listAndroid().filter((d) => d.startsWith('emulator-')))
      if ((trySh('adb', ['-s', s, 'emu', 'avd', 'name']) || '').split('\n')[0].trim() === name) return s;
    await sleep(2000);
  }
  throw new Error(`AVD "${name}" did not appear in adb within ${timeoutMs / 1000}s`);
}

export async function waitForBoot(serial, { timeoutMs = 180000 } = {}) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if ((trySh('adb', ['-s', serial, 'shell', 'getprop', 'sys.boot_completed']) || '').trim() === '1') return true;
    await sleep(2000);
  }
  throw new Error(`${serial} did not finish booting within ${timeoutMs / 1000}s`);
}

export const NAV = {
  gestural: 'com.android.internal.systemui.navbar.gestural',
  threebutton: 'com.android.internal.systemui.navbar.threebutton',
};
export function setNav(serial, mode) {
  if (!NAV[mode]) throw new Error(`Unknown nav mode "${mode}" (use gestural | threebutton)`);
  if (trySh('adb', ['-s', serial, 'shell', 'cmd', 'overlay', 'enable-exclusive', '--category', NAV[mode]]) == null)
    console.warn(`! Could not switch navigation to ${mode} on this image`);
}

/** Reshape the emulator: profile = {width,height,dpi}; variant = {fontScale, dark, nav}. */
export function applyAndroid(serial, profile, variant = {}, defaultNav) {
  if (profile) {
    adb(serial, 'shell', 'wm', 'size', `${profile.width}x${profile.height}`);
    adb(serial, 'shell', 'wm', 'density', String(profile.dpi));
  }
  adb(serial, 'shell', 'settings', 'put', 'system', 'font_scale', String(variant.fontScale ?? 1.0));
  adb(serial, 'shell', 'cmd', 'uimode', 'night', variant.dark ? 'yes' : 'no');
  const nav = variant.nav || defaultNav;
  if (nav) setNav(serial, nav);
}

export function resetAndroid(serial, defaultNav = 'gestural') {
  adb(serial, 'shell', 'wm', 'size', 'reset');
  adb(serial, 'shell', 'wm', 'density', 'reset');
  adb(serial, 'shell', 'settings', 'put', 'system', 'font_scale', '1.0');
  adb(serial, 'shell', 'cmd', 'uimode', 'night', 'no');
  setNav(serial, defaultNav);
}

export function androidDisplay(serial) {
  return parseWm(adb(serial, 'shell', 'wm', 'size'), adb(serial, 'shell', 'wm', 'density'));
}

export function auditAndroid(serial, disp, pkg) {
  return parseUiDump(trySh('adb', ['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty']), disp, pkg);
}

/** Per-app locale (Android 13+). No tag resets the app to the system locale. */
export function setAppLocale(serial, pkg, tag) {
  adb(serial, 'shell', 'cmd', 'locale', 'set-app-locales', pkg, ...(tag ? ['--locales', tag] : []));
}

// ───────────────────────── iOS ─────────────────────────
export function xc(...a) { return sh('xcrun', ['simctl', ...a]); }
export function requireXcrun() {
  if (trySh('xcrun', ['simctl', 'help']) == null) throw new Error('xcrun simctl not available (iOS needs macOS + Xcode).');
}

export function listIosSims() {
  const j = JSON.parse(xc('list', 'devices', '-j'));
  return Object.entries(j.devices).flatMap(([rt, arr]) => arr.map((d) => ({ ...d, runtime: rt })));
}

/** The booted simulator's udid, or null. */
export function bootedSim() {
  return listIosSims().find((s) => s.state === 'Booted')?.udid ?? null;
}

/**
 * Find or create a simulator named "QA <name>" for the first device type in `match`, on the newest
 * runtime that supports it. Returns its udid, or null (with a warning) if none fits.
 */
export function ensureSim(match, { name = match[0] } = {}) {
  const qaName = `QA ${name}`;
  const existing = listIosSims().find((s) => s.name === qaName && s.isAvailable !== false);
  if (existing) return existing.udid;
  const types = JSON.parse(xc('list', 'devicetypes', '-j')).devicetypes;
  const type = match.map((n) => types.find((t) => t.name === n)).find(Boolean);
  if (!type) { console.warn(`! No device type matching ${JSON.stringify(match)}; skipping "${name}". Run: xcrun simctl list devicetypes`); return null; }
  const rts = JSON.parse(xc('list', 'runtimes', '-j')).runtimes
    .filter((r) => r.isAvailable !== false && (r.platform === 'iOS' || /iOS/.test(r.identifier)))
    .sort((a, b) => cmpVer(b.version, a.version));
  const rt = rts.find((r) => !r.supportedDeviceTypes || r.supportedDeviceTypes.some((s) => s.identifier === type.identifier));
  if (!rt) { console.warn(`! No iOS runtime supports ${type.name}; skipping.`); return null; }
  console.log(`+ Creating simulator "${qaName}" (${type.name}, iOS ${rt.version})`);
  return xc('create', qaName, type.identifier, rt.identifier).trim();
}

/** Boot (no-op if booted), wait until ready, and set a clean status bar. */
export async function bootSim(udid) {
  trySh('xcrun', ['simctl', 'boot', udid]);
  xc('bootstatus', udid, '-b');
  trySh('xcrun', ['simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100']);
}

export function applyIos(udid, variant = {}) {
  xc('ui', udid, 'appearance', variant.dark ? 'dark' : 'light');
  xc('ui', udid, 'content_size', variant.contentSize || 'large');
}

export function resetIos(udid) {
  applyIos(udid, {});
  trySh('xcrun', ['simctl', 'status_bar', udid, 'clear']);
}

// ───────────────────────── cross-platform actions ─────────────────────────
export function install(platform, target, appPath) {
  if (platform === 'ios') return void xc('install', target, appPath);
  adb(target, 'install', '-r', appPath);
}

export function terminate(platform, target, appId) {
  if (platform === 'ios') return void trySh('xcrun', ['simctl', 'terminate', target, appId]);
  trySh('adb', ['-s', target, 'shell', 'am', 'force-stop', appId]);
}

export function launch(platform, target, appId) {
  if (platform === 'ios') return void xc('launch', target, appId);
  adb(target, 'shell', 'monkey', '-p', appId, '-c', 'android.intent.category.LAUNCHER', '1');
}

/** Open a URL; on Android, `appId` pins the intent to the app. */
export function openUrl(platform, target, url, appId) {
  if (platform === 'ios') return void xc('openurl', target, url);
  adb(target, 'shell', `am start -W -a android.intent.action.VIEW -d ${q(url)}${appId ? ` ${appId}` : ''}`);
}

export function screenshot(platform, target, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (platform === 'ios') return void xc('io', target, 'screenshot', file);
  const buf = execFileSync('adb', ['-s', target, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 });
  fs.writeFileSync(file, buf);
}

const LOGCAT_LEVEL = { verbose: 'V', debug: 'D', info: 'I', warn: 'W', error: 'E' };

/**
 * Recent log lines of an app (a snapshot, not a stream).
 * Android: logcat filtered by the app's pid. iOS: `log show` for the app's executable.
 */
export function logs(platform, target, { appId, level = 'info', lines = 100, since = '5m' } = {}) {
  if (platform === 'ios') {
    const info = appId ? trySh('xcrun', ['simctl', 'appinfo', target, appId]) : null;
    const exe = info?.match(/CFBundleExecutable\s*=\s*"?([^";\n]+)"?;/)?.[1];
    const predicate = exe ? `process == "${exe}"` : appId ? `subsystem BEGINSWITH "${appId}"` : 'TRUE';
    const lvl = level === 'debug' || level === 'verbose' ? ['--debug', '--info'] : level === 'info' ? ['--info'] : [];
    const out = xc('spawn', target, 'log', 'show', '--last', since, '--style', 'compact', ...lvl, '--predicate', predicate);
    return out.trimEnd().split('\n').slice(-lines).join('\n');
  }
  const args = ['-s', target, 'logcat', '-d', '-t', String(lines)];
  if (appId) {
    const pid = (trySh('adb', ['-s', target, 'shell', 'pidof', '-s', appId]) || '').trim();
    if (!pid) throw new Error(`${appId} is not running on ${target}`);
    args.push(`--pid=${pid}`);
  }
  args.push(`*:${LOGCAT_LEVEL[level] ?? 'I'}`);
  return sh('adb', args).trimEnd();
}
