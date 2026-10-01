import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { planScaffold, applyScaffold } from '../scripts/scaffold.mjs';
import { detect } from '../scripts/detect.mjs';
import { ROOT, fixtureCopy } from './helpers.mjs';

const TEMPLATE = fs.readFileSync(path.join(ROOT, 'shared/templates/motion.ts'), 'utf8');
const run = (cwd, opts = {}) => applyScaffold(planScaffold({ cwd, det: detect(cwd, { expoCli: false }), modules: ['motion'], motion: true, ...opts }), cwd, ['motion-tokens']);
const action = (p) => p.actions.find((a) => a.id === 'motion-tokens');

test('motion template has the spec tokens and useMotion with reduced motion', () => {
  assert.match(TEMPLATE, /export const duration = \{ instant: 100, fast: 150, base: 220, slow: 320 \} as const;/);
  assert.match(TEMPLATE, /snappy: \{ damping: 20, stiffness: 300, mass: 1 \}/);
  assert.match(TEMPLATE, /gentle: \{ damping: 18, stiffness: 180, mass: 1 \}/);
  assert.match(TEMPLATE, /bouncy: \{ damping: 12, stiffness: 220, mass: 1 \}/);
  assert.match(TEMPLATE, /import \{ ReduceMotion, useReducedMotion \} from 'react-native-reanimated';/);
  assert.match(TEMPLATE, /duration: reduced \? ZERO : duration/);
});

test('motion-tokens goes into the theme dir, once, never overwriting', () => {
  const cwd = fixtureCopy('expo-router-app');
  const p = run(cwd);
  assert.equal(action(p).path, 'src/theme/motion.ts');
  assert.equal(action(p).action, 'create');
  assert.equal(fs.readFileSync(path.join(cwd, 'src/theme/motion.ts'), 'utf8'), TEMPLATE);
  assert.equal(action(run(cwd)).action, 'unchanged');
  fs.writeFileSync(path.join(cwd, 'src/theme/motion.ts'), 'export const duration = {};\n');
  assert.equal(action(run(cwd)).action, 'conflict');
  assert.equal(fs.readFileSync(path.join(cwd, 'src/theme/motion.ts'), 'utf8'), 'export const duration = {};\n');
  assert.ok(!p.todo.some((t) => /Reanimated/.test(t)), 'fixture has Reanimated 4');
});

test('without Reanimated or a theme dir: default dir and an install hint', () => {
  const cwd = fixtureCopy('expo-router-app');
  const pkgPath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  delete pkg.dependencies['react-native-reanimated'];
  fs.writeFileSync(pkgPath, JSON.stringify(pkg));
  fs.rmSync(path.join(cwd, 'src/theme'), { recursive: true });
  const p = run(cwd);
  assert.equal(action(p).path, 'src/theme/motion.ts');
  assert.ok(p.todo.includes('motion.ts needs Reanimated: npx expo install react-native-reanimated react-native-worklets'));
  applyScaffold(planScaffold({ cwd, det: detect(cwd, { expoCli: false }), modules: ['motion'], motion: true }), cwd, ['motion-tokens', 'lock']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(cwd, '.mobile-kit.json'), 'utf8')).themeDir, 'src/theme', 'lock records the new theme dir');
});

test('Reanimated 3 gets a version warning', () => {
  const cwd = fixtureCopy('expo-router-app');
  const pkgPath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  pkg.dependencies['react-native-reanimated'] = '~3.16.0';
  fs.writeFileSync(pkgPath, JSON.stringify(pkg));
  assert.match(run(cwd).todo.join('\n'), /Reanimated 3\.16\.0 is older than 4/);
});
