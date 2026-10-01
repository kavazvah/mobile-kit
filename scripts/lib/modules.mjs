// Module catalogue (SPEC §6.2) and the CLAUDE.md routing rows each module contributes.
import path from 'node:path';
import { KIT_ROOT, readJson } from './fs.mjs';

export const MODULES = {
  core: { default: true, always: true, skills: [] },
  devices: { default: true, skills: ['device-control'] },
  matrix: { default: true, skills: ['device-matrix-qa'], requires: ['devices'] },
  testing: { default: true, skills: ['mobile-testing'] },
  'ui-ux': { default: true, skills: ['ui-ux-review'] },
  design: { default: false, skills: ['design-proposals'] },
  motion: { default: true, skills: ['mobile-motion'] },
  perf: { default: false, skills: [] },
  'motion-skia': { default: false, skills: [] },
  haptics: { default: false, skills: [] },
};

export const DEFAULT_MODULES = Object.keys(MODULES).filter((m) => MODULES[m].default);

/** Normalise a module list: validate names, add core and required modules, keep catalogue order. */
export function resolveModules(names) {
  const unknown = names.filter((n) => !MODULES[n]);
  if (unknown.length) throw new Error(`Unknown module(s): ${unknown.join(', ')}. Known: ${Object.keys(MODULES).join(', ')}`);
  const set = new Set(['core', ...names]);
  for (const n of [...set]) for (const r of MODULES[n].requires ?? []) set.add(r);
  return Object.keys(MODULES).filter((m) => set.has(m));
}

export function loadManifest(file = path.join(KIT_ROOT, 'external-skills.json')) {
  const m = readJson(file);
  if (!m?.externals) throw new Error(`Cannot read externals manifest: ${file}`);
  return m;
}

/** Task → skill routing rows for the CLAUDE.md section. `ext` = installed external ids. */
export function routingRows(modules, ext = new Set()) {
  const has = (m) => modules.includes(m);
  const rows = [];
  if (has('core')) {
    rows.push(['Layout, spacing, safe areas, insets (writing any UI)', '`mobile-kit` shared rules (loaded by `mobile-kit:device-matrix-qa`)']);
    if (ext.has('expo-official')) rows.push(['Expo APIs, Expo Router, EAS, SDK upgrades', '`expo:*` skills (start with `expo:expo-overview`)']);
    if (ext.has('vercel-rn')) rows.push(['React Native performance rules while writing code', '`vercel-react-native-skills`']);
  }
  if (has('devices')) rows.push(['Build, boot, install, launch, deep-link, logs, screenshot', '`mobile-kit:device-control`' + (ext.has('agent-device') ? ' (drives `agent-device`)' : '')]);
  if (has('matrix')) rows.push(['Does a screen fit on small/large phones, font scale, dark mode, locales', '`mobile-kit:device-matrix-qa`']);
  if (has('testing')) {
    const extra = [ext.has('callstack-rn-testing') && '`react-native-testing`', ext.has('callstack-github-actions') && '`github-actions`'].filter(Boolean);
    rows.push(['Unit, component and E2E tests, CI', '`mobile-kit:mobile-testing`' + (extra.length ? `, then ${extra.join(', ')}` : '')]);
  }
  if (has('ui-ux')) rows.push(['Review or fix UI/UX of existing screens', '`mobile-kit:ui-ux-review`' + (ext.has('platform-design') ? ' (platform rules: `ios-design-guidelines`, `android-design-guidelines`)' : '')]);
  if (has('design')) rows.push(['Two or three design options for a screen', '`mobile-kit:design-proposals`' + (ext.has('rubenglez-mobile-design') ? ' (process: `mobile-design`)' : '')]);
  if (has('motion')) {
    const extra = [ext.has('emil-animate-expo') && '`animate-expo`', ext.has('swm-rn-best-practices') && '`react-native-best-practices`', ext.has('expo-official') && '`expo:expo-animation`'].filter(Boolean);
    rows.push(['Animations, gestures, transitions', '`mobile-kit:mobile-motion`' + (extra.length ? `, then ${extra.join(', ')}` : '')]);
  }
  if (has('perf') && ext.has('callstack-rn-best-practices')) rows.push(['Profiling and performance fixes', '`building-react-native-apps:react-native-best-practices`']);
  if (has('motion-skia') && ext.has('reanimated-skia-performance')) rows.push(['Skia / canvas animation performance', '`reanimated-skia-performance`']);
  if (has('haptics') && ext.has('swm-pulsar-haptics')) rows.push(['Haptics', '`pulsar-haptics`']);
  return rows;
}
