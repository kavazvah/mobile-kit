# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- README: added why, what each skill produces, how it works (diagram), repository layout, status and badges.

## [0.1.0] - 2026-10-01

First release.

### Added
- Plugin skeleton: `plugin.json`, `marketplace.json` (plugin at the repo root, `source: "./"`), and the folder layout.
- `device-matrix-qa` skill, moved from the seed. Script paths now use `${CLAUDE_PLUGIN_ROOT}`.
- Shared references `shared/layout-rules.md` and `shared/checklist.md` (moved from the seed skill).
- Maintainer instructions live in `.claude/CLAUDE.md`: a `CLAUDE.md` at the plugin root fails `claude plugin validate --strict`, because the plugin root is the repo root.
- Core scripts (Node ≥ 18, zero dependencies): `scripts/detect.mjs`, `install-externals.mjs` (with `--dry-run`, `--refresh`, `--remove`), `scaffold.mjs`, `doctor.mjs`, and `scripts/lib/` (`args`, `exec`, `fs`, `log`, `modules`).
- User-invoked skills `init`, `doctor` and `update`.
- `shared/claude-md-section.md` and the `tokens.ts` / `Screen.tsx` templates.
- Unit tests (`npm test`) with fixtures `test/fixtures/expo-router-app` and `bare-rn-app`.
- `scripts/lib/devices.mjs`: shared adb / emulator / simctl backend (list, boot, install, launch, deep links, screenshots, logs, per-app locale), and the `scripts/device.mjs` CLI on top of it.
- `device-control` skill with `references/backends.md` (Desktop iOS Simulator pane, agent-device, raw fallback).
- `device-matrix-qa`: locales (`none`, `deeplink-param`, `android-app-locale`), `--locales` filter, `--json` for `capture` and `shoot`, optional `android.applySettleMs`.
- Fake `adb` / `xcrun` executables in `test/shims/` and tests for devices, device.mjs and the matrix.
- `mobile-testing` skill with `references/{strategy,maestro,ci}.md` and `assets/{maestro-flow.example.yaml,component.test.example.tsx}`.
- `scaffold.mjs --testing`: Jest preset, npm scripts `test` / `test:e2e` (/ `test:e2e:ios`), an example component test matching the installed RNTL major, and `.maestro/smoke.yaml` (`scripts/lib/testing-scaffold.mjs`).
- `scripts/scan-hardcoded.mjs`: heuristic scan for raw spacing / radius / font-size numbers in styles and raw colour literals, with token suggestions, `--json`, `--max`, `// mk-ignore`, `// mk-ignore-next-line` and `// mk-ignore-file`.
- `ui-ux-review` skill (audit / fix / quick) with `references/{ux-heuristics,states,a11y,copy}.md`, and the read-only `ui-reviewer` agent.
- `design-proposals` skill with `references/{rubric,design-lab}.md`, `assets/{DesignLab.template.tsx,DesignLabHost.template.tsx,Variant.template.tsx,decision.template.md}` (the host draws the lab as an overlay, so it works under tab navigators), the read-only `design-critic` agent, and `scripts/design-lab.mjs` (scaffold, new, register, config).
- `doctor`: disk space check (warns below 10 GB free; native builds need about that much).
- `mobile-motion` skill with `references/{motion-rules,review}.md`, a delegation table (Software Mansion, Emil Kowalski, Skia performance, `expo:expo-animation`), and `shared/templates/motion.ts` (duration/spring tokens + `useMotion()`, type-checked against Reanimated 4.7). `scaffold.mjs --motion` writes it (action `motion-tokens`).
- `device.mjs record` / `devices.record()`: screen recordings on Android (`screenrecord`) and iOS (`simctl io recordVideo`).
- Plugin evals in `evals/`: 19 skill-triggering cases (3 per model-invoked skill, each also asserting that the most confusable sibling skill doesn't fire, plus one out-of-scope request).
- CI (`.github/workflows/ci.yml`): `node --test` on Ubuntu and macOS with Node 20 and 22, and `claude plugin validate --strict` through `npx` (works without credentials). `evals.yml` runs the evals on demand when an `ANTHROPIC_API_KEY` secret is set.
- Tests that every `${CLAUDE_PLUGIN_ROOT}/…` path and relative Markdown link resolves.
- README.
- `external-skills.json`: verified manifest of 12 third-party externals (Phase 1). Changes from the seed:
  - `vercel-rn`: skill is `vercel-react-native-skills`.
  - `platform-design`: skills are `ios-design-guidelines` and `android-design-guidelines`.
  - `agent-device`: also installs `android-emulator` and `ios-simulator`.
  - `callstack-github-actions`: the plugin did not exist; now skills-cli from `callstackincubator/agent-skills`.
  - `callstack-rn-testing`: found upstream at `callstack/react-native-testing-library` (`react-native-testing`).
  - `callstack-rn-best-practices`: now plugin `building-react-native-apps@callstack-agent-skills`.
  - `expo-official`: marketplace set to `anthropics/claude-plugins-official`, because a fresh machine has not registered it yet.
  - `reanimated-skia-performance`: source has no license; kept with a `licenseWarning`.

### Changed
- The example component test imports `expect`, `jest` and `test` from `@jest/globals`, so it type-checks under TypeScript 6 (whose `types` default no longer loads `@types/jest`). `@types/jest` is no longer suggested.
- `matrix.mjs` now uses `scripts/lib/devices.mjs`. CLI and behaviour are unchanged: on the same config, the old and new script issue identical adb/simctl calls and produce identical output, manifest and report.

[Unreleased]: https://github.com/kavazvah/mobile-kit/compare/mobile-kit--v0.1.0...HEAD
[0.1.0]: https://github.com/kavazvah/mobile-kit/releases/tag/mobile-kit--v0.1.0
