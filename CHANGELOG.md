# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Plugin skeleton: `plugin.json`, `marketplace.json` (plugin at the repo root, `source: "./"`), and the folder layout.
- `device-matrix-qa` skill, moved from the seed. Script paths now use `${CLAUDE_PLUGIN_ROOT}`.
- Shared references `shared/layout-rules.md` and `shared/checklist.md` (moved from the seed skill).
- Maintainer instructions live in `.claude/CLAUDE.md`: a `CLAUDE.md` at the plugin root fails `claude plugin validate --strict`, because the plugin root is the repo root.
