import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { planScaffold, applyScaffold } from '../scripts/scaffold.mjs';
import { planTesting, rntlMajor } from '../scripts/lib/testing-scaffold.mjs';
import { detect } from '../scripts/detect.mjs';
import { fixtureCopy } from './helpers.mjs';

const readPkg = (cwd) => JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
const editPkg = (cwd, fn) => {
  const p = path.join(cwd, 'package.json');
  fs.writeFileSync(p, JSON.stringify(fn(JSON.parse(fs.readFileSync(p, 'utf8'))), null, 2) + '\n');
};
const run = (cwd, opts = {}) => applyScaffold(planScaffold({
  cwd, det: detect(cwd, { expoCli: false }), modules: ['testing'], testing: true, ...opts,
}), cwd, ['package-json', 'test-example', 'maestro-smoke']);

test('expo project: preset, scripts, example test, smoke flow, install hint', () => {
  const cwd = fixtureCopy('expo-router-app');
  const p = run(cwd);
  const pkg = readPkg(cwd);
  assert.deepEqual(pkg.jest, { preset: 'jest-expo' });
  assert.deepEqual(pkg.scripts, { test: 'jest', 'test:e2e': 'maestro test -e APP_ID=com.example.fixture .maestro/' });
  assert.equal(pkg.dependencies.expo, '~54.0.10', 'other fields untouched');
  const example = fs.readFileSync(path.join(cwd, 'src/__tests__/example.test.jsx'), 'utf8');
  assert.match(example, /await render\(<Counter \/>\)/);
  assert.match(example, /RNTL\) v14|Library v14/);
  const flow = fs.readFileSync(path.join(cwd, '.maestro/smoke.yaml'), 'utf8');
  assert.match(flow, /^appId: \$\{APP_ID\}$/m);
  assert.match(flow, /id: "home\.screen"/);
  assert.doesNotMatch(flow, /\{\{/);
  assert.ok(p.todo.includes('Install test dependencies: npx expo install jest @testing-library/react-native --dev'));
});

test('re-run changes nothing', () => {
  const cwd = fixtureCopy('expo-router-app');
  run(cwd);
  const again = run(cwd);
  const testing = again.actions.filter((a) => ['package-json', 'test-example', 'maestro-smoke'].includes(a.id));
  assert.deepEqual(testing.map((a) => a.action), ['unchanged', 'unchanged', 'unchanged']);
});

test('existing scripts and Jest config are kept and reported', () => {
  const cwd = fixtureCopy('expo-router-app');
  editPkg(cwd, (p) => ({ ...p, scripts: { test: 'jest --watchAll' }, jest: { preset: 'react-native' } }));
  const p = run(cwd);
  const pkg = readPkg(cwd);
  assert.equal(pkg.scripts.test, 'jest --watchAll');
  assert.deepEqual(pkg.jest, { preset: 'react-native' });
  assert.match(p.todo.join('\n'), /npm script "test" already exists/);
  assert.match(p.todo.join('\n'), /uses preset "react-native"; mobile-kit expects "jest-expo"/);
});

test('jest.config.* file is detected and not touched', () => {
  const cwd = fixtureCopy('expo-router-app');
  fs.writeFileSync(path.join(cwd, 'jest.config.js'), 'module.exports = {};\n');
  const p = run(cwd);
  assert.equal(readPkg(cwd).jest, undefined);
  assert.match(p.todo.join('\n'), /jest\.config\.js exists/);
});

test('different iOS id adds test:e2e:ios; overrides win', () => {
  const cwd = fixtureCopy('expo-router-app');
  run(cwd, { overrides: { iosBundleId: 'com.example.ios' } });
  assert.equal(readPkg(cwd).scripts['test:e2e:ios'], 'maestro test -e APP_ID=com.example.ios .maestro/');
});

test('RNTL major: installed version, declared range, or inferred from React', () => {
  const cwd = fixtureCopy('expo-router-app');
  assert.equal(rntlMajor(cwd, { dependencies: { react: '18.3.1' } }), 13);
  assert.equal(rntlMajor(cwd, { dependencies: { react: '19.1.0' } }), 14);
  assert.equal(rntlMajor(cwd, { devDependencies: { '@testing-library/react-native': '^13.3.0' }, dependencies: { react: '19.1.0' } }), 13);
  fs.mkdirSync(path.join(cwd, 'node_modules/@testing-library/react-native'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'node_modules/@testing-library/react-native/package.json'), '{"version":"14.2.0"}');
  assert.equal(rntlMajor(cwd, { devDependencies: { '@testing-library/react-native': '^13.3.0' } }), 14);
});

test('RNTL 13 project gets a sync render; TypeScript project gets .tsx; globals come from @jest/globals', () => {
  const cwd = fixtureCopy('expo-router-app');
  editPkg(cwd, (p) => ({ ...p, dependencies: { ...p.dependencies, react: '18.3.1' } }));
  fs.writeFileSync(path.join(cwd, 'tsconfig.json'), '{}');
  const p = run(cwd);
  const example = fs.readFileSync(path.join(cwd, 'src/__tests__/example.test.tsx'), 'utf8');
  assert.match(example, /\n {2}render\(<Counter \/>\)/);
  assert.doesNotMatch(example, /await render/);
  assert.match(example, /import \{ expect, jest, test \} from '@jest\/globals';/);
  assert.doesNotMatch(p.todo.join('\n'), /@types\/jest/);
});

test('bare RN: react-native preset, package-manager install command, 4-space indent kept', () => {
  const cwd = fixtureCopy('bare-rn-app');
  const pkgPath = path.join(cwd, 'package.json');
  fs.writeFileSync(pkgPath, JSON.stringify(JSON.parse(fs.readFileSync(pkgPath, 'utf8')), null, 4) + '\n');
  const det = detect(cwd, { expoCli: false });
  const t = planTesting(cwd, det, { android: 'com.example.bare', ios: 'com.example.bare.ios' });
  const pkgFile = t.files.find((f) => f.id === 'package-json').content;
  assert.match(pkgFile, /\n {4}"jest": \{\n {8}"preset": "react-native"/);
  assert.equal(JSON.parse(pkgFile).scripts['test:e2e:ios'], 'maestro test -e APP_ID=com.example.bare.ios .maestro/');
  assert.ok(t.todo.includes('Install test dependencies: yarn add -D @testing-library/react-native'));
  assert.equal(t.files.find((f) => f.id === 'test-example').path, '__tests__/example.test.jsx');
});

test('without --testing nothing test-related is planned', () => {
  const cwd = fixtureCopy('expo-router-app');
  const p = planScaffold({ cwd, det: detect(cwd, { expoCli: false }), modules: ['testing'] });
  assert.ok(!p.actions.some((a) => ['package-json', 'test-example', 'maestro-smoke'].includes(a.id)));
});
