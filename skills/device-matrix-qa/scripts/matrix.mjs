#!/usr/bin/env node
// Device Matrix QA: reshape Android emulators, drive iOS simulators, capture screenshots + audits.
// Zero dependencies. Requires Node 18+, adb (Android) and/or Xcode's xcrun (iOS, macOS only).
// Device commands live in the plugin's shared backend: scripts/lib/devices.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  dp, sleep, trySh, androidSerial, applyAndroid, resetAndroid, androidDisplay, auditAndroid, setAppLocale,
  requireXcrun, ensureSim, bootSim, applyIos, resetIos, install, terminate, launch, openUrl, screenshot, deepLink,
} from '../../../scripts/lib/devices.mjs';

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

// --json: progress goes to stderr, stdout carries one JSON summary.
if (flags.json) console.log = (...a) => console.error(...a);
const emitJson = (obj) => process.stdout.write(JSON.stringify(obj, null, 2) + '\n');

function die(msg) { console.error(`✖ ${msg}`); process.exit(1); }
const list = (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

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
const serialFlag = () => androidSerial(flags.serial);
const defaultNav = (cfg) => cfg?.android?.defaultNav || 'gestural';

// ───────────────────────── locales ─────────────────────────
/**
 * Which locales to run and how. "none" (default) is a single run without a locale.
 * iOS has no per-app locale command, so "android-app-locale" falls back to "deeplink-param" there.
 */
export function localePlan(cfg, platform, only) {
  const L = cfg.locales;
  const strategy = L?.strategy ?? 'none';
  if (strategy === 'none' || !L?.list?.length) return { strategy: 'none', locales: [null], subdir: false };
  let tags = L.list;
  if (only) tags = tags.filter((t) => only.includes(t));
  return {
    strategy: platform === 'ios' && strategy === 'android-app-locale' ? 'deeplink-param' : strategy,
    locales: tags,
    param: L.param || 'lang',
    subdir: L.list.length > 1,
  };
}

function screenUrl(cfg, screen, locale, lp) {
  return deepLink(cfg.app.scheme, screen.path, lp.strategy === 'deeplink-param' ? locale : null, lp.param);
}

// ───────────────────────── shooting ─────────────────────────
function pickScreens(cfg) {
  const want = list(flags.screens);
  const s = cfg.screens || [];
  return want ? s.filter((x) => want.includes(x.name)) : s;
}

function openAndroid(serial, cfg, screen, locale, lp) {
  const pkg = cfg.app.androidPackage;
  if (cfg.android?.relaunch) terminate('android', serial, pkg);
  if (screen && screen.path != null && cfg.app.scheme) openUrl('android', serial, screenUrl(cfg, screen, locale, lp), pkg);
  else launch('android', serial, pkg);
}

function shotPath(runDir, platform, label, locale, lp, screen) {
  return path.join(runDir, platform, label, ...(lp.subdir && locale ? [locale] : []), `${screen.name}.png`);
}

async function shootAndroid(cfg, runDir, entries) {
  const serial = serialFlag();
  const settle = cfg.settleMs ?? 2500;
  const screens = pickScreens(cfg);
  const want = list(flags.profiles);
  const lp = localePlan(cfg, 'android', list(flags.locales));
  const pkg = cfg.app.androidPackage;
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
      applyAndroid(serial, profile, variant || {}, defaultNav(cfg));
      await sleep(cfg.android?.applySettleMs ?? 1500);
      const disp = androidDisplay(serial);
      for (const locale of lp.locales) {
        if (locale && lp.strategy === 'android-app-locale') { setAppLocale(serial, pkg, locale); await sleep(settle); }
        for (const screen of screens) {
          openAndroid(serial, cfg, screen, locale, lp);
          await sleep(settle);
          const file = shotPath(runDir, 'android', label, locale, lp, screen);
          screenshot('android', serial, file);
          const audit = auditAndroid(serial, disp, pkg);
          fs.writeFileSync(file.replace(/\.png$/, '.audit.json'), JSON.stringify(audit, null, 2));
          entries.push({ platform: 'android', profile: label, ...(locale ? { locale } : {}), screen: screen.name, file: path.relative(runDir, file),
            sizeDp: `${dp(disp.width, disp.dpi)}x${dp(disp.height, disp.dpi)}`, issues: audit.issues.length });
          console.log(`   ${locale ? `[${locale}] ` : ''}${screen.name}: ${audit.issues.length} audit hint(s)`);
        }
      }
    }
  } finally {
    if (lp.strategy === 'android-app-locale') trySh('adb', ['-s', serial, 'shell', 'cmd', 'locale', 'set-app-locales', pkg]);
    resetAndroid(serial, defaultNav(cfg));
    console.log('✔ android emulator reset');
  }
}

