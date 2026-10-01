# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- `matrix.mjs` now uses `scripts/lib/devices.mjs`. CLI and behaviour are unchanged: on the same config, the old and new script issue identical adb/simctl calls and produce identical output, manifest and report.
