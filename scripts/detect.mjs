#!/usr/bin/env node
// Detect what kind of React Native / Expo project lives in a directory. Prints a summary or JSON.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, handleHelp } from './lib/args.mjs';
import { run } from './lib/exec.mjs';
import { exists, isDir, readJson, readText, walk } from './lib/fs.mjs';
import { log, printJson, setJsonMode } from './lib/log.mjs';

const HELP = `
Usage: node detect.mjs [--cwd <dir>] [--json] [--no-expo-cli]

Detects the project type, versions, app ids, scheme, i18n, theme, test setup and routes.

  --cwd <dir>     Project root (default: current directory)
  --json          Print the result as JSON on stdout
  --no-expo-cli   Don't call "npx expo config"; read app.json / native files only (faster, offline)
  --help          Show this help
`;

const ROUTE_EXT = /\.(tsx|ts|jsx|js)$/;
const THEME_CANDIDATES = ['src/theme', 'theme', 'src/styles/theme', 'src/constants', 'constants', 'src/styles', 'styles'];
const LOCALE_DIRS = ['src/locales', 'locales', 'src/i18n/locales', 'src/i18n', 'i18n', 'assets/locales', 'src/assets/locales', 'translations', 'src/translations'];
const LOCALE_RE = /^[a-z]{2,3}(?:[-_][A-Za-z]{2,4})?$/;

const stripRange = (v) => (typeof v === 'string' ? v.replace(/^[^\d]*/, '') : null);
const major = (v) => { const m = stripRange(v)?.match(/^(\d+)/); return m ? Number(m[1]) : null; };

function installedVersion(cwd, pkg) {
  return readJson(path.join(cwd, 'node_modules', pkg, 'package.json'))?.version ?? null;
}

