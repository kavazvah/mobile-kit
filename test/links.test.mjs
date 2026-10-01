// Every ${CLAUDE_PLUGIN_ROOT}/... path in skills, agents and shared docs must exist, and so must
// every relative Markdown link. Broken paths are invisible until a user hits them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { walk } from '../scripts/lib/fs.mjs';
import { ROOT } from './helpers.mjs';

const mdFiles = walk(ROOT, { ignore: ['node_modules', '.git', 'evals', 'test', 'seed', 'docs'] }).filter((f) => f.endsWith('.md'));

test('every ${CLAUDE_PLUGIN_ROOT} path exists', () => {
  const missing = [];
  for (const f of mdFiles) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([\w./@-]+)/g)) {
      const rel = m[1].replace(/[.,)]+$/, '');
      if (!fs.existsSync(path.join(ROOT, rel))) missing.push(`${f}: ${rel}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('relative Markdown links resolve', () => {
  const missing = [];
  for (const f of mdFiles) {
    const text = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/```[\s\S]*?```/g, '');
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split('#')[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      if (!fs.existsSync(path.resolve(ROOT, path.dirname(f), target))) missing.push(`${f}: ${m[1]}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('every skill folder name matches its frontmatter name and stays under 250 lines', () => {
  for (const dir of fs.readdirSync(path.join(ROOT, 'skills'))) {
    const text = fs.readFileSync(path.join(ROOT, 'skills', dir, 'SKILL.md'), 'utf8');
    assert.equal(text.match(/^name:\s*(.+)$/m)?.[1].trim(), dir, dir);
    assert.ok(text.split('\n').length < 250, `${dir} is too long`);
  }
});

test('every eval case targets an existing skill', () => {
  const skills = new Set(fs.readdirSync(path.join(ROOT, 'skills')));
  for (const c of fs.readdirSync(path.join(ROOT, 'evals'))) {
    const graders = path.join(ROOT, 'evals', c, 'graders');
    if (!fs.existsSync(graders)) continue;
    for (const g of fs.readdirSync(graders)) {
      const named = fs.readFileSync(path.join(graders, g), 'utf8').match(/mobile-kit:\)\?([\w-]+)"/);
      if (named) assert.ok(skills.has(named[1]), `${c}/${g} names unknown skill ${named[1]}`);
    }
  }
});
