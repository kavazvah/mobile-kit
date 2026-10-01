---
name: update
description: Update mobile-kit in this project. Adds or removes modules, refreshes the installed third-party skills and plugins, and re-renders the CLAUDE.md section and the lock after a kit upgrade.
disable-model-invocation: true
argument-hint: "[--add <module>] [--remove <module>]"
---

# mobile-kit update

Arguments: `$ARGUMENTS`

1. Read `.mobile-kit.json`. If it is missing, stop and tell the user to run `/mobile-kit:init`.
2. Work out the new module set: the lock's `modules`, plus every `--add`, minus every `--remove`. `core` can't be removed. Known modules: core, devices, matrix, testing, ui-ux, design, motion, perf, motion-skia, haptics. Adding `motion-skia` needs the user's consent to its missing license (pass `--allow-unlicensed` only then).
3. Externals: preview, then run. `--refresh` updates what is already installed (`npx skills update` for skills-cli externals, `claude plugin update` for plugins):

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/install-externals.mjs --modules <new set> [--remove <removed modules>] --refresh --dry-run
   node ${CLAUDE_PLUGIN_ROOT}/scripts/install-externals.mjs --modules <new set> [--remove <removed modules>] --refresh --json
   ```

   Handle `manual`, `collision` and `failed` the same way as in `/mobile-kit:init`. Removing a module removes only the externals no remaining module needs.
4. Re-render the project files. The CLAUDE.md section and the lock are always refreshed; this also picks up a new kit version:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs --modules <new set> --dry-run
   node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs --modules <new set> --only claude-md,lock,gitignore
   ```

   Create `qa/device-matrix.json` (action `matrix-config`) only when `matrix` was just added and the file doesn't exist. Never overwrite it.
5. Run `node ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs` and report: modules before and after, externals added/removed/updated, `git status --short`, and what to commit. Plugin updates need `/reload-plugins` or a new session.
