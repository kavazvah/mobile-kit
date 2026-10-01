import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, list } from '../scripts/lib/args.mjs';
import { upsertMarkedSection, ensureLines, lineDiff, MARK_START, MARK_END } from '../scripts/lib/fs.mjs';
import { formatCmd } from '../scripts/lib/exec.mjs';
import { resolveModules, DEFAULT_MODULES, routingRows } from '../scripts/lib/modules.mjs';

test('parseArgs: values, booleans, =, negation, positionals', () => {
  const a = parseArgs(['init', '--modules', 'a,b', '--dry-run', '--cwd=/x', '--no-json', '--', '--raw'], {
    boolean: ['dry-run', 'json'], string: ['modules', 'cwd'],
  });
  assert.deepEqual(a._, ['init', '--raw']);
  assert.equal(a.modules, 'a,b');
  assert.equal(a['dry-run'], true);
  assert.equal(a.cwd, '/x');
  assert.equal(a.json, false);
});

test('parseArgs: string flag without value throws', () => {
  assert.throws(() => parseArgs(['--cwd'], { string: ['cwd'] }), /needs a value/);
});

test('list splits and trims', () => {
  assert.deepEqual(list(' a, b ,,c '), ['a', 'b', 'c']);
  assert.deepEqual(list(undefined), []);
  assert.deepEqual(list(['a,b', 'c']), ['a', 'b', 'c']);
});

test('upsertMarkedSection: insert into empty, append, replace, idempotent', () => {
  const first = upsertMarkedSection(null, 'one');
  assert.equal(first, `${MARK_START}\none\n${MARK_END}\n`);
  const appended = upsertMarkedSection('# Title\n\nText\n', 'one');
  assert.equal(appended, `# Title\n\nText\n\n${MARK_START}\none\n${MARK_END}\n`);
  const replaced = upsertMarkedSection(appended + '\nAfter\n', 'two');
  assert.equal(replaced, `# Title\n\nText\n\n${MARK_START}\ntwo\n${MARK_END}\n\nAfter\n`);
  assert.equal(upsertMarkedSection(replaced, 'two'), replaced);
});

test('ensureLines adds only missing lines', () => {
  assert.equal(ensureLines('node_modules/', ['qa-shots/']), 'node_modules/\nqa-shots/\n');
  assert.equal(ensureLines('qa-shots/\n', ['qa-shots/']), 'qa-shots/\n');
  assert.equal(ensureLines(null, ['qa-shots/']), 'qa-shots/\n');
});

test('lineDiff marks removed and added lines', () => {
  assert.deepEqual(lineDiff('a\nb\nc', 'a\nx\nc'), [' a', '-b', '+x', ' c']);
});

test('formatCmd quotes only when needed', () => {
  assert.equal(formatCmd('npx', ['-y', 'skills', 'add', 'a/b']), 'npx -y skills add a/b');
  assert.equal(formatCmd('echo', ["it's here"]), `echo 'it'\\''s here'`);
});

test('resolveModules adds core and requirements, keeps order, rejects unknown', () => {
  assert.deepEqual(resolveModules(['matrix']), ['core', 'devices', 'matrix']);
  assert.deepEqual(DEFAULT_MODULES, ['core', 'devices', 'matrix', 'testing', 'ui-ux', 'motion']);
  assert.throws(() => resolveModules(['nope']), /Unknown module/);
});

test('routingRows omits rows of disabled modules and missing externals', () => {
  const rows = routingRows(['core', 'motion'], new Set(['emil-animate-expo']));
  const text = rows.map((r) => r.join(' | ')).join('\n');
  assert.match(text, /mobile-kit:mobile-motion`, then `animate-expo`/);
  assert.doesNotMatch(text, /device-control|react-native-best-practices|expo:/);
});
