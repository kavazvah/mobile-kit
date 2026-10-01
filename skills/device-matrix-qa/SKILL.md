---
name: device-matrix-qa
description: Check an Expo / React Native app's layout on many Android screen sizes and iOS simulators, and enforce mobile layout standards (safe areas, insets, padding/spacing tokens, touch targets, font scaling, edge-to-edge). Use when building or reviewing a screen or component, when asked to "check on emulator/simulator", "test on small phones", "does this fit on all Android sizes", "fix padding/spacing", or before a release.
---

# Device Matrix QA

Three jobs, in this order of preference:

1. **Build it right**: write layout code that follows `${CLAUDE_PLUGIN_ROOT}/shared/layout-rules.md`. Most multi-device bugs are prevented here, not found later.
2. **Quick check**: switch the *one* running Android emulator into a different screen profile, look, restore.
3. **Full matrix**: screenshot every configured screen on every profile (Android + iOS), then review them against `${CLAUDE_PLUGIN_ROOT}/shared/checklist.md`.

All device work goes through one script (Node, no dependencies):

```bash
M="${CLAUDE_PLUGIN_ROOT}/skills/device-matrix-qa/scripts/matrix.mjs"
node $M doctor                 # checks adb / emulator / xcrun / agent-device / config
node $M init                   # creates qa/device-matrix.json from the template (once per project)
```

Project config lives in `qa/device-matrix.json` (app package / bundle id / URL scheme, the screens to capture as deep-link paths, device profiles). Read it before any device work. If it is missing, run `init` and ask the user for the package name, bundle id, scheme and screen list, or read them from `app.json` / `app.config.*` and the `app/` routes.

## The key idea for Android sizes

We do **not** keep dozens of AVDs. One emulator is reshaped at runtime with `adb shell wm size` + `wm density` (plus font scale, dark mode, navigation mode). A profile is a width/height in px and a dpi, which gives a width in dp. That dp width is what React Native's layout actually sees. The default profiles cover 360dp (small, the most common source of breakage), a short 360×640dp screen, 411dp (standard), 448dp (large), and optionally the inner screen of a foldable and a tablet.

`wm size` does not simulate display cutouts or rounded corners. For cutouts, use a real device-type AVD, or `adb shell cmd overlay list | grep cutout` and enable one of the emulation overlays.

## Workflow A: Quick check while developing (Android)

```bash
node $M android-list                       # show profiles with their dp size
node $M android-apply small-360            # reshape the running emulator
node $M android-apply small-360 --font 1.3 --dark
node $M capture --name settings-small      # screenshot + touch-target audit of the current screen
node $M android-reset                      # ALWAYS restore when done
```

Then `Read` the PNG that `capture` printed and look at it. A dev build with Metro works here: the app is not killed, so React Native just receives the new dimensions (a density change recreates the activity, but JS state survives).

## Workflow B: Full matrix run

```bash
node $M shoot --platform android           # all base profiles + stress variants on the smallest one
node $M shoot --platform ios               # needs ios.appPath (Release .app) in the config
node $M shoot --platform both --screens home,settings --profiles small-360,standard-411
node $M shoot --platform android --all     # include optional (fold/tablet) profiles
node $M shoot --platform android --no-stress
```

Output goes to `qa-shots/<timestamp>/` with `manifest.json`, `index.html` (a contact sheet: one row per screen, one column per profile) and an `audit.json` per Android shot (tappable elements under 48dp, content wider than the screen).

Then:

1. `Read` the screenshots. Compare **the same screen across profiles** side by side; that is where layout bugs show up.
2. Go through `${CLAUDE_PLUGIN_ROOT}/shared/checklist.md` for each screen. Treat the automatic audit as a hint: RN hit areas from `hitSlop` do not appear in the dump, so confirm visually.
3. Write `qa-shots/<run>/findings.md`: one line per issue, `[severity] screen / profile: what is wrong → fix (file:line)`.
4. Fix in code following `${CLAUDE_PLUGIN_ROOT}/shared/layout-rules.md`, then re-run **only** the affected screens/profiles with `--screens` / `--profiles`.
5. Report to the user: issues found, fixed, and still open, and point them to `index.html`.

**Screens behind interaction** (login, a modal, a filled form): if a deep link can't reach the state, drive it with `agent-device` (`agent-device snapshot -i`, `agent-device press @e3`, `agent-device fill @e5 "text"`), then run `node $M capture --name <screen>-<profile>` for each profile.

**Builds:** for Android, a dev build is fine for the whole matrix (the app stays running; screens open via deep links). For iOS, each profile is a separate simulator, so the app is installed and launched fresh on each one. A dev-client build would stop at the launcher, so use a Release build: `npx expo run:ios --configuration Release`, then set `ios.appPath` to the built `.app` (find it with `find ios/build -name "*.app" -path "*Release-iphonesimulator*"`). The same applies to Android if `"relaunch": true` is set: use `npx expo run:android --variant release`.

## Rules

- Always leave devices clean: `android-reset` after quick checks (`shoot` resets by itself). Never leave a `wm size` override behind.
- Fix causes, not devices. No `if (width === 360)` hacks and no per-device magic numbers. Use flex, spacing tokens, insets, `useWindowDimensions` breakpoints and `flexShrink` on text.
- Use `Platform.select` / `.android.tsx` / `.ios.tsx` only for real platform-convention differences (back behaviour, ripple, header style), not to patch spacing.
- If the app is bilingual, run the matrix in both languages. Longer translations are the most common cause of broken rows and buttons.
- Keep the screen list in `qa/device-matrix.json` up to date when adding routes, so a matrix run always covers the whole app.
- iOS requires macOS with Xcode. On other systems, run the Android part and say that iOS was skipped.
