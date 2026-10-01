import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { scan, scanSource, mask, loadScales, DEFAULT_SCALES } from '../scripts/scan-hardcoded.mjs';
import { FIXTURES, runScript } from './helpers.mjs';

const CWD = path.join(FIXTURES, 'scan-app');
const short = (f) => `${f.line}:${f.property ?? ''}=${f.value}`;

test('flags style numbers and colours, skips allowed values, comments, strings and non-style objects', () => {
  const r = scan({ cwd: CWD, paths: ['src'], themeDir: null });
  const profile = r.findings.filter((f) => f.file === 'src/screens/Profile.tsx').map(short);
  assert.deepEqual(profile, [
    '9:marginLeft=6',
    '11:paddingHorizontal=20',
    '12:paddingBottom=40',
    '19:padding=16',
    '22:borderRadius=12',
    '23:borderTopLeftRadius=7',
    '24:fontSize=15',
    '25:marginTop=-8',
    '28:=#FFF',
    '29:=rgba(0, 0, 0, 0.5)',
  ]);
});

test('theme dir is excluded and its tokens drive the suggestions; tests are skipped', () => {
  const r = scan({ cwd: CWD, paths: ['src'], themeDir: 'src/theme' });
  assert.ok(!r.findings.some((f) => f.file.startsWith('src/theme/')));
  assert.ok(!r.findings.some((f) => f.file.includes('__tests__')));
  const by = (prop) => r.findings.find((f) => f.property === prop).suggestion;
  assert.equal(by('padding'), 'space.l (20)');
  assert.equal(by('marginLeft'), 'space.s (5)');
  assert.equal(by('marginTop'), '-space.m (10)');
  assert.equal(by('borderRadius'), 'radius.soft (8)');
  assert.equal(by('fontSize'), 'type.small (14)');
  assert.equal(r.scanned, 1);
});

test('without a tokens file the default scales are used', () => {
  const [f] = scanSource('const s = StyleSheet.create({ a: { padding: 14, fontSize: 21, borderRadius: 9 } });');
  assert.equal(f.suggestion, 'space.md (12)');
  assert.deepEqual(scanSource('const s = StyleSheet.create({ a: { fontSize: 21 } });')[0].suggestion, 'type.heading (20)');
  assert.deepEqual(loadScales(null), DEFAULT_SCALES);
});

test('mask keeps offsets and newlines; an apostrophe only affects its own line', () => {
  const src = "a // x\n/* y\n z */ b 'c' \"d\"";
  const m = mask(src, { blankStrings: true });
  assert.equal(m.length, src.length);
  assert.equal(m.split('\n').length, 3);
  assert.doesNotMatch(m, /[xyzcd]/);
  const findings = scanSource("<Text>Don't</Text>\n<View style={{ padding: 7 }} />");
  assert.deepEqual(findings.map(short), ['2:padding=7']);
});

test('3- and 8-digit hex and hsl colours are found', () => {
  assert.deepEqual(scanSource("const a = '#abc'; const b = `#AABBCCDD`; const c = 'hsl(10, 20%, 30%)'; const d = '#ab';").map((f) => f.value), ['#abc', '#AABBCCDD', 'hsl(10, 20%, 30%)']);
});

test('CLI: --json, --max exit code, default paths, help', () => {
  const r = runScript('scan-hardcoded.mjs', ['--cwd', CWD, '--theme-dir', 'src/theme', '--json', '--max', '20']);
  assert.equal(r.code, 0);
  assert.equal(r.json.count, 10);
  assert.equal(r.json.max, 20);
  assert.equal(runScript('scan-hardcoded.mjs', ['--cwd', CWD, '--max', '3']).code, 1);
  assert.match(runScript('scan-hardcoded.mjs', ['--cwd', CWD]).stdout, /src\/screens\/Profile\.tsx:19:\d+ {2}padding: 16 {2}→ space\.lg \(16\)/);
  assert.match(runScript('scan-hardcoded.mjs', ['--help']).stdout, /Limits \(heuristic\)/);
  assert.equal(runScript('scan-hardcoded.mjs', ['--cwd', CWD, '--max', 'x']).code, 1);
});

test('// mk-ignore-file skips the whole file', () => {
  assert.deepEqual(scanSource("// mk-ignore-file\nconst s = StyleSheet.create({ a: { padding: 7, color: '#fff' } });"), []);
});