function packageManager(cwd) {
  if (exists(path.join(cwd, 'bun.lockb')) || exists(path.join(cwd, 'bun.lock'))) return 'bun';
  if (exists(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(path.join(cwd, 'yarn.lock'))) return 'yarn';
  if (exists(path.join(cwd, 'package-lock.json'))) return 'npm';
  return null;
}

/** Expo config via the CLI (resolves app.config.js/ts). Returns null if it can't run. */
function expoConfigCli(cwd) {
  const res = run('npx', ['--no-install', 'expo', 'config', '--type', 'public', '--json'], { cwd, timeout: 120000 });
  if (res.code !== 0) return null;
  const txt = res.stdout.slice(res.stdout.indexOf('{'));
  try { return JSON.parse(txt); } catch { return null; }
}

/** Expo config from static files. app.config.* is only scanned with regexes (can't execute it). */
function expoConfigStatic(cwd) {
  const appJson = readJson(path.join(cwd, 'app.json'));
  let cfg = appJson ? (appJson.expo ?? appJson) : {};
  for (const f of ['app.config.ts', 'app.config.js', 'app.config.mjs', 'app.config.cjs']) {
    const t = readText(path.join(cwd, f));
    if (!t) continue;
    const grab = (key) => t.match(new RegExp(`${key}\\s*:\\s*['"\`]([^'"\`]+)['"\`]`))?.[1];
    cfg = {
      ...cfg,
      scheme: cfg.scheme ?? grab('scheme'),
      android: { ...cfg.android, package: cfg.android?.package ?? grab('package') },
      ios: { ...cfg.ios, bundleIdentifier: cfg.ios?.bundleIdentifier ?? grab('bundleIdentifier') },
    };
    break;
  }
  return cfg;
}

function nativeAndroidId(cwd) {
  for (const f of ['android/app/build.gradle', 'android/app/build.gradle.kts']) {
    const t = readText(path.join(cwd, f));
    const m = t?.match(/applicationId\s*=?\s*["']([^"']+)["']/) ?? t?.match(/namespace\s*=?\s*["']([^"']+)["']/);
    if (m) return m[1];
  }
  return null;
}

function nativeIosId(cwd) {
  if (!isDir(path.join(cwd, 'ios'))) return null;
  const pbx = walk(path.join(cwd, 'ios'), { ignore: ['Pods', 'build', 'node_modules'] }).find((f) => f.endsWith('project.pbxproj'));
  const t = pbx && readText(path.join(cwd, 'ios', pbx));
  const ids = [...(t?.matchAll(/PRODUCT_BUNDLE_IDENTIFIER = "?([^";]+)"?;/g) ?? [])].map((m) => m[1]);
  return ids.find((id) => !/Tests?$/i.test(id)) ?? null;
}

function nativeScheme(cwd) {
  const manifest = readText(path.join(cwd, 'android/app/src/main/AndroidManifest.xml'));
  const fromAndroid = [...(manifest?.matchAll(/android:scheme="([^"]+)"/g) ?? [])].map((m) => m[1]).find((s) => !/^https?$/.test(s));
  if (fromAndroid) return fromAndroid;
  if (!isDir(path.join(cwd, 'ios'))) return null;
  const plist = walk(path.join(cwd, 'ios'), { ignore: ['Pods', 'build'] }).find((f) => /(^|\/)Info\.plist$/.test(f) && !/Tests?\//.test(f));
  const t = plist && readText(path.join(cwd, 'ios', plist));
  const m = t?.match(/<key>CFBundleURLSchemes<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
  return m ? m[1] : null;
}

function detectI18n(cwd, deps) {
  const libs = ['i18next', 'react-i18next', 'expo-localization', '@lingui/core', 'react-intl'].filter((d) => deps[d]);
  const locales = new Set();
  let dir = null;
  for (const d of LOCALE_DIRS) {
    const abs = path.join(cwd, d);
    if (!isDir(abs)) continue;
    const found = walk(abs).map((f) => f.split('/')[0].replace(/\.(json|ts|js|po)$/, '')).filter((n) => LOCALE_RE.test(n));
    if (found.length) { found.forEach((l) => locales.add(l.replace('_', '-'))); dir = d; break; }
  }
  return { libs, locales: [...locales].sort(), dir };
}

function detectTheme(cwd) {
  for (const d of THEME_CANDIDATES) {
    const abs = path.join(cwd, d);
    if (!isDir(abs)) continue;
    const files = walk(abs).filter((f) => /\.(ts|tsx|js)$/.test(f));
    const themeFiles = d.endsWith('theme') ? files : files.filter((f) => /(theme|tokens|colors|spacing)/i.test(f));
    if (!themeFiles.length) continue;
    const text = themeFiles.map((f) => readText(path.join(abs, f)) ?? '').join('\n');
    return {
      dir: d,
      files: themeFiles.map((f) => `${d}/${f}`),
      hasSpacingTokens: /export\s+const\s+(space|spacing|sizes?)\b/.test(text),
    };
  }
  return { dir: null, files: [], hasSpacingTokens: false };
}

/** expo-router route files → deep-link paths (groups dropped, index → ""). */
function detectRoutes(cwd) {
  const root = ['src/app', 'app'].find((d) => isDir(path.join(cwd, d)) && walk(path.join(cwd, d)).some((f) => ROUTE_EXT.test(f)));
  if (!root) return { root: null, routes: [] };
  const routes = [];
  for (const file of walk(path.join(cwd, root))) {
    if (!ROUTE_EXT.test(file)) continue;
    const parts = file.replace(ROUTE_EXT, '').split('/');
    const base = parts[parts.length - 1];
    if (base === '_layout' || base.startsWith('+') || /\.(web|native|ios|android)$/.test(base)) continue;
    if (parts.some((p) => p.startsWith('_') && p !== '_layout')) continue;
    const segs = parts.filter((p) => !/^\(.*\)$/.test(p));
    if (segs[segs.length - 1] === 'index') segs.pop();
    const p = segs.join('/');
    routes.push({ file: `${root}/${file}`, path: p, dynamic: /\[.+\]/.test(p) });
  }
  routes.sort((a, b) => a.path.localeCompare(b.path));
  return { root, routes };
}

export function detect(cwd, { expoCli = true } = {}) {
  const pkg = readJson(path.join(cwd, 'package.json'));
  const warnings = [];
  if (!pkg) return { ok: false, cwd, error: 'No package.json found', warnings };
  const deps = { ...pkg.devDependencies, ...pkg.dependencies };
  const isExpo = !!deps.expo;
  const isReactNative = !!deps['react-native'];
  const hasAndroid = isDir(path.join(cwd, 'android'));
  const hasIos = isDir(path.join(cwd, 'ios'));

  let expoConfig = null;
  let configSource = null;
  if (isExpo) {
    if (expoCli) { expoConfig = expoConfigCli(cwd); configSource = expoConfig ? 'expo-cli' : null; }
    if (!expoConfig) { expoConfig = expoConfigStatic(cwd); configSource = 'static'; }
  }
  const expoVersion = installedVersion(cwd, 'expo') ?? stripRange(deps.expo);
  const expoSdk = major(expoConfig?.sdkVersion) ?? major(expoVersion);

  const scheme = [expoConfig?.scheme].flat()[0] || nativeScheme(cwd) || null;
  const appIds = {
    android: expoConfig?.android?.package || nativeAndroidId(cwd) || null,
    ios: expoConfig?.ios?.bundleIdentifier || nativeIosId(cwd) || null,
  };

  if (!isReactNative && !isExpo) warnings.push('Not a React Native project (no react-native or expo dependency).');
  else if (!isExpo) warnings.push('Bare React Native detected. mobile-kit is Expo-first: layout rules, testing and review work; device builds and Design Lab may need manual steps.');
  if (isExpo && expoSdk != null && expoSdk < 52) warnings.push(`Expo SDK ${expoSdk} is below the supported minimum (52).`);
  if (!appIds.android) warnings.push('Android package not found (set android.package in app.json, or pass it to init).');
  if (!appIds.ios) warnings.push('iOS bundle id not found (set ios.bundleIdentifier in app.json, or pass it to init).');
  if (!scheme) warnings.push('No URL scheme found; deep links to screens will not work until one is set.');

  const theme = detectTheme(cwd);
  const { root: routesRoot, routes } = detectRoutes(cwd);
  const ver = (name) => installedVersion(cwd, name) ?? stripRange(deps[name]) ?? null;

  return {
    ok: true,
    cwd,
    name: pkg.name ?? null,
    isExpo,
    isReactNative,
    expoSdk,
    router: !!deps['expo-router'],
    reanimated: ver('react-native-reanimated'),
    gestureHandler: ver('react-native-gesture-handler'),
    skia: ver('@shopify/react-native-skia'),
    platforms: { android: hasAndroid, ios: hasIos, cng: isExpo && !hasAndroid && !hasIos },
    packageManager: packageManager(cwd),
    appIds,
    scheme,
    configSource,
    i18n: detectI18n(cwd, deps),
    themeDir: theme.dir,
    theme,
    srcDir: isDir(path.join(cwd, 'src')),
    hasJest: !!(deps.jest || deps['jest-expo'] || pkg.jest || ['jest.config.js', 'jest.config.ts', 'jest.config.cjs', 'jest.config.mjs'].some((f) => exists(path.join(cwd, f)))),
    hasMaestro: isDir(path.join(cwd, '.maestro')),
    agentsMd: exists(path.join(cwd, 'AGENTS.md')),
    claudeMd: exists(path.join(cwd, 'CLAUDE.md')),
    routesRoot,
    routes,
    warnings,
  };
}

function printSummary(d) {
  if (!d.ok) { log.fail(d.error); return; }
  const v = (x) => x ?? '–';
  log.info(`Project: ${v(d.name)}  (${d.isExpo ? `Expo SDK ${v(d.expoSdk)}` : d.isReactNative ? 'bare React Native' : 'not React Native'})`);
  log.info(`Router: ${d.router ? `expo-router (${d.routesRoot})` : 'none'}   Package manager: ${v(d.packageManager)}`);
  log.info(`Native dirs: android=${d.platforms.android} ios=${d.platforms.ios}${d.platforms.cng ? ' (CNG)' : ''}`);
  log.info(`App ids: android=${v(d.appIds.android)} ios=${v(d.appIds.ios)}   scheme=${v(d.scheme)}`);
  log.info(`Reanimated ${v(d.reanimated)}, Gesture Handler ${v(d.gestureHandler)}, Skia ${v(d.skia)}`);
  log.info(`i18n: ${d.i18n.libs.join(', ') || 'none'}; locales: ${d.i18n.locales.join(', ') || '–'}`);
  log.info(`Theme: ${v(d.themeDir)}${d.themeDir ? ` (spacing tokens: ${d.theme.hasSpacingTokens ? 'yes' : 'no'})` : ''}   Jest: ${d.hasJest}   Maestro: ${d.hasMaestro}`);
  log.info(`Routes (${d.routes.length}): ${d.routes.map((r) => '/' + r.path).join('  ') || '–'}`);
  for (const w of d.warnings) log.warn(w);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2), { boolean: ['json', 'expo-cli', 'help'], string: ['cwd'], alias: { h: 'help' } });
  handleHelp(args, HELP);
  if (!process.argv.includes('--no-expo-cli')) args['expo-cli'] = true;
  setJsonMode(args.json);
  const result = detect(path.resolve(args.cwd || '.'), { expoCli: args['expo-cli'] });
  if (args.json) printJson(result); else printSummary(result);
  process.exit(result.ok ? 0 : 1);
}
