// Shared test helpers: temp copies of fixtures and fake executables on PATH.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const FIXTURES = path.join(ROOT, 'test', 'fixtures');

export function tmpDir(prefix = 'mk-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Copy a fixture project into a fresh temp dir and return its path. */
export function fixtureCopy(name) {
  const dest = path.join(tmpDir(), name);
  fs.cpSync(path.join(FIXTURES, name), dest, { recursive: true });
  return dest;
}

/**
 * Create a dir of fake executables. `bins` maps name → shell body. Every call is appended to
 * <dir>/calls.log as "name arg1 arg2 ...".
 */
export function shimDir(bins) {
  const dir = tmpDir('mk-shims-');
  for (const [name, body] of Object.entries(bins)) {
    const file = path.join(dir, name);
    fs.writeFileSync(file, `#!/bin/sh\necho "${name} $*" >> "${dir}/calls.log"\n${body ?? 'exit 0'}\n`);
    fs.chmodSync(file, 0o755);
  }
  return dir;
}

export const calls = (dir) => {
  try { return fs.readFileSync(path.join(dir, 'calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch { return []; }
};

/** Run a kit script with node; returns { code, stdout, stderr, json? }. */
export function runScript(script, args, { env, cwd } = {}) {
  const res = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    encoding: 'utf8', cwd: cwd ?? ROOT, env: { ...process.env, ...env },
  });
  let json;
  try { json = JSON.parse(res.stdout); } catch { /* not JSON */ }
  return { code: res.status, stdout: res.stdout, stderr: res.stderr, json };
}

/** Write a skills-lock.json entry + SKILL.md, as the skills CLI would. */
export function fakeSkill(cwd, name, source) {
  const dir = path.join(cwd, '.claude', 'skills', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: test\n---\n`);
  const lockPath = path.join(cwd, 'skills-lock.json');
  const lock = fs.existsSync(lockPath) ? JSON.parse(fs.readFileSync(lockPath, 'utf8')) : { version: 1, skills: {} };
  if (source) lock.skills[name] = { source, sourceType: 'github', computedHash: `hash-${name}` };
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2));
}
