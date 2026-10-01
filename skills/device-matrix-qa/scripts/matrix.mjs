#!/usr/bin/env node
// Device Matrix QA: reshape Android emulators, drive iOS simulators, capture screenshots + audits.
// Zero dependencies. Requires Node 18+, adb (Android) and/or Xcode's xcrun (iOS, macOS only).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = parseFlags(argv.slice(1));

function parseFlags(a) {
  const f = { _: [] };
  for (let i = 0; i < a.length; i++) {
    const t = a[i];
    if (t.startsWith('--')) {
      const k = t.slice(2);
      const n = a[i + 1];
      if (n === undefined || n.startsWith('--')) f[k] = true;
      else { f[k] = n; i++; }
    } else f._.push(t);
  }
  return f;
}

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }
function sh(bin, args, opts = {}) {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 << 20, ...opts });
}
function trySh(bin, args, opts) { try { return sh(bin, args, opts); } catch { return null; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`; // quote for the device-side shell

function configPath() { return flags.config || 'qa/device-matrix.json'; }
function loadConfig() {
  const p = configPath();
  if (!fs.existsSync(p)) die(`Config not found: ${p}. Run: node ${path.relative(process.cwd(), SKILL_DIR)}/scripts/matrix.mjs init`);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function stamp() {
  const d = new Date(); const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}_${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
function dp(px, dpi) { return Math.round((px * 160) / dpi); }

// ───────────────────────── Android ─────────────────────────
function adb(serial, ...a) { return sh('adb', ['-s', serial, ...a]); }
function androidSerial() {
  if (flags.serial) return flags.serial;
  const out = trySh('adb', ['devices']);
  if (out == null) die('adb not found. Add Android SDK platform-tools to PATH.');
  const devs = out.split('\n').slice(1).map((l) => l.trim().split(/\s+/)).filter((p) => p[1] === 'device').map((p) => p[0]);
  if (!devs.length) die('No Android emulator running. List AVDs: emulator -list-avds, start one: emulator -avd <name>');
  return devs.find((d) => d.startsWith('emulator-')) || devs[0];
}
const NAV = {
  gestural: 'com.android.internal.systemui.navbar.gestural',
  threebutton: 'com.android.internal.systemui.navbar.threebutton',
};
function setNav(serial, mode) {
  if (!NAV[mode]) die(`Unknown nav mode "${mode}" (use gestural | threebutton)`);
  if (trySh('adb', ['-s', serial, 'shell', 'cmd', 'overlay', 'enable-exclusive', '--category', NAV[mode]]) == null)
    console.warn(`! Could not switch navigation to ${mode} on this image`);
}
function applyAndroid(serial, profile, variant = {}, defaultNav) {
  if (profile) {
    adb(serial, 'shell', 'wm', 'size', `${profile.width}x${profile.height}`);
    adb(serial, 'shell', 'wm', 'density', String(profile.dpi));
  }
  adb(serial, 'shell', 'settings', 'put', 'system', 'font_scale', String(variant.fontScale ?? 1.0));
  adb(serial, 'shell', 'cmd', 'uimode', 'night', variant.dark ? 'yes' : 'no');
  const nav = variant.nav || defaultNav;
  if (nav) setNav(serial, nav);
}
function resetAndroid(serial, cfg) {
  adb(serial, 'shell', 'wm', 'size', 'reset');
  adb(serial, 'shell', 'wm', 'density', 'reset');
  adb(serial, 'shell', 'settings', 'put', 'system', 'font_scale', '1.0');
  adb(serial, 'shell', 'cmd', 'uimode', 'night', 'no');
  setNav(serial, cfg?.android?.defaultNav || 'gestural');
}
function androidDisplay(serial) {
  const size = adb(serial, 'shell', 'wm', 'size');
  const dens = adb(serial, 'shell', 'wm', 'density');
  const pick = (s, re) => { const o = s.match(new RegExp(`Override ${re}`)); const p = s.match(new RegExp(`Physical ${re}`)); return (o || p); };
  const sm = pick(size, 'size: (\\d+)x(\\d+)');
  const dm = pick(dens, 'density: (\\d+)');
  return { width: +sm[1], height: +sm[2], dpi: +dm[1] };
}
function openAndroid(serial, cfg, screen) {
  const pkg = cfg.app.androidPackage;
  if (cfg.android?.relaunch) adb(serial, 'shell', 'am', 'force-stop', pkg);
  if (screen && screen.path != null && cfg.app.scheme) {
    const url = `${cfg.app.scheme}://${screen.path}`;
    adb(serial, 'shell', `am start -W -a android.intent.action.VIEW -d ${q(url)} ${pkg}`);
  } else {
    adb(serial, 'shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1');
  }
}
function screenshotAndroid(serial, file) {
  const buf = execFileSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 });
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}
// Heuristic audit from the accessibility tree: small tap targets, content wider than the screen.
function auditAndroid(serial, disp, pkg) {
  let xml = trySh('adb', ['-s', serial, 'exec-out', 'uiautomator', 'dump', '/dev/tty']);
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

// ───────────────────────── iOS ─────────────────────────
function xc(...a) { return sh('xcrun', ['simctl', ...a]); }
function requireXcrun() { if (trySh('xcrun', ['simctl', 'help']) == null) die('xcrun simctl not available (iOS needs macOS + Xcode).'); }
function cmpVer(a, b) { const pa = a.split('.').map(Number), pb = b.split('.').map(Number); for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d; } return 0; }
function iosSims() {
  const j = JSON.parse(xc('list', 'devices', '-j'));
  return Object.entries(j.devices).flatMap(([rt, arr]) => arr.map((d) => ({ ...d, runtime: rt })));
}
function ensureSim(dev) {
  const qaName = `QA ${dev.name}`;
  const existing = iosSims().find((s) => s.name === qaName && s.isAvailable !== false);
  if (existing) return existing.udid;
  const types = JSON.parse(xc('list', 'devicetypes', '-j')).devicetypes;
  const type = (dev.match || [dev.name]).map((n) => types.find((t) => t.name === n)).find(Boolean);
  if (!type) { console.warn(`! No device type matching ${JSON.stringify(dev.match)}; skipping "${dev.name}". Run: xcrun simctl list devicetypes`); return null; }
  const rts = JSON.parse(xc('list', 'runtimes', '-j')).runtimes
    .filter((r) => r.isAvailable !== false && (r.platform === 'iOS' || /iOS/.test(r.identifier)))
    .sort((a, b) => cmpVer(b.version, a.version));
  const rt = rts.find((r) => !r.supportedDeviceTypes || r.supportedDeviceTypes.some((s) => s.identifier === type.identifier));
  if (!rt) { console.warn(`! No iOS runtime supports ${type.name}; skipping.`); return null; }
  console.log(`+ Creating simulator "${qaName}" (${type.name}, iOS ${rt.version})`);
  return xc('create', qaName, type.identifier, rt.identifier).trim();
}
async function bootSim(udid) {
  trySh('xcrun', ['simctl', 'boot', udid]);
  xc('bootstatus', udid, '-b');
  trySh('xcrun', ['simctl', 'status_bar', udid, 'override', '--time', '9:41', '--batteryState', 'charged', '--batteryLevel', '100']);
}
function applyIos(udid, variant = {}) {
  xc('ui', udid, 'appearance', variant.dark ? 'dark' : 'light');
  xc('ui', udid, 'content_size', variant.contentSize || 'large');
}

