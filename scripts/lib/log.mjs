// Console helpers. In --json mode, human output goes to stderr so stdout stays machine-readable.

let jsonMode = false;
export function setJsonMode(on) { jsonMode = !!on; }
const out = (s) => (jsonMode ? process.stderr : process.stdout).write(s + '\n');

export const log = {
  info: (s) => out(s),
  ok: (s) => out(`✔ ${s}`),
  fail: (s) => out(`✖ ${s}`),
  warn: (s) => out(`! ${s}`),
  step: (s) => out(`→ ${s}`),
};

export function printJson(obj) { process.stdout.write(JSON.stringify(obj, null, 2) + '\n'); }

export function die(msg, code = 1) { process.stderr.write(`✖ ${msg}\n`); process.exit(code); }