async function shootIos(cfg, runDir, entries) {
  requireXcrun();
  const bundle = cfg.app.iosBundleId;
  const settle = cfg.settleMs ?? 2500;
  const screens = pickScreens(cfg);
  const want = list(flags.profiles);
  const lp = localePlan(cfg, 'ios', list(flags.locales));
  const devices = (cfg.ios?.devices || []).filter((d) => (want ? want.includes(d.name) : flags.all || !d.optional));
  const st = cfg.ios?.stress;
  if (!cfg.ios?.appPath) console.warn('! ios.appPath is empty: assuming the app is already installed on the QA simulators.');
  if (cfg.locales?.strategy === 'android-app-locale') console.warn('! iOS has no per-app locale command: using the deep-link parameter instead.');
  for (const dev of devices) {
    const udid = ensureSim(dev.match || [dev.name], { name: dev.name });
    if (!udid) continue;
    await bootSim(udid);
    if (cfg.ios?.appPath) install('ios', udid, cfg.ios.appPath);
    const variants = [null];
    if (st && !flags['no-stress'] && st.device === dev.name) variants.push(...(st.variants || []));
    for (const variant of variants) {
      const label = variant ? `${dev.name}+${variant.name}` : dev.name;
      console.log(`▶ ios ${label}`);
      applyIos(udid, variant || {});
      terminate('ios', udid, bundle);
      launch('ios', udid, bundle);
      await sleep(settle);
      for (const locale of lp.locales) {
        for (const screen of screens) {
          if (screen.path != null && cfg.app.scheme) openUrl('ios', udid, screenUrl(cfg, screen, locale, lp));
          await sleep(settle);
          const file = shotPath(runDir, 'ios', label, locale, lp, screen);
          screenshot('ios', udid, file);
          entries.push({ platform: 'ios', profile: label, ...(locale ? { locale } : {}), screen: screen.name, file: path.relative(runDir, file) });
          console.log(`   ${locale ? `[${locale}] ` : ''}${screen.name}`);
        }
      }
    }
    resetIos(udid);
    if (!flags.keep) trySh('xcrun', ['simctl', 'shutdown', udid]);
  }
}

