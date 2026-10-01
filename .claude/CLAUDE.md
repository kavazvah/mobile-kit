# mobile-kit: instructions for Claude Code

This repository is **mobile-kit**, a public Claude Code plugin and marketplace. It gives any React Native / Expo repository a set of mobile-development skills: device control, a multi-size device matrix, testing, design proposals with evaluation, UI/UX review and fixes, and motion. It also installs selected third-party skills into a project on demand.

## Read first
1. `docs/SPEC.md` is the full specification and the source of truth. Follow its phases in order.
2. `docs/external-skills.seed.json` lists the third-party skills to integrate. **Every entry is unverified until Phase 1 verifies it.**
3. `seed/device-matrix-qa/` holds an existing, working skill. Move it into the plugin as described in SPEC §5.2. Don't rewrite it from scratch.

## Working rules
- Work phase by phase (SPEC §9). At the end of each phase: run the phase's checks, commit, and give a short report. Don't start the next phase in the same turn unless asked.
- Plugin format facts come from the official docs, not from memory. When unsure, fetch them:
  - https://code.claude.com/docs/en/plugins-reference (plugin.json, layout, `${CLAUDE_PLUGIN_ROOT}`)
  - https://code.claude.com/docs/en/plugin-marketplaces (marketplace.json)
  - https://code.claude.com/docs/en/plugins/host-marketplace (hosting, versions, `--scope project`)
  - https://code.claude.com/docs/en/skills (SKILL.md frontmatter)
  - https://code.claude.com/docs/en/plugin-evals (eval cases)
- Run `claude plugin validate . --strict` after every change to manifests, skills or agents.
- Scripts: Node ≥ 18, ESM (`.mjs`), **zero runtime dependencies**, cross-platform where possible (macOS and Linux required; Windows best-effort). Every script has `--help`, and supports `--dry-run` where it changes anything.
- Never vendor (copy) third-party skills into this repo. Reference them by source and install them into the *target* project.
- Skill bodies are written in English, concise and imperative. Each `SKILL.md` stays under ~250 lines; move detail into `references/`.
- Never add the plugin version to both `plugin.json` and `marketplace.json` (keep it only in `plugin.json`).
- Ask the maintainer before: renaming the plugin or marketplace, adding a new third-party source, or changing a default module set.
