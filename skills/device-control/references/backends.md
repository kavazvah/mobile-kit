# Device backends

| | Desktop iOS Simulator pane | agent-device CLI | Raw (`scripts/device.mjs`) |
|---|---|---|---|
| Platforms | iOS simulators only | iOS, Android (also tvOS, macOS) | iOS simulators, Android emulators/devices |
| Needs | Claude Code Desktop on macOS, Xcode | `npm i -g agent-device@latest`, adb / Xcode | adb + emulator (Android SDK), Xcode (iOS) |
| UI interaction | tap, type, read screen; user can tap too | snapshot with `@refs`, press, fill, scroll, wait | none (screenshots, deep links only) |
| Best for | watching and steering iOS together with the user | driving flows, reproducing bugs, exploratory QA | build/install/launch/logs, scripts, CI, matrix runs |

## 1. Claude Code Desktop iOS Simulator pane

- Available in local desktop sessions on macOS (public beta). It opens when Claude builds, runs or checks the app in a simulator. Each session has its own devices (up to 4).
- The first time a device is used, the user is asked to allow Claude to control it. Opening URLs and building follow the session's permission mode.
- Devices it boots are shut down by the desktop app; devices the user booted are never shut down.
- No Android support. From the CLI, the iOS Simulator is reached through computer use instead.

## 2. agent-device

Typical loop (see the `agent-device` skill for the full command set):

```bash
agent-device open <appId> --platform android --foreground   # starts a session, prints an interactive snapshot with @refs
agent-device press @e12 --settle                             # act, then continue from the printed diff
agent-device fill @e5 "hello@example.com" --settle
agent-device scroll down --until <selector>                  # one command, not a scroll-and-check loop
agent-device wait text "Saved"
agent-device screenshot
agent-device close
```

- Copy refs exactly (`@e12`, `@e12~s4`). Prefer refs, then id/label/role selectors; coordinates are a last resort.
- `dogfood` runs a structured exploratory session that writes a bug report with screenshots.
- React DevTools (component tree, props/state/hooks, renders): `agent-device help react-devtools`.
- For anything specialized (gestures, scripting, debugging), run `agent-device help <topic>` instead of guessing flags.

## 3. Raw fallback: `scripts/device.mjs` / `scripts/lib/devices.mjs`

The shared library behind `device.mjs` and device-matrix-qa:

| Function | Android | iOS |
|---|---|---|
| `listAndroid()`, `listAvds()` | `adb devices`, `emulator -list-avds` | |
| `bootAvd(name, {headless})`, `waitForBoot(serial)` | `emulator -avd <name>` + poll `sys.boot_completed` | |
| `listIosSims()`, `ensureSim(match[])`, `bootSim(udid)` | | `simctl list/create/boot/bootstatus`, clean status bar |
| `install`, `launch`, `terminate` | `adb install -r`, `monkey -p`, `am force-stop` | `simctl install/launch/terminate` |
| `openUrl(platform, target, url, appId)` | `am start -W -a VIEW -d <url> <pkg>` | `simctl openurl` |
| `screenshot(platform, target, file)` | `adb exec-out screencap -p` | `simctl io <udid> screenshot` |
| `logs(platform, target, {appId, level, lines})` | `logcat -d -t <n> --pid=<pid> *:<L>` | `simctl spawn <udid> log show --last 5m --predicate 'process == "<exe>"'` |
| `record(platform, target, file, {seconds})` | `screenrecord --time-limit <s>` + `adb pull` | `simctl io <udid> recordVideo --codec=h264`, stopped with SIGINT |
| `setAppLocale(serial, pkg, tag)` | `cmd locale set-app-locales <pkg> --locales <tag>` (Android 13+; no tag resets) | |

`ensureSim` creates simulators named `QA <name>`, so they never collide with the user's own devices.