export function renderReport(runDir, entries) {
  const screens = [...new Set(entries.map((e) => e.screen))];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = screens.map((s) => {
    const cells = entries.filter((e) => e.screen === s).map((e) => `
      <figure><a href="${esc(e.file)}"><img src="${esc(e.file)}" loading="lazy"></a>
      <figcaption><b>${esc(e.platform)}</b> ${esc(e.profile)}${e.locale ? ` · ${esc(e.locale)}` : ''}${e.sizeDp ? ` · ${esc(e.sizeDp)}dp` : ''}${e.issues ? ` · <span class="w">${e.issues} hint(s)</span>` : ''}</figcaption></figure>`).join('');
    return `<section><h2>${esc(s)}</h2><div class="row">${cells}</div></section>`;
  }).join('');
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Device matrix</title>
<style>body{font:14px system-ui;margin:16px;background:#f4f4f5;color:#111}h2{margin:24px 0 8px}.row{display:flex;gap:12px;overflow-x:auto;padding-bottom:8px}
figure{margin:0;flex:0 0 auto;width:200px}img{width:100%;border:1px solid #ccc;border-radius:12px;background:#fff}figcaption{font-size:12px;margin-top:4px}.w{color:#b45309}
@media(prefers-color-scheme:dark){body{background:#18181b;color:#eee}img{border-color:#444}}</style>
<h1>Device matrix · ${esc(path.basename(runDir))}</h1>${rows}`;
}

function writeReport(runDir, entries) {
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify({ created: new Date().toISOString(), entries }, null, 2));
  fs.writeFileSync(path.join(runDir, 'index.html'), renderReport(runDir, entries));
  console.log(`\n✔ ${entries.length} screenshots → ${path.join(runDir, 'index.html')}`);
}

function runSummary(runDir, entries) {
  const abs = path.resolve(runDir);
  return {
    runDir: abs,
    index: path.join(abs, 'index.html'),
    manifest: path.join(abs, 'manifest.json'),
    count: entries.length,
    entries: entries.map((e) => ({
      ...e,
      path: path.join(abs, e.file),
      ...(e.platform === 'android' ? { audit: path.join(abs, e.file.replace(/\.png$/, '.audit.json')) } : {}),
    })),
  };
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
    const cfg = loadConfig(); const serial = serialFlag();
    const name = flags._[0]; const p = cfg.android.profiles.find((x) => x.name === name);
    if (name && !p) die(`Unknown profile "${name}". See: android-list`);
    const variant = { fontScale: flags.font ? Number(flags.font) : undefined, dark: !!flags.dark, nav: flags.nav };
    applyAndroid(serial, p, variant);
    const d = androidDisplay(serial);
    console.log(`✔ ${serial}: ${d.width}x${d.height}@${d.dpi} = ${dp(d.width, d.dpi)}x${dp(d.height, d.dpi)}dp, font ${variant.fontScale ?? 1}, ${variant.dark ? 'dark' : 'light'}. Remember: android-reset`);
  },
  async 'android-reset'() {
    const cfg = fs.existsSync(configPath()) ? loadConfig() : null;
    resetAndroid(serialFlag(), defaultNav(cfg)); console.log('✔ reset');
  },
  async capture() {
    const name = flags.name || stamp();
    const dir = flags.out || path.join('qa-shots', 'captures');
    const platform = flags.platform || 'android';
    const file = path.join(dir, `${name}.png`);
    if (platform === 'ios') {
      requireXcrun();
      screenshot('ios', flags.udid || 'booted', file);
      console.log(`✔ ${file}`);
      if (flags.json) emitJson({ platform, file: path.resolve(file) });
      return;
    }
    const serial = serialFlag();
    screenshot('android', serial, file);
    const cfg = fs.existsSync(configPath()) ? loadConfig() : null;
    const disp = androidDisplay(serial);
    const audit = auditAndroid(serial, disp, cfg?.app?.androidPackage);
    const auditFile = file.replace(/\.png$/, '.audit.json');
    fs.writeFileSync(auditFile, JSON.stringify(audit, null, 2));
    console.log(`✔ ${file}  (${dp(disp.width, disp.dpi)}x${dp(disp.height, disp.dpi)}dp, ${audit.issues.length} audit hint(s))`);
    for (const i of audit.issues) console.log(`   - ${i.type}: ${i.label} ${i.sizeDp || i.boundsPx || ''}`);
    if (flags.json) emitJson({ platform, file: path.resolve(file), audit: path.resolve(auditFile), sizeDp: `${dp(disp.width, disp.dpi)}x${dp(disp.height, disp.dpi)}`, issues: audit.issues });
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
    if (flags.json) emitJson(runSummary(runDir, entries));
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
  capture [--name x] [--platform ios] [--json]   screenshot (+ audit on Android) of the current screen
  shoot [--platform android|ios|both] [--screens a,b] [--profiles x,y] [--locales en,de] [--all] [--no-stress] [--keep] [--json]
  report <runDir>                        rebuild index.html from manifest.json
  global: --config <path>  --serial <adb serial>
  --json prints a machine-readable summary on stdout (progress goes to stderr)`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!cmd || flags.help || !commands[cmd]) { console.log(help); process.exit(cmd && !flags.help && !commands[cmd] ? 1 : 0); }
  commands[cmd]().catch((e) => die(e.stderr?.toString() || e.message));
}
