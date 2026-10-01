# Motion review

## Setup
1. Release build installed on the device/emulator (`node ${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs install <apk|app>`).
2. Record each interaction while it's driven (agent-device or the user):
   - `node ${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs record qa-shots/motion/<name>.mp4 --seconds 8` (Android, max 180 s; uses `adb shell screenrecord`)
   - `node ${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs record qa-shots/motion/<name>.mov --seconds 8 --platform ios` (uses `xcrun simctl io <udid> recordVideo --codec=h264`)
   - Raw equivalents: `adb shell screenrecord --time-limit 8 /sdcard/x.mp4 && adb pull /sdcard/x.mp4`; `xcrun simctl io booted recordVideo --codec=h264 x.mov` (stop with Ctrl+C).
3. Hand the recording paths to the user; they watch them. Note what you checked in code and what only the video can confirm.

## Checklist (per animation)
- [ ] Has a job: feedback, orientation or continuity. Decorative motion is short and rare.
- [ ] Uses motion tokens (`duration.*`, `spring.*`), no inline numbers.
- [ ] Animates transform/opacity, or the reason for a layout property is written down and it was measured.
- [ ] Runs on the UI thread (shared values / `useAnimatedStyle`); no per-frame `setState`.
- [ ] Interruptible: a tap or new gesture mid-animation takes over smoothly from the current value.
- [ ] Gesture release hands off velocity; a quick flick completes the action.
- [ ] Reduced motion: no large movement; state changes still visible (crossfade/static); checked with the OS setting on.
- [ ] Exit is as fast as or faster than enter; nothing over 320 ms for plain UI feedback.
- [ ] No dropped frames on `small-360` in a release build (watch the recording; use the GPU profiler if unsure).
- [ ] Consistent with other motion in the app (same springs for the same kind of element).

## Reduced-motion check
- Android: `adb shell settings put global transition_animation_scale 0` (the setting Reanimated reads for reduced motion), force-stop and relaunch the app, record, then **restore**: `adb shell settings put global transition_animation_scale 1`.
- iOS simulator: Settings → Accessibility → Motion → Reduce Motion on, relaunch the app, record, then turn it **off** again.

## Output
One line per issue, same format as UI reviews: `[P1|P2|P3] <screen> / <interaction>: <problem> → <fix> (<file>:<line>)`. P1: motion blocks input, hides state, ignores reduced motion with large movement, or visibly drops frames on a release build.
