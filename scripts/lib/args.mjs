// Minimal flag parser shared by all kit scripts. Zero dependencies.
// Supports --flag value, --flag=value, boolean flags and positional args.

/**
 * @param {string[]} argv  process.argv.slice(2)
 * @param {{ boolean?: string[], string?: string[], alias?: Record<string,string> }} spec
 */
export function parseArgs(argv, spec = {}) {
  const bools = new Set(spec.boolean || []);
  const strings = new Set(spec.string || []);
  const alias = spec.alias || {};
  const out = { _: [] };
  for (const b of bools) out[b] = false;
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok === '--') { out._.push(...argv.slice(i + 1)); break; }
    if (!tok.startsWith('-') || tok === '-') { out._.push(tok); continue; }
    let key = tok.replace(/^--?/, '');
    let val;
    const eq = key.indexOf('=');
    if (eq >= 0) { val = key.slice(eq + 1); key = key.slice(0, eq); }
    key = alias[key] || key;
    if (key.startsWith('no-') && bools.has(key.slice(3))) { out[key.slice(3)] = false; continue; }
    if (bools.has(key)) { out[key] = val === undefined ? true : val !== 'false'; continue; }
    if (val === undefined) {
      const next = argv[i + 1];
      if (next !== undefined && (!next.startsWith('-') || strings.has(key))) { val = next; i++; }
      else if (strings.has(key)) throw new Error(`--${key} needs a value`);
      else val = true;
    }
    out[key] = val;
  }
  return out;
}

/** Split "a,b , c" into ["a","b","c"]. Accepts arrays and undefined. */
export function list(v) {
  if (v == null || v === true || v === false) return [];
  if (Array.isArray(v)) return v.flatMap(list);
  return String(v).split(',').map((s) => s.trim()).filter(Boolean);
}

/** Print help and exit when --help / -h is present. */
export function handleHelp(args, text) {
  if (args.help || args.h) { process.stdout.write(text.trim() + '\n'); process.exit(0); }
}
