---
name: device-control
description: Build, install, launch, deep-link, read logs and take screenshots of a React Native / Expo app on iOS simulators and Android emulators, and pick the right device backend. Use for "run the app on the emulator", "boot an iPhone simulator", "open this deep link", "show the app logs", "take a screenshot". For tapping/typing/inspecting UI use agent-device's android-emulator / ios-simulator skills; for checking a screen across many sizes use device-matrix-qa.
---

# Device control

One consistent way to get the app onto a simulator/emulator and observe it.

## Pick the backend (in this order)

1. **Claude Code Desktop iOS Simulator tools**: if your tool list has simulator tools from the desktop app's iOS Simulator pane (macOS, beta), use them to view and drive iOS interactively. They don't cover Android.
2. **`agent-device` CLI** (Callstack): accessibility snapshots, element refs, press/fill, React DevTools profiling. Check with `agent-device --version`. If the `agent-device`, `android-emulator` or `ios-simulator` skills are installed, follow them for UI interaction.
3. **Raw fallback**, always available:

   ```bash
   D="${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs"
   node $D list                                   # running emulators, AVDs, booted simulators
   node $D boot Pixel_9 [--headless]               # Android: start an AVD and wait for boot
   node $D boot "iPhone 17" --platform ios          # iOS: find/create "QA iPhone 17" and boot it
   node $D install <app.apk | App.app> [--platform ios]
   node $D launch <appId> [--platform ios]
   node $D open "<scheme>://<path>" --app <appId>   # deep link
   node $D screenshot shot.png [--platform ios]
   node $D logs --app <appId> [--level error] [--lines 100] [--platform ios]
   ```

   Every command takes `--target <serial|udid>` and `--json`. Then `Read` the screenshot to look at it.

Details, trade-offs and agent-device commands: `${CLAUDE_PLUGIN_ROOT}/skills/device-control/references/backends.md`.

## Build the app

| Goal | Android | iOS (macOS + Xcode only) |
|---|---|---|
| Develop (Metro, fast refresh) | `npx expo run:android` | `npx expo run:ios` |
| Judge animation/performance, iOS matrix runs, relaunch-based runs | `npx expo run:android --variant release` | `npx expo run:ios --configuration Release` |

- Use a dev build while iterating on code. Use a **release** build to judge motion or performance, and for iOS matrix runs: a dev-client build stops at its launcher on a fresh simulator.
- Built artifacts:
  - Android: `find android/app/build/outputs/apk -name "*.apk"` (debug in `debug/`, release in `release/`).
  - iOS: `find ios/build -name "*.app" -path "*-iphonesimulator*"`. If nothing is there, look in `~/Library/Developer/Xcode/DerivedData/*/Build/Products/*-iphonesimulator/`.
- App ids: `.mobile-kit.json` → `configPath` (`qa/device-matrix.json`, keys `app.androidPackage`, `app.iosBundleId`, `app.scheme`). Otherwise read them with `npx expo config --type public --json` (`android.package`, `ios.bundleIdentifier`, `scheme`).

## Deep links

- Format: `<scheme>://<route path>`. For expo-router, the route path is the file path under `app/` without groups `(…)` and without `index`. For example, `app/(tabs)/settings.tsx` → `myapp://settings`.
- Android: `--app <package>` pins the intent to the app, so a browser or another app can't take it.
- iOS: the first `openurl` for a scheme can show a confirmation dialog. Accept it once (agent-device or the simulator pane), then it stays quiet.

## Logs

- `node $D logs --app <appId>` gives a snapshot of recent lines, which fits most debugging.
- To follow live logs, run one of these in the background and stop it when done:
  - Android: `adb logcat --pid=$(adb shell pidof -s <package>)`
  - iOS: `xcrun simctl spawn <udid> log stream --predicate 'process == "<ExecutableName>"'`
- JS console output appears under the `ReactNativeJS` tag (Android) and in the app process (iOS). Metro's terminal shows it too in dev builds.

## Rules

- **Never leave a device modified.** If you change font scale, display size, dark mode, locale or the status bar, restore it before finishing (`node ${CLAUDE_PLUGIN_ROOT}/skills/device-matrix-qa/scripts/matrix.mjs android-reset` restores Android).
- Shut down only the devices you booted. Leave the user's own simulators and emulators running.
- iOS needs macOS with Xcode. On Linux or Windows, say so and continue with Android.
- Don't sign in to real accounts on a simulator whose screenshots are sent to the model.
- A failing step gets a screenshot plus the last 100 log lines, so the cause is visible.
