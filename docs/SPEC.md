# mobile-kit: specification v1

Status: approved for build. Owner: the repository maintainer. Builder: Claude Code.

---

## 1. Goal

One public Claude Code plugin that turns any React Native / Expo repository into a well-equipped mobile project with one command:

```
/plugin marketplace add <github-user>/mobile-kit
/plugin install mobile-kit@<marketplace-name>
/mobile-kit:init
```

After `init`, Claude Code in that project:
- knows the layout, spacing, platform and motion rules (shared references);
- can boot and drive iOS simulators and Android emulators, and capture screens across many Android sizes and several iPhones (device matrix);
- has a test strategy and scaffolding (unit, component, E2E, exploratory);
- can produce 2–3 design variants of a screen, render them on devices, and have an independent agent score them;
- can audit existing screens for UI/UX problems, fix them, and re-verify;
- has project motion tokens and delegates animation implementation details to the best third-party skills;
- has the selected third-party skills installed at project scope, so every teammate who clones the repo gets them.

## 2. Decisions (fixed for v1)

| Topic | Decision |
|---|---|
| Visibility / license | Public GitHub repo, MIT license. |
| Target stack | **Expo-first** (Expo SDK ≥ 52, expo-router optional). Bare React Native is *detected* and gets a warning plus the subset that works (layout rules, testing, review). Full bare-RN support is out of scope for v1. |
| Design-proposal output | **Code variants** behind a dev-only Design Lab route, rendered on real devices/emulators. No Figma or mockup tooling in v1. |
| Third-party skills | Referenced, never vendored. Installed into the target project at **project scope**. Versions/sources tracked in `external-skills.json`. |
| Component type | Use **skills** for everything, including user-invoked actions (`init`, `doctor`, `update`), because the docs prefer `skills/` over `commands/` for new plugins. User-only skills set `disable-model-invocation: true` (VERIFY the exact frontmatter key in the skills docs). |
| Evaluation | Design scoring and UI review verdicts come from **subagents that did not write the code** (`agents/`). |
| Languages | The kit supports multi-locale apps; the matrix can run per locale (§5.2.3). |

## 3. Repository layout (target)

```
mobile-kit/
├── .claude-plugin/
│   ├── marketplace.json
│   └── plugin.json
├── skills/
│   ├── init/                    # user-invoked: /mobile-kit:init
│   │   └── SKILL.md
│   ├── doctor/                  # user-invoked: /mobile-kit:doctor
│   │   └── SKILL.md
│   ├── update/                  # user-invoked: /mobile-kit:update
│   │   └── SKILL.md
│   ├── device-control/
│   │   ├── SKILL.md
│   │   └── references/backends.md
│   ├── device-matrix-qa/        # moved from seed/
│   │   ├── SKILL.md
│   │   ├── assets/device-matrix.example.json
│   │   └── scripts/matrix.mjs
│   ├── mobile-testing/
│   │   ├── SKILL.md
│   │   ├── references/{strategy.md,maestro.md,ci.md}
│   │   └── assets/{maestro-flow.example.yaml,component.test.example.tsx}
│   ├── design-proposals/
│   │   ├── SKILL.md
│   │   ├── references/{rubric.md,design-lab.md}
│   │   └── assets/{DesignLab.template.tsx,decision.template.md}
│   ├── ui-ux-review/
│   │   ├── SKILL.md
│   │   └── references/{ux-heuristics.md,states.md,a11y.md}
│   └── mobile-motion/
│       ├── SKILL.md
│       └── references/{motion-rules.md,review.md}
├── agents/
│   ├── ui-reviewer.md
│   └── design-critic.md
├── shared/
│   ├── layout-rules.md          # from seed rn-layout-rules.md
│   ├── checklist.md             # from seed checklist.md
│   ├── claude-md-section.md     # template injected into target CLAUDE.md
│   └── templates/{tokens.ts,motion.ts,Screen.tsx}
├── scripts/
│   ├── lib/{args.mjs,exec.mjs,fs.mjs,log.mjs,devices.mjs}
│   ├── detect.mjs               # project detection → JSON
│   ├── install-externals.mjs    # installs third-party skills per module
│   ├── scaffold.mjs             # writes config/templates/CLAUDE.md section
│   ├── doctor.mjs
│   └── scan-hardcoded.mjs       # static check for raw spacing/colors
├── external-skills.json         # verified manifest (built from docs/external-skills.seed.json)
├── evals/                       # plugin eval cases (§8)
├── test/                        # node:test unit tests + fake adb/xcrun shims
├── .github/workflows/ci.yml
├── README.md
├── CHANGELOG.md
└── LICENSE
```