// ───────────────────────── shooting ─────────────────────────
function pickScreens(cfg) {
  const want = list(flags.screens);
  const s = cfg.screens || [];
  return want ? s.filter((x) => want.includes(x.name)) : s;
}

async function shootAndroid(cfg, runDir, entries) {
  const serial = androidSerial();
  const settle = cfg.settleMs ?? 2500;
  const screens = pickScreens(cfg);
  const want = list(flags.profiles);
  const profiles = (cfg.android?.profiles || []).filter((p) => (want ? want.includes(p.name) : flags.all || !p.optional));
  const jobs = profiles.map((p) => ({ profile: p, variant: null }));
  const st = cfg.android?.stress;
  if (st && !flags['no-stress']) {
    const sp = cfg.android.profiles.find((p) => p.name === st.profile);
    if (sp && (!want || want.includes(sp.name))) for (const v of st.variants || []) jobs.push({ profile: sp, variant: v });
  }
  try {
    for (const { profile, variant } of jobs) {
      const label = variant ? `${profile.name}+${variant.name}` : profile.name;
      console.log(`▶ android ${label}  (${dp(profile.width, profile.dpi)}x${dp(profile.height, profile.dpi)}dp)`);
      applyAndroid(serial, profile, variant || {}, cfg.android?.defaultNav || 'gestural');
      await sleep(1500);
      const disp = androidDisplay(serial);
      for (const screen of screens) {
        openAndroid(serial, cfg, screen);
        await sleep(settle);
        const file = path.join(runDir, 'android', label, `${screen.name}.png`);
        screenshotAndroid(serial, file);
        const audit = auditAndroid(serial, disp, cfg.app.androidPackage);
        fs.writeFileSync(file.replace(/\.png$/, '.audit.json'), JSON.stringify(audit, null, 2));
        entries.push({ platform: 'android', profile: label, screen: screen.name, file: path.relative(runDir, file),
          sizeDp: `${dp(disp.width, disp.dpi)}x${dp(disp.height, disp.dpi)}`, issues: audit.issues.length });
        console.log(`   ${screen.name}: ${audit.issues.length} audit hint(s)`);
      }
    }
  } finally {
    resetAndroid(serial, cfg);
    console.log('✔ android emulator reset');
  }
}

