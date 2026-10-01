# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Plugin skeleton: `plugin.json`, `marketplace.json` (plugin at the repo root, `source: "./"`), and the folder layout.
- `device-matrix-qa` skill, moved from the seed. Script paths now use `${CLAUDE_PLUGIN_ROOT}`.
- Shared references `shared/layout-rules.md` and `shared/checklist.md` (moved from the seed skill).
- Maintainer instructions live in `.claude/CLAUDE.md`: a `CLAUDE.md` at the plugin root fails `claude plugin validate --strict`, because the plugin root is the repo root.
- `external-skills.json`: verified manifest of 12 third-party externals (Phase 1). Changes from the seed:
  - `vercel-rn`: skill is `vercel-react-native-skills`.
  - `platform-design`: skills are `ios-design-guidelines` and `android-design-guidelines`.
  - `agent-device`: also installs `android-emulator` and `ios-simulator`.
  - `callstack-github-actions`: the plugin did not exist; now skills-cli from `callstackincubator/agent-skills`.
  - `callstack-rn-testing`: found upstream at `callstack/react-native-testing-library` (`react-native-testing`).
  - `callstack-rn-best-practices`: now plugin `building-react-native-apps@callstack-agent-skills`.
  - `expo-official`: marketplace set to `anthropics/claude-plugins-official`, because a fresh machine has not registered it yet.
  - `reanimated-skia-performance`: source has no license; kept with a `licenseWarning`.
