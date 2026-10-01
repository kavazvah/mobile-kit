// Test scaffolding for the mobile-testing skill: Jest preset, npm scripts, an example component test, a Maestro smoke flow.
import path from 'node:path';
import { KIT_ROOT, exists, readText, readJson } from './fs.mjs';

const ASSETS = path.join(KIT_ROOT, 'skills', 'mobile-testing', 'assets');
const JEST_CONFIG_FILES = ['jest.config.js', 'jest.config.ts', 'jest.config.cjs', 'jest.config.mjs', 'jest.config.json'];
export const START_TEST_ID = 'home.screen';

const major = (v) => Number(String(v ?? '').replace(/^[^\d]*/, '').split('.')[0]) || null;

/** Installed (node_modules) major, else the declared range's major. */
function depMajor(cwd, pkg, name) {
  return major(readJson(path.join(cwd, 'node_modules', name, 'package.json'))?.version)
    ?? major({ ...pkg.dependencies, ...pkg.devDependencies }[name]);
}

/** RNTL 14 needs React 19; use the installed RNTL major, else infer it from React. */
export function rntlMajor(cwd, pkg) {
  return depMajor(cwd, pkg, '@testing-library/react-native') ?? ((depMajor(cwd, pkg, 'react') ?? 19) >= 19 ? 14 : 13);
}

function installCommand(det, missing) {
  if (!missing.length) return null;
  if (det.isExpo) return `npx expo install ${missing.join(' ')} --dev`;
  const pm = det.packageManager ?? 'npm';
  return { npm: 'npm i -D', yarn: 'yarn add -D', pnpm: 'pnpm add -D', bun: 'bun add -d' }[pm] + ' ' + missing.join(' ');
}

/**
 * Plan the test scaffold. Returns { files: [{id, path, content}], todo: [] }.
 * `ids` = { android, ios } app ids for the Maestro scripts.
 */
export function planTesting(cwd, det, ids) {
  const todo = [];
  const files = [];
  const raw = readText(path.join(cwd, 'package.json'));
  const pkg = JSON.parse(raw);
  const indent = raw.match(/^([ \t]+)"/m)?.[1] ?? '  ';
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const next = structuredClone(pkg);

  // Jest preset
  const configFile = JEST_CONFIG_FILES.find((f) => exists(path.join(cwd, f)));
  const wantPreset = det.isExpo ? 'jest-expo' : 'react-native';
  if (!pkg.jest && !configFile) next.jest = { preset: wantPreset };
  else if (pkg.jest && pkg.jest.preset !== wantPreset) todo.push(`package.json "jest" uses preset "${pkg.jest.preset ?? '(none)'}"; mobile-kit expects "${wantPreset}". Left unchanged.`);
  else if (configFile) todo.push(`${configFile} exists; check that it uses the "${wantPreset}" preset (not edited).`);

  // npm scripts: add missing ones, never replace existing ones
  next.scripts = { ...pkg.scripts };
  const e2e = (id) => (id ? `maestro test -e APP_ID=${id} .maestro/` : 'maestro test .maestro/');
  const wanted = { test: 'jest', 'test:e2e': e2e(ids.android || ids.ios) };
  if (ids.ios && ids.android && ids.ios !== ids.android) wanted['test:e2e:ios'] = e2e(ids.ios);
  if (!ids.android && !ids.ios) todo.push('No app id known: run Maestro with -e APP_ID=<id> (or set the ids in qa/device-matrix.json and re-run).');
  for (const [k, v] of Object.entries(wanted)) {
    if (next.scripts[k] == null) next.scripts[k] = v;
    else if (next.scripts[k] !== v) todo.push(`npm script "${k}" already exists ("${next.scripts[k]}"); kept. Suggested: "${v}".`);
  }
  files.push({ id: 'package-json', path: 'package.json', content: JSON.stringify(next, null, indent) + (raw.endsWith('\n') ? '\n' : '') });

  // Dev dependencies
  const needed = ['jest', '@testing-library/react-native', ...(det.isExpo ? ['jest-expo'] : [])];
  const missing = needed.filter((d) => !deps[d]);
  const cmd = installCommand(det, missing);
  if (cmd) todo.push(`Install test dependencies: ${cmd}`);

  // Example component test (outside app/, so expo-router doesn't treat it as a route)
  const ts = exists(path.join(cwd, 'tsconfig.json'));
  const rntl = rntlMajor(cwd, pkg);
  const testPath = `${det.srcDir ? 'src/' : ''}__tests__/example.test.${ts ? 'tsx' : 'jsx'}`;
  const example = readText(path.join(ASSETS, 'component.test.example.tsx'))
    .replace('{{rntlMajor}}', `v${rntl}`)
    .replace('{{await}}', rntl >= 14 ? 'await ' : '');
  files.push({ id: 'test-example', path: testPath, content: example });

  // Maestro smoke flow
  const flow = readText(path.join(ASSETS, 'maestro-flow.example.yaml')).replaceAll('{{startTestId}}', START_TEST_ID);
  files.push({ id: 'maestro-smoke', path: '.maestro/smoke.yaml', content: flow });
  todo.push(`Give the start screen's root view testID="${START_TEST_ID}" so .maestro/smoke.yaml can find it.`);

  return { files, todo, rntl };
}