async function shootIos(cfg, runDir, entries) {
  requireXcrun();
  const bundle = cfg.app.iosBundleId;
  const settle = cfg.settleMs ?? 2500;
  const screens = pickScreens(cfg);
  const want = list(flags.profiles);
  const devices = (cfg.ios?.devices || []).filter((d) => (want ? want.includes(d.name) : flags.all || !d.optional));
  const st = cfg.ios?.stress;
  if (!cfg.ios?.appPath) console.warn('! ios.appPath is empty: assuming the app is already installed on the QA simulators.');
  for (const dev of devices) {
    const udid = ensureSim(dev);
    if (!udid) continue;
    await bootSim(udid);
    if (cfg.ios?.appPath) xc('install', udid, cfg.ios.appPath);
    const variants = [null];
    if (st && !flags['no-stress'] && st.device === dev.name) variants.push(...(st.variants || []));
    for (const variant of variants) {
      const label = variant ? `${dev.name}+${variant.name}` : dev.name;
      console.log(`▶ ios ${label}`);
      applyIos(udid, variant || {});
      trySh('xcrun', ['simctl', 'terminate', udid, bundle]);
      xc('launch', udid, bundle);
      await sleep(settle);
      for (const screen of screens) {
        if (screen.path != null && cfg.app.scheme) xc('openurl', udid, `${cfg.app.scheme}://${screen.path}`);
        await sleep(settle);
        const file = path.join(runDir, 'ios', label, `${screen.name}.png`);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        xc('io', udid, 'screenshot', file);
        entries.push({ platform: 'ios', profile: label, screen: screen.name, file: path.relative(runDir, file) });
        console.log(`   ${screen.name}`);
      }
    }
    applyIos(udid, {});
    trySh('xcrun', ['simctl', 'status_bar', udid, 'clear']);
    if (!flags.keep) trySh('xcrun', ['simctl', 'shutdown', udid]);
  }
}

