---
name: design-proposals
description: Produce 2–3 genuinely different design variants of a React Native / Expo screen or component as code, render them on devices through a dev-only Design Lab route, have an independent critic score them, and record the decision. Use for "give me three layout options for onboarding", "explore designs for the checkout", "which layout is better". For reviewing an existing screen use ui-ux-review.
argument-hint: "<feature or screen> [brief]"
---

# Design proposals

Arguments: `$ARGUMENTS`. Feature names are kebab-case (`onboarding`, `trip-details`).

## 1. Brief
Restate in 4–6 lines: goal, users, primary action, constraints (tokens, platforms, locales, longest content). Ask **at most 2** questions, and only if the answer would change the variants. Otherwise state your assumptions and continue.

## 2. Context
Read `${CLAUDE_PLUGIN_ROOT}/shared/layout-rules.md`, the project tokens (`themeDir` in `.mobile-kit.json`, usually `src/theme/`), and 1–2 existing screens to match the visual language. If the `mobile-design` skill is installed, use its process guidance too.

## 3. Variants
```bash
DL="${CLAUDE_PLUGIN_ROOT}/scripts/design-lab.mjs"
node $DL scaffold                       # once per project: lab route, DesignLabHost, registry
node $DL new --feature <feature>         # VariantA/B/C stubs in src/design-lab/<feature>/
```
- If `scaffold` prints a `todo` for the root layout, mount the host once: add the printed import and render `<DesignLabHost />` as the **last child** of the root layout's top element (after the navigator). Show the user the diff. The host draws the lab as an overlay, because tab navigators don't display routes that aren't tabs.
- Fill each `Variant{A,B,C}.tsx`. Line 1 is the thesis, for example `// A: list-first, dense` or `// B: card carousel, one item in focus`.
- Variants must differ in **structure or hierarchy** (layout model, order, density, navigation pattern), not just colour or radius. Two variants that a user would describe the same way count as one.
- Tokens only (no raw spacing/colours), realistic content (long names, real-looking numbers), and the primary action labelled with a verb. Each variant renders its own `Screen` wrapper.
- Run `node $DL register` after adding or removing variant files.

## 4. Render
The lab route is `<scheme>://__design-lab/<feature>?v=A`. Details: `${CLAUDE_PLUGIN_ROOT}/skills/design-proposals/references/design-lab.md`.
```bash
node $DL config --feature <feature>      # writes qa-shots/design-lab/<feature>.json
node ${CLAUDE_PLUGIN_ROOT}/skills/device-matrix-qa/scripts/matrix.mjs shoot --platform both --config qa-shots/design-lab/<feature>.json --json > qa-shots/design-lab/<feature>.run.json
```
This captures every variant on `small-360`, `standard-411`, `small-360+font-200` and one iPhone. Android dev builds show the lab; for iOS, build Release with `EXPO_PUBLIC_DESIGN_LAB=1`. Without macOS, use `--platform android` and say that iOS was skipped. `Read` a few screenshots to confirm each variant really rendered before evaluating: not the "No variants" fallback, and not the app's normal start screen (that means the host isn't mounted or the build lacks `EXPO_PUBLIC_DESIGN_LAB=1`).

## 5. Evaluate (not by you)
Spawn the `mobile-kit:design-critic` agent with: the brief, the run summary path (`qa-shots/design-lab/<feature>.run.json`), the variant file paths and their theses, `${CLAUDE_PLUGIN_ROOT}/skills/design-proposals/references/rubric.md`, and the tokens path. **Don't score the variants yourself**, and don't tell the critic which variant you prefer.

## 6. Decide
Write `design/decisions/<YYYY-MM-DD>-<feature>.md` from `${CLAUDE_PLUGIN_ROOT}/skills/design-proposals/assets/decision.template.md`: brief, variants and theses, the critic's scores table and weighted totals, its recommendation and top 3 risks, then "Chosen", "Why" and "Follow-ups" left for the user. Present the summary and the screenshot report (`index.html` of the run). **The user makes the final call.** If the critic says none is good enough, propose what a new variant would change instead of picking one.

## 7. Promote (after the user chooses)
Move the chosen variant into the real screen or component, delete `src/design-lab/<feature>/`, run `node $DL register`, fill "Chosen/Why" in the decision file, and keep the lab route for next time. Then suggest a `ui-ux-review` quick check of the real screen.
