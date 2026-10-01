---
name: ui-ux-review
description: Audit existing React Native / Expo screens for UI/UX problems (spacing, hierarchy, states, accessibility, copy, platform conventions), write prioritized findings, fix them in small batches and re-verify on devices. Use for "review the profile screen", "the paddings look inconsistent", "UX audit before release", "fix the review findings". For layout fit across many screen sizes alone use device-matrix-qa; for new design options use design-proposals.
argument-hint: "[audit|fix|quick] [screens|all]"
---

# UI/UX review

Arguments: `$ARGUMENTS`. Modes: **audit** (default), **fix**, **quick**.

Findings always use one line each, in this exact format:

```
[P1|P2|P3] <screen> / <profile>: <problem> → <proposed fix> (<file>:<line>)
```

- **P1**: blocks a task, loses data, is unreadable, is inaccessible (missing label on an icon button, contrast below 3:1), or the layout is broken on a supported device.
- **P2**: works, but is confusing or inconsistent (off-scale spacing, missing empty/error state, a wrong platform convention).
- **P3**: polish (alignment, copy tone, minor hierarchy).

## audit

1. **Scope**: screens from the arguments, or `all` = every screen in `qa/device-matrix.json`.
2. **Screenshots**: run the matrix for the scope (device-matrix-qa), or reuse a run from today in `qa-shots/` if the user agrees:

   ```bash
   mkdir -p qa-shots
   node ${CLAUDE_PLUGIN_ROOT}/skills/device-matrix-qa/scripts/matrix.mjs shoot --platform android --screens <a,b> --json > qa-shots/last-run.json
   ```

3. **Static scan** for raw spacing and colours:

   ```bash
   mkdir -p qa-shots && node ${CLAUDE_PLUGIN_ROOT}/scripts/scan-hardcoded.mjs --json > qa-shots/scan.json
   ```

4. **Independent review**: spawn the `mobile-kit:ui-reviewer` agent. Don't review the screenshots yourself first. Pass:
   - the run summary path (`qa-shots/last-run.json`, which lists every screenshot and `.audit.json`) and the scan path;
   - the scope and the screen → route file mapping (from the routes root);
   - these checklists: `${CLAUDE_PLUGIN_ROOT}/shared/checklist.md`, `${CLAUDE_PLUGIN_ROOT}/skills/ui-ux-review/references/ux-heuristics.md`, `${CLAUDE_PLUGIN_ROOT}/skills/ui-ux-review/references/states.md`, `${CLAUDE_PLUGIN_ROOT}/skills/ui-ux-review/references/a11y.md`, `${CLAUDE_PLUGIN_ROOT}/skills/ui-ux-review/references/copy.md`;
   - if installed, the platform guideline skills `ios-design-guidelines` / `android-design-guidelines` as extra references.
5. **Merge** the agent's findings with scan findings (group scan hits per file; one finding per pattern, not per line) into `qa/reviews/<YYYY-MM-DD>-<scope>.md`:

   ```markdown
   # UI/UX review: <scope> (<date>)
   Run: qa-shots/<run>/index.html · Profiles: … · Locales: …

   ## Findings
   - [ ] [P1] settings / small-360: Save button clipped at 2.0× font → minHeight + paddingVertical instead of height (src/app/settings.tsx:42)

   ## Notes
   ```

6. Report the counts per priority and the file path. Don't fix anything in audit mode.

## fix

1. Read the latest review file. Work in priority order (all P1, then P2, then P3 unless the user limits it).
2. Batches of **at most 5 files**. Fix causes, following `${CLAUDE_PLUGIN_ROOT}/shared/layout-rules.md` (tokens, `Screen` insets, flex, touch targets, font scaling).
3. After each batch, re-run only the affected screens/profiles (`--screens` / `--profiles`), look at the new screenshots, and mark each finding `- [x]` (fixed) or leave `- [ ]` with a note on why it is still open. Re-run the scan for touched files.
4. Run the project's tests (`npx jest` if configured) before reporting. End with: fixed / still open / new problems found.

## quick

During development, for one screen: capture the current emulator screen and check it against `${CLAUDE_PLUGIN_ROOT}/shared/checklist.md` yourself (no agent, no matrix):

```bash
node ${CLAUDE_PLUGIN_ROOT}/skills/device-matrix-qa/scripts/matrix.mjs capture --name <screen>-quick --json
```

Report the findings in the same line format and suggest a full audit before release.

## Rules

- The agent that wrote the code doesn't judge it: audits always go through `ui-reviewer`.
- Never propose a fix for code you haven't read. Cite `file:line`.
- Fix the cause, never the device: no per-device or per-platform spacing patches.
- Restore devices after the run (matrix `shoot` resets Android itself).