function writeReport(runDir, entries) {
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify({ created: new Date().toISOString(), entries }, null, 2));
  const screens = [...new Set(entries.map((e) => e.screen))];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = screens.map((s) => {
    const cells = entries.filter((e) => e.screen === s).map((e) => `
      <figure><a href="${esc(e.file)}"><img src="${esc(e.file)}" loading="lazy"></a>
      <figcaption><b>${esc(e.platform)}</b> ${esc(e.profile)}${e.sizeDp ? ` · ${esc(e.sizeDp)}dp` : ''}${e.issues ? ` · <span class="w">${e.issues} hint(s)</span>` : ''}</figcaption></figure>`).join('');
    return `<section><h2>${esc(s)}</h2><div class="row">${cells}</div></section>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device matrix</title>
<style>body{font:14px system-ui;margin:16px;background:#f4f4f5;color:#111}h2{margin:24px 0 8px}.row{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}
figure{margin:0;flex:0 0 auto;width:200px}img{width:100%;border:1px solid #ccc;border-radius:12px;background:#fff}figcaption{font-size:12px;margin-top:4px}.w{color:#b45309}
@media(prefers-color-scheme:dark){body{background:#18181b;color:#eee}img{border-color:#444}}</style>
<h1>Device matrix · ${esc(path.basename(runDir))}</h1>${rows}`;
  fs.writeFileSync(path.join(runDir, 'index.html'), html);
  console.log(`\n✔ ${entries.length} screenshots → ${path.join(runDir, 'index.html')}`);
}

// ───────────────────────── commands ─────────────────────────
const commands = {
  async init() {
    const dest = configPath();
    if (fs.existsSync(dest) && !flags.force) die(`${dest} already exists (use --force to overwrite)`);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(SKILL_DIR, 'assets', 'device-matrix.example.json'), dest);
    console.log(`✔ Created ${dest}. Fill in app.androidPackage, app.iosBundleId, app.scheme and screens.`);
    console.log('  Tip: add "qa-shots/" to .gitignore');
  },
  async doctor() {
    const ok = (b, m) => console.log(`${b ? '✔' : '✖'} ${m}`);
    const adbOut = trySh('adb', ['version']);
    ok(adbOut, `adb ${adbOut ? adbOut.split('\n')[0].replace('Android Debug Bridge version ', '') : 'not found (install Android SDK platform-tools)'}`);
    const avds = trySh('emulator', ['-list-avds']);
    ok(avds != null, `emulator ${avds != null ? `AVDs: ${avds.trim().split('\n').filter(Boolean).join(', ') || '(none; create one in Android Studio > Device Manager)'}` : 'not on PATH ($ANDROID_HOME/emulator)'}`);
    if (adbOut) { const d = trySh('adb', ['devices']); ok(d && /\tdevice/.test(d), `running device: ${d && /\tdevice/.test(d) ? 'yes' : 'none (start an emulator)'}`); }
    const x = trySh('xcrun', ['simctl', 'help']);
    ok(x != null, `xcrun simctl ${x != null ? 'available' : 'not available (iOS needs macOS + Xcode)'}`);
    const ad = trySh('agent-device', ['--version']);
    ok(ad != null, `agent-device ${ad != null ? ad.trim() : 'not installed (optional: npm i -g agent-device@latest)'}`);
    ok(fs.existsSync(configPath()), `config ${configPath()}${fs.existsSync(configPath()) ? '' : ' missing (run init)'}`);
  },
  async 'android-list'() {
    const cfg = loadConfig();
    for (const p of cfg.android.profiles) console.log(`${p.name.padEnd(14)} ${String(dp(p.width, p.dpi)).padStart(4)}x${dp(p.height, p.dpi)}dp  ${p.width}x${p.height}@${p.dpi}${p.optional ? '  (optional)' : ''}  ${p.note || ''}`);
    const st = cfg.android.stress; if (st) console.log(`stress on ${st.profile}: ${st.variants.map((v) => v.name).join(', ')}`);
  },
  async 'android-apply'() {
    const cfg = loadConfig(); const serial = androidSerial();
    const name = flags._[0]; const p = cfg.android.profiles.find((x) => x.name === name);
    if (name && !p) die(`Unknown profile "${name}". See: android-list`);
    const variant = { fontScale: flags.font ? Number(flags.font) : undefined, dark: !!flags.dark, nav: flags.nav };
    applyAndroid(serial, p, variant);
    const d = androidDisplay(serial);
    console.log(`✔ ${serial}: ${d.width}x${d.height}@${d.dpi} = ${dp(d.width, d.dpi)}x${dp(d.height, d.dpi)}dp, font ${variant.fontScale ?? 1}, ${variant.dark ? 'dark' : 'light'}. Remember: android-reset`);
  },
  async 'android-reset'() {
    const cfg = fs.existsSync(configPath()) ? loadConfig() : null;
    resetAndroid(androidSerial(), cfg); console.log('✔ reset');
  },
  async capture() {
    const name = flags.name || stamp();
    const dir = flags.out || path.join('qa-shots', 'captures');
    const platform = flags.platform || 'android';
    const file = path.join(dir, `${name}.png`);
    if (platform === 'ios') {
      requireXcrun(); fs.mkdirSync(dir, { recursive: true });
      xc('io', flags.udid || 'booted', 'screenshot', file);
      console.log(`✔ ${file}`); return;
    }
    const serial = androidSerial();
    screenshotAndroid(serial, file);
    const cfg = fs.existsSync(configPath()) ? loadConfig() : null;
    const disp = androidDisplay(serial);
    const audit = auditAndroid(serial, disp, cfg?.app?.androidPackage);
    fs.writeFileSync(file.replace(/\.png$/, '.audit.json'), JSON.stringify(audit, null, 2));
    console.log(`✔ ${file}  (${dp(disp.width, disp.dpi)}x${dp(disp.height, disp.dpi)}dp, ${audit.issues.length} audit hint(s))`);
    for (const i of audit.issues) console.log(`   - ${i.type}: ${i.label} ${i.sizeDp || i.boundsPx || ''}`);
  },
  async shoot() {
    const cfg = loadConfig();
    const platform = flags.platform || 'android';
    const runDir = flags.out || path.join('qa-shots', stamp());
    fs.mkdirSync(runDir, { recursive: true });
    const entries = [];
    if (platform === 'android' || platform === 'both') await shootAndroid(cfg, runDir, entries);
    if (platform === 'ios' || platform === 'both') await shootIos(cfg, runDir, entries);
    writeReport(runDir, entries);
  },
  async report() {
    const runDir = flags._[0] || die('usage: report <runDir>');
    const m = JSON.parse(fs.readFileSync(path.join(runDir, 'manifest.json'), 'utf8'));
    writeReport(runDir, m.entries);
  },
};

const help = `device-matrix-qa
  init [--force]                         create qa/device-matrix.json from the template
  doctor                                 check tools, emulators, config
  android-list                           show Android profiles (px, dpi, dp)
  android-apply <profile> [--font 1.3] [--dark] [--nav gestural|threebutton]
  android-reset                          restore the emulator's real display + settings
  capture [--name x] [--platform ios]    screenshot (+ audit on Android) of the current screen
  shoot [--platform android|ios|both] [--screens a,b] [--profiles x,y] [--all] [--no-stress] [--keep]
  report <runDir>                        rebuild index.html from manifest.json
  global: --config <path>  --serial <adb serial>`;

if (!cmd || !commands[cmd]) { console.log(help); process.exit(cmd ? 1 : 0); }
commands[cmd]().catch((e) => die(e.stderr?.toString() || e.message));
