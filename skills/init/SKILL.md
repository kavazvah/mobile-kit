---
name: init
description: Set up mobile-kit in this React Native / Expo project. Detects the project, lets the user choose modules, installs the selected third-party skills at project scope, and writes the device matrix config, the CLAUDE.md section and the .mobile-kit.json lock. Safe to re-run.
disable-model-invocation: true
argument-hint: "[--modules a,b,...] [--yes]"
---

# mobile-kit init

Arguments: `$ARGUMENTS`

Scripts live in `${CLAUDE_PLUGIN_ROOT}/scripts/`. Run them from the project root with Node ≥ 18. Never edit the files they write by hand while this skill runs.

## 1. Detect

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/detect.mjs --json
```

- `ok: false` or neither `isExpo` nor `isReactNative`: stop and tell the user this is not a React Native project.
- Bare React Native (`isReactNative` and not `isExpo`): say that mobile-kit is Expo-first. Layout rules, testing and review work; device builds and the Design Lab may need manual steps. Continue only if the user agrees.
- Show the user a short summary: Expo SDK, router, app ids, scheme, locales, theme dir, routes, and every entry in `warnings`.

## 2. Choose modules

| Module | Default | Adds |
|---|---|---|
| core | always | shared rules, CLAUDE.md section; Expo official plugin, Vercel RN rules |
| devices | on | device-control; agent-device skills |
| matrix | on | device-matrix-qa (needs devices) |
| testing | on | mobile-testing; RNTL + GitHub Actions skills |
| ui-ux | on | ui-ux-review; iOS/Android design guideline skills |
| motion | on | mobile-motion; Software Mansion + Emil Kowalski animation skills |
| design | off | design-proposals; mobile-design skill |
| perf | off | Callstack `building-react-native-apps` plugin |
| motion-skia | off | reanimated-skia-performance (source has **no license**) |
| haptics | off | Software Mansion pulsar-haptics |

- `--modules a,b` in the arguments: use exactly those (core is added automatically).
- `--yes`: take the defaults without asking.
- Otherwise show the table and ask the user which modules to enable. Defaults: `core,devices,matrix,testing,ui-ux,motion`.
- If `motion-skia` is chosen, show its license warning and add `--allow-unlicensed` below only if the user accepts. With `--yes`, never add it.
- If `appIds.android`, `appIds.ios` or `scheme` is missing and `matrix` is on, ask the user for them (they may skip). With `--yes`, leave them empty.

## 3. Install externals

Preview first, then run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/install-externals.mjs --modules <list> --dry-run
node ${CLAUDE_PLUGIN_ROOT}/scripts/install-externals.mjs --modules <list> --json
```

Handle each item by `status`:
- `installed` / `present`: fine.
- `manual`: the `claude` CLI could not run from here. Show the printed commands; the user runs them in a terminal. Continue.
- `collision`: a folder in `.claude/skills/` came from another source. Report it; never delete or overwrite it.
- `failed`: report the reason and continue. One failure does not stop init.

## 4. Scaffold project files

Preview, show the plan to the user, then apply what they confirm:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs --modules <list> --dry-run [--android-package <id>] [--ios-bundle-id <id>] [--scheme <s>]
node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs --modules <list> [same overrides] [--theme] [--only <ids>] [--overwrite <ids>]
```

- Actions: `matrix-config` (`qa/device-matrix.json`), `gitignore` (`qa-shots/`), `claude-md` (section between `<!-- mobile-kit:start -->` and `<!-- mobile-kit:end -->`), `theme`, `lock` (`.mobile-kit.json`).
- On a re-run, show the diff of every `update` and apply only the actions the user confirms (`--only`).
- `conflict` means an existing file differs. Never pass `--overwrite` unless the user explicitly agrees for that action.
- `theme`: if the plan's "still to do" list offers the token templates, ask the user first. Add `--theme` only on a yes. With `--yes`, skip it.
- If `CLAUDE.md` does not exist and `AGENTS.md` does, the new `CLAUDE.md` starts with `@AGENTS.md` so both are loaded.

## 5. Doctor

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs
```

Show the ✖ and ! lines with their fix commands. Don't install system tools without asking.

## 6. Report

- What was installed (all at project scope) and what was skipped or needs manual steps.
- `git status --short`.
- Next steps:
  1. Commit `.claude/`, `skills-lock.json`, `.mobile-kit.json`, `qa/device-matrix.json` and `CLAUDE.md`.
  2. Teammates who clone the repo get the skills in `.claude/skills/` automatically. Each teammate runs `claude plugin install <plugin> --scope project` once for every plugin external, because a committed `.claude/settings.json` enables a plugin but doesn't download it.
  3. Run `/reload-plugins` or start a new session so newly installed skills load.
