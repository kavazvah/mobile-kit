// Process helpers: run a command without throwing, and find executables on PATH.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const isWin = process.platform === 'win32';

/**
 * Run a command and capture its output. Never throws.
 * @returns {{ code: number|null, stdout: string, stderr: string, error?: string }}
 */
export function run(bin, args = [], opts = {}) {
  const res = spawnSync(bin, args, {
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    timeout: opts.timeout ?? 10 * 60 * 1000,
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    input: opts.input,
    // .cmd shims (npx, claude) need a shell on Windows.
    shell: isWin && !path.extname(bin),
  });
  return {
    code: res.status,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    ...(res.error ? { error: res.error.message } : {}),
  };
}

/** Absolute path of an executable on PATH, or null. */
export function which(bin, env = process.env) {
  const dirs = (env.PATH || env.Path || '').split(path.delimiter).filter(Boolean);
  const exts = isWin ? (env.PATHEXT || '.EXE;.CMD;.BAT').split(';').concat('') : [''];
  for (const dir of dirs) {
    for (const ext of exts) {
      const p = path.join(dir, bin + ext);
      try {
        const st = fs.statSync(p);
        if (st.isFile() && (isWin || (st.mode & 0o111))) return p;
      } catch { /* not here */ }
    }
  }
  return null;
}

/** Render a command for display, quoting arguments that need it. */
export function formatCmd(bin, args = []) {
  const q = (s) => (/^[\w@%+=:,./-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);
  return [bin, ...args].map(q).join(' ');
}