Path rules: every path in manifests starts with `./`. Skills reference bundled files as `${CLAUDE_PLUGIN_ROOT}/...` inside the Markdown body; Claude Code substitutes it when the skill loads. The variable is **not** in the Bash tool's environment, so always write the substituted reference in the skill text, never `$CLAUDE_PLUGIN_ROOT` inside a shell snippet expected to expand at runtime.

There is no top-level `bin/` directory (claude.ai org sync rejects it). Keep executables in `scripts/`.

## 4. Manifests

### 4.1 `.claude-plugin/plugin.json`
```json
{
  "name": "mobile-kit",
  "displayName": "Mobile Kit (React Native / Expo)",
  "version": "0.1.0",
  "description": "Device control, multi-size device matrix, testing, design proposals, UI/UX review and motion for React Native / Expo, plus on-demand install of curated third-party skills.",
  "author": { "name": "<maintainer name>", "url": "https://github.com/<github-user>" },
  "homepage": "https://github.com/<github-user>/mobile-kit",
  "repository": "https://github.com/<github-user>/mobile-kit",
  "license": "MIT",
  "keywords": ["react-native", "expo", "mobile", "emulator", "simulator", "qa", "design", "animation"]
}
```
Leave `<placeholders>` until the maintainer supplies them, and list them in the Phase 0 report.

### 4.2 `.claude-plugin/marketplace.json`
```json
{
  "name": "<marketplace-name, e.g. vahid-mobile>",
  "description": "Mobile development plugins for Claude Code",
  "owner": { "name": "<maintainer name>" },
  "plugins": [
    {
      "name": "mobile-kit",
      "source": "./",
      "description": "Mobile dev kit for React Native / Expo"
    }
  ]
}
```
The plugin lives at the repo root (`source: "./"`). VERIFY that a root-relative source of `"./"` is accepted by `claude plugin validate`. If not, move the plugin into `plugins/mobile-kit/` and set `source` accordingly; record the decision in the CHANGELOG. Keep the entry `name` identical to `plugin.json` `name`. Don't put `version` in the marketplace entry.

### 4.3 Release rule
Bump `version` in `plugin.json` on every release (users don't receive new commits until the string changes). Tag releases `mobile-kit--v<version>`. Keep `CHANGELOG.md` (Keep a Changelog format).

## 5. Skills

Common frontmatter rules: `name` matches the folder. `description` is ≤ 2 sentences, says *when* to use the skill, and includes trigger phrases. Descriptions must not overlap. If two skills could claim the same request, the narrower one names the other ("For X use device-matrix-qa instead").

### 5.1 `device-control`
**Purpose:** one consistent way to list, boot, build, install, launch, deep-link, log and screenshot on iOS simulators and Android emulators.

**Backends, in priority order (detect at runtime):**
1. **Claude Code desktop built-in simulator/emulator tools**, if present in the session's tool list. Use them for interactive viewing.
2. **`agent-device` CLI** (Callstack), for accessibility snapshots, element refs, press/fill and React DevTools profiling.
3. **Raw `adb` / `emulator` / `xcrun simctl`** fallback, implemented in `scripts/lib/devices.mjs`.

**`scripts/lib/devices.mjs`** (shared with device-matrix-qa): `listAndroid()`, `listAvds()`, `bootAvd(name, {headless})`, `waitForBoot(serial)`, `listIosSims()`, `ensureSim(match[])`, `bootSim(udid)`, `install(platform, target, path)`, `launch(platform, target, appId)`, `openUrl(platform, target, url)`, `screenshot(platform, target, file)`, `logs(platform, target, {appId, level, lines})`. Refactor `matrix.mjs` to import from it (behaviour must not change; keep its CLI identical).

**SKILL.md content:**
- Build commands: dev (`npx expo run:android|ios`), release (`--variant release` / `--configuration Release`), and when to use each (release for animation/perf judgement and for iOS matrix runs).
- How to find the built `.app` / `.apk`.
- Deep-link format from the app `scheme`. Get the scheme with `npx expo config --type public --json` (VERIFY the flags).
- Log reading: `adb logcat --pid=$(adb shell pidof -s <pkg>)` and `xcrun simctl spawn <udid> log stream --predicate 'process == "<name>"'`.
- Rule: never leave devices modified (screen overrides, font scale, dark mode). Always restore.
- iOS needs macOS + Xcode. On Linux/Windows, say so and continue with Android.

### 5.2 `device-matrix-qa`
Move `seed/device-matrix-qa/` here. Changes:
1. Replace every `.claude/skills/device-matrix-qa/scripts/matrix.mjs` in SKILL.md with `${CLAUDE_PLUGIN_ROOT}/skills/device-matrix-qa/scripts/matrix.mjs`.
2. Move `references/rn-layout-rules.md` → `shared/layout-rules.md` and `references/checklist.md` → `shared/checklist.md`, and update links to `${CLAUDE_PLUGIN_ROOT}/shared/...`.
3. Refactor onto `scripts/lib/devices.mjs` (§5.1).
4. **Locales** (new): config gains
   ```json
   "locales": { "list": ["en"], "strategy": "none" }
   ```
   with strategies:
   - `"none"`: a single run.
   - `"deeplink-param"`: append `?lang=<tag>` (the param name is configurable as `"param"`) to each screen URL. The app must honour it in dev builds. Document a 10-line snippet for expo-router + i18next.
   - `"android-app-locale"`: `adb shell cmd locale set-app-locales <pkg> --locales <tag>` (Android 13+; VERIFY the syntax). iOS falls back to `deeplink-param`.

   Output path becomes `qa-shots/<run>/<platform>/<profile>/<locale>/<screen>.png` when more than one locale is set. The report groups columns by profile and locale.
5. Add `--json` output to `capture` and `shoot` (a machine-readable summary on stdout) for the review agents.
6. Unit tests with fake `adb`/`xcrun` shims in `test/shims/` (see §8.1).

### 5.3 `mobile-testing`
**Purpose:** decide what to test at which layer, scaffold it, run it, and wire CI.

- **Layers:**
  - unit: pure logic, Jest (`jest-expo` preset).
  - component: React Native Testing Library; query by role/label/text, `testID` only as a last resort.
  - E2E: Maestro flows in `.maestro/`, run on an emulator/simulator.
  - exploratory: `agent-device` dogfood-style session that writes a bug report with screenshots.
- **Conventions:** `testID` format `<screen>.<element>` (e.g. `settings.save-button`); one Maestro flow per critical journey; flows use `appId` from the config; no sleeps, only `extendedWaitUntil`.
- **Scaffold (on request, idempotent):** `jest` config check/add, one example component test, `.maestro/smoke.yaml`, and npm scripts `test`, `test:e2e`.
- **CI** (`references/ci.md`): GitHub Actions for unit/component on every PR; E2E either on EAS Workflows or on an Android emulator in Actions. Delegate details to Callstack's `github-actions` skill if it is installed.
- **Reporting:** a failing E2E step produces a screenshot plus the last 100 log lines (via device-control).

### 5.4 `design-proposals`
**Purpose:** produce and evaluate 2–3 alternative designs of a screen or component before committing to one.

**Workflow:**
1. **Brief:** restate the goal, users, primary action, constraints (tokens, platforms, locales, content length). Ask at most 2 questions if they are blocking.
2. **Context:** read `shared/layout-rules.md`, the project tokens (`src/theme/*` or the path recorded in `.mobile-kit.json`), and 1–2 existing screens to match the visual language.
3. **Variants:** create `src/design-lab/<feature>/<VariantA|B|C>.tsx`. Each variant has a one-line thesis in a header comment (e.g. "A: list-first, dense"). The variants must differ in structure or hierarchy, not just colour. All of them use tokens only.
4. **Design Lab route:** scaffold once from `assets/DesignLab.template.tsx` into `app/__design-lab/[feature].tsx` (expo-router) or a dev-only screen otherwise. It shows a segmented switcher A/B/C and accepts a deep link `<scheme>://__design-lab/<feature>?v=A`. In non-dev builds it redirects to `/` (`if (!__DEV__)`).
5. **Render:** use device-matrix-qa with screens `__design-lab/<feature>?v=A|B|C` on `small-360`, `standard-411` and one iPhone, plus `font-200` on small.
6. **Evaluate:** spawn the `design-critic` agent with the screenshots, the brief and `references/rubric.md`. Don't score the variants yourself.
7. **Decide:** write `design/decisions/<YYYY-MM-DD>-<feature>.md` from `assets/decision.template.md` (brief, variants, scores table, chosen variant, why, follow-ups). Present it to the user, who makes the final call.
8. **Promote:** move the chosen variant into the real screen and delete the other variants. The lab route stays (it's reusable).

**Rubric (`references/rubric.md`):** score 1–5 with a one-line justification per criterion:
1. clarity of the primary action
2. visual hierarchy
3. consistency with tokens and existing screens
4. platform fit (iOS/Android)
5. fit at 360dp and at 2.0× font
6. accessibility (targets, contrast, labels)
7. multi-locale robustness
8. implementation cost and complexity

Weighting: criteria 1, 2 and 5 count double. Ties go to the lower implementation cost.

### 5.5 `ui-ux-review`
**Purpose:** audit existing screens, produce prioritized findings, fix them, and verify.

**Modes:**
- **audit:** inputs are a list of screens (or "all" from the matrix config). Run the matrix (or reuse a recent run if the user agrees), spawn `ui-reviewer` with the screenshots, `shared/checklist.md`, `references/ux-heuristics.md`, `references/states.md` and `references/a11y.md`. Also run `scripts/scan-hardcoded.mjs` on `src/` and `app/`. Merge everything into `qa/reviews/<YYYY-MM-DD>-<scope>.md`: one line per finding, `[P1|P2|P3] screen / profile: problem → proposed fix (file:line)`.
- **fix:** apply the fixes in priority order, in small batches (≤ 5 files per batch). After each batch, re-run only the affected screens/profiles and mark each finding fixed/open in the review file.
- **quick:** a single screen with no matrix: one capture on the current emulator plus the checklist. Use it during development.

**References to write:**
- `ux-heuristics.md`: Nielsen's 10 heuristics rewritten for mobile, each with 2–3 concrete RN checks.
- `states.md`: every data-driven screen must handle loading (skeleton > spinner for >300ms), empty (explanation + primary action), error (human message + retry), offline, partial data, and success feedback.
- `a11y.md`: `accessibilityRole`/`accessibilityLabel` rules, focus order, minimum contrast 4.5:1 (text) and 3:1 (large text/icons), touch targets, font scaling, reduce motion.
- Copy rules: sentence case, verbs on buttons, no truncated critical text, every locale checked.

**`scripts/scan-hardcoded.mjs`:** scans `.ts/.tsx/.js/.jsx` (excluding `node_modules`, the theme dir and `*.test.*`). It flags:
- numeric literals other than 0/1 on padding*, margin*, gap, rowGap, columnGap, top/left/right/bottom, borderRadius and fontSize inside style objects or `StyleSheet.create`;
- hex/rgb colour literals outside the theme dir.

Options: `--json`, `--max <n>` (exit 1 if more), and an inline escape `// mk-ignore`. Output: file:line, property, value, and the suggested token (nearest value on the spacing scale). This is a heuristic regex/AST-lite scan, so document its limits.

### 5.6 `mobile-motion`
**Purpose:** make motion consistent and correct; implementation details are delegated.

- **Scaffold (on request):** `shared/templates/motion.ts` → the project theme dir:
  ```ts
  export const duration = { instant: 100, fast: 150, base: 220, slow: 320 } as const;
  export const spring = {
    snappy: { damping: 20, stiffness: 300, mass: 1 },
    gentle: { damping: 18, stiffness: 180, mass: 1 },
    bouncy: { damping: 12, stiffness: 220, mass: 1 },
  } as const;
  ```
  plus a `useMotion()` hook that returns `duration`/`spring` and a `reduced` flag from Reanimated's `useReducedMotion()`. When reduced, durations collapse to 0 or crossfade. VERIFY the APIs against the installed Reanimated version.
- **Rules:**
  - animate only transform/opacity unless there is a reason;
  - keep animations on the UI thread (worklets);
  - every gesture-driven motion is interruptible and hands off velocity;
  - respect reduce-motion;
  - judge motion only on a release build on a device or emulator, never in a dev build.
- **Delegation table in SKILL.md:**

  | Need | Skill |
  |---|---|
  | Reanimated / Gesture Handler / Skia / layout animations API | Software Mansion `react-native-best-practices` |
  | Whether and how to animate, timing, feel | Emil Kowalski `animate-expo` |
  | Canvas/shader performance | `reanimated-skia-performance` (optional module) |

  If a delegated skill is not installed, say so and suggest `/mobile-kit:update --add motion`.
- **Motion review** (`references/review.md`): checklist plus how to record a screen video (`adb shell screenrecord`, `xcrun simctl io <udid> recordVideo`) for the user.

### 5.7 `init` (user-invoked)
`disable-model-invocation: true`, argument hint `[--modules a,b] [--yes]`.

**Steps:**
1. **Detect:** `node ${CLAUDE_PLUGIN_ROOT}/scripts/detect.mjs --json` returns:
   - `isExpo`, `expoSdk`, `router` (expo-router yes/no), `reanimated` (version), `gestureHandler`, `skia`;
   - `platforms` (ios/ android/ dirs present or CNG);
   - `packageManager` (from the lockfile);
   - `appIds` (android package, iOS bundle id), `scheme`. Get these via `npx expo config --type public --json` when Expo, else from `app.json` / `android/app/build.gradle` / `Info.plist`;
   - `i18n` (i18next / expo-localization / lingui, plus locale list if found);
   - `themeDir` (existing tokens), `hasJest`, `hasMaestro`;
   - `routes` (list of `app/**` route files → deep-link paths, excluding `_layout` and `+` files).
2. **Choose modules:** show the detected summary and the module menu (§6.2). Defaults are `core,devices,matrix,testing,ui-ux,motion`; `design` and the optional ones are off. With `--yes`, take the defaults.
3. **Install externals:** `node ${CLAUDE_PLUGIN_ROOT}/scripts/install-externals.mjs --modules <list> [--dry-run]` (§6.3).
4. **Scaffold:** `node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs --modules <list>` writes, idempotently and never overwriting without asking:
   - `qa/device-matrix.json`, prefilled from detection (ids, scheme, screens from routes, locales);
   - theme templates only if no `themeDir` exists, and only after asking;
   - `.gitignore` entries `qa-shots/`;
   - the CLAUDE.md section from `shared/claude-md-section.md` between markers `<!-- mobile-kit:start -->` / `<!-- mobile-kit:end -->` (replace on re-run). It contains a task → skill routing table, project paths and the module list;
   - `.mobile-kit.json` (the lock): `{ "kitVersion", "modules", "externals": [{id, type, source, installedAt, ref?}], "themeDir", "configPath" }`.
5. **Doctor:** run `doctor` and print what is still missing on the machine.
6. **Report:** what was installed (project scope), what changed in git (`git status --short`), and the next steps (commit `.claude/`, `.mobile-kit.json`, `qa/device-matrix.json`, `CLAUDE.md`).

Re-running `init` is safe. It shows a diff of intended changes and applies only what the user confirms.

### 5.8 `doctor` (user-invoked)
`scripts/doctor.mjs [--json]` checks:
- Node ≥ 18, git;
- adb, emulator (and the AVD list), xcrun simctl (macOS only), agent-device, maestro, Java (for Gradle builds);
- `.mobile-kit.json` present, and each external present (skills dir exists under `.claude/skills/<name>` or the plugin appears in `claude plugin list --json` if available; VERIFY the flag);
- the matrix config validates (required keys, profile math sane);
- name collisions in `.claude/skills/` (§6.4).

Output: ✔/✖ lines plus one fix command per ✖.

### 5.9 `update` (user-invoked)
`[--add <module>] [--remove <module>]`. It reads `.mobile-kit.json` and:
- re-runs `install-externals` for the module set (adding/removing);
- runs `npx skills update` for skills-cli externals and `claude plugin update <id>` for plugin externals;
- re-renders the CLAUDE.md section if the kit version changed;
- updates the lock.

## 6. Third-party skills integration

### 6.1 `external-skills.json` schema
```json
{
  "$schemaVersion": 1,
  "externals": [
    {
      "id": "swm-rn-best-practices",
      "module": "motion",
      "type": "skills-cli",              // or "plugin"
      "source": "software-mansion-labs/skills",
      "skills": ["react-native-best-practices"],   // skills-cli only
      "plugin": null,                    // plugin only: "<plugin>@<marketplace>"
      "marketplace": null,               // plugin only: "<owner>/<repo>" to add, or null if built-in
      "purpose": "Reanimated 4, Gesture Handler, Skia, layout animations",
      "license": "MIT",
      "verified": { "date": "YYYY-MM-DD", "by": "phase1", "notes": "" }
    }
  ]
}
```
Build this file in Phase 1 from `docs/external-skills.seed.json`. Verify every entry (§9, Phase 1) and drop or replace any that fail, telling the maintainer.

### 6.2 Modules
| Module | Default | Own skills | Externals (seed ids) |
|---|---|---|---|
| core | on (always) | (shared refs, CLAUDE.md section) | expo-official, vercel-rn |
| devices | on | device-control | agent-device |
| matrix | on | device-matrix-qa | (needs devices) |
| testing | on | mobile-testing | callstack-github-actions |
| ui-ux | on | ui-ux-review | platform-design (ios, android) |
| design | off | design-proposals | rubenglez-mobile-design |
| motion | on | mobile-motion | swm-rn-best-practices, emil-animate-expo |
| perf | off | – | callstack-rn-best-practices |
| motion-skia | off | – | reanimated-skia-performance |
| haptics | off | – | swm-pulsar-haptics |

Our own skills are always present (they ship with the plugin); a module that is off only means its externals aren't installed and its CLAUDE.md routing rows are omitted.

### 6.3 `install-externals.mjs` behaviour
- `skills-cli` → `npx -y skills add <source> --skill <s1> [--skill <s2>] -a claude-code -y` (project scope = no `-g`). Installs into `.claude/skills/`.
- `plugin` → if `marketplace` is set: `claude plugin marketplace add <marketplace> --scope project`; then `claude plugin install <plugin> --scope project` (VERIFY that `install` supports `--scope project`; if not, write `enabledPlugins` into `.claude/settings.json` per the settings reference and tell the user that teammates get a trust prompt).
- If the `claude` CLI can't be called from inside the session (nested call fails), print the exact commands for the user to run in their terminal, and continue.
- `--dry-run` prints the commands only. Every command is logged to the lock.
- Fail soft: one external failing doesn't abort the others. Summarize at the end.

### 6.4 Collision policy
Two externals may ship a skill with the same folder name (e.g. Callstack and Software Mansion both have `react-native-best-practices`). Rules:
- Prefer installing one of them as a **plugin** (namespaced, no folder clash) and the other via skills-cli.
- Before a skills-cli install, if `.claude/skills/<name>` exists from a different source, stop that one install and report it. Never overwrite.
- `doctor` lists duplicates.

## 7. Agents

Both live in `agents/`, with read-only tools (`Read, Glob, Grep`; no Edit/Write/Bash). They return structured Markdown. VERIFY the agent frontmatter keys in the docs.

- **`ui-reviewer`:** inputs are screenshot paths (+ audit JSON), the checklists and the scope. It compares the same screen across profiles, outputs findings in the exact format of §5.5, and never proposes code it hasn't seen. It may read source files to cite file:line.
- **`design-critic`:** inputs are the brief, variant screenshots and the rubric. It outputs the scores table (criteria × variants), the weighted totals, a recommendation and the top 3 risks of the recommended variant. It must be willing to say "none is good enough", with reasons.

## 8. Quality

### 8.1 Unit tests (`node --test`)
- `test/shims/adb` and `test/shims/xcrun` are fake executables (bash) that log calls and return canned output; tests put them first on PATH.
- Cover: profile math and dp conversion, Android audit parsing (small targets, overflow), nav reset between variants, locale strategies, the report generator, detect.mjs on fixture projects (`test/fixtures/expo-router-app`, `bare-rn-app`), scan-hardcoded on fixtures, install-externals `--dry-run` command generation, and CLAUDE.md marker replacement (idempotency).

### 8.2 Plugin evals (`evals/`)
Read https://code.claude.com/docs/en/plugin-evals for the format. Minimum: 3 cases per skill, testing that the right skill triggers and the wrong ones don't. Examples:
- "does the settings screen fit on small Android phones" → device-matrix-qa
- "boot an iPhone simulator and open the app" → device-control
- "give me three layout options for the onboarding screen" → design-proposals
- "the paddings look inconsistent, review the profile screen" → ui-ux-review
- "make the card expand smoothly when tapped" → mobile-motion
- "add an E2E test for login" → mobile-testing

### 8.3 CI (`.github/workflows/ci.yml`)
On push/PR: Node 20, `node --test`, `npx -y @anthropic-ai/claude-code plugin validate . --strict` (VERIFY that it runs without auth; if not, skip it with a clear note), and markdown link check (optional).

### 8.4 Pilot
After Phase 3, run `init` on a real Expo project chosen by the maintainer. Fix whatever breaks before continuing.

## 9. Phases

Each phase ends with: checks green, a commit, and a short report (what was done, what was verified, open questions).

**Phase 0: skeleton**
- `git init`, LICENSE (MIT), README stub, CHANGELOG, `.gitignore`.
- `plugin.json` and `marketplace.json` (§4), and the layout folders (§3).
- Move seed/device-matrix-qa → skills/device-matrix-qa and the shared refs (§5.2 steps 1–2). Delete `seed/`.
- `claude plugin validate . --strict` passes. Locally: `claude plugin marketplace add ./` + install, and `/mobile-kit:device-matrix-qa` loads.
- Report the placeholders that still need values.

**Phase 1: externals verification + manifest**
- For each seed entry:
  - skills-cli: `npx -y skills add <source> --list` in a temp dir; confirm the exact skill names.
  - plugin: fetch the repo's `.claude-plugin/marketplace.json`; confirm the marketplace and plugin names.
- Confirm the license of each source.
- Write `external-skills.json` with `verified` filled in. Report any rename or removal.

**Phase 2: core scripts + init/doctor/update**
- `scripts/lib/*`, `detect.mjs`, `install-externals.mjs`, `scaffold.mjs`, `doctor.mjs` with tests.
- `shared/claude-md-section.md` and the templates.
- The `init`, `doctor` and `update` skills.
- Test on the fixtures with `--dry-run`, then for real in a throwaway Expo app (`npx create-expo-app@latest /tmp/mk-test --yes`, network permitting).

**Phase 3: device-control + matrix refactor**
- `lib/devices.mjs`, the device-control skill + references, matrix refactor + locales + `--json`, tests.
- Pilot (§8.4).

**Phase 4: testing**
- The mobile-testing skill, references and assets, scaffold logic.

**Phase 5: review + design**
- `scan-hardcoded.mjs`, the ui-ux-review skill + references, the `ui-reviewer` agent.
- The design-proposals skill, Design Lab template, rubric, decision template, the `design-critic` agent.

**Phase 6: motion**
- The mobile-motion skill, `motion.ts` template + `useMotion`, delegation table, review reference.

**Phase 7: evals, docs, release**
- `evals/` (§8.2), CI (§8.3).
- README (§10).
- Tag `mobile-kit--v0.1.0`.

## 10. README outline (public)
1. What it is (3 lines) + a GIF/screenshot of a matrix report (added by the maintainer later).
2. Install (the three commands from §1).
3. What `init` does, and what gets committed.
4. Modules table (§6.2) with links to every third-party source and its license, plus credits.
5. Daily usage: 8 example prompts.
6. Requirements per platform (macOS for iOS; Android SDK; optional agent-device, Maestro).
7. FAQ: bare RN, Windows, why skills aren't vendored, how to update.
8. Contributing + license.

## 11. Out of scope for v1
Figma integration, physical-device farms, Flutter/native-only projects, automatic visual-regression diffing (pixel diff), and Windows-specific iOS workflows.
