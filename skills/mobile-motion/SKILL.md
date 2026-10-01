---
name: mobile-motion
description: Make motion in a React Native / Expo app consistent and correct, with project motion tokens (durations, springs, useMotion with reduced motion), mobile motion rules, release-build review and screen recordings, delegating API details to Reanimated/animation skills. Use for "make the card expand smoothly", "add a transition", "the animation feels janky", "set up motion tokens", "review the animations". For layout or spacing issues use ui-ux-review.
argument-hint: "[what to animate or review]"
---

# Mobile motion

Arguments: `$ARGUMENTS`

## 1. Tokens first
Look for the project's `motion.ts` in the theme dir (`themeDir` in `.mobile-kit.json`). If it's missing, offer to scaffold it, and apply only on a yes:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs --motion --only motion-tokens,lock --dry-run
node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs --motion --only motion-tokens,lock
```

It provides `duration` (`instant` 100, `fast` 150, `base` 220, `slow` 320 ms), `spring` (`snappy`, `gentle`, `bouncy`) and `useMotion()`, which returns `{ duration, fade, spring, reduced, reduceMotion }`. With reduced motion on, durations are 0 and `reduced` is true. Use tokens everywhere: no inline durations or spring numbers.

## 2. Rules (details: `${CLAUDE_PLUGIN_ROOT}/skills/mobile-motion/references/motion-rules.md`)
- Animate **transform and opacity** only, unless there's a stated reason (and then measure it).
- Keep animations on the **UI thread**: Reanimated shared values, `useAnimatedStyle`, worklets. No `setState` per frame, no JS-driven `Animated` loops for gestures.
- Every gesture-driven motion is **interruptible** and **hands off velocity** (`withSpring(target, { ...spring.snappy, velocity: e.velocityY })`).
- **Respect reduce motion**: Reanimated skips `withTiming`/`withSpring` when the OS setting is on (`ReduceMotion.System`). Where a state change must still be visible, use `motion.reduced` to swap movement for a crossfade (`motion.fade`) or an instant change.
- Motion has a job: feedback, orientation (where did this come from) or continuity. Decorative motion stays short and rare.
- **Judge motion only on a release build** on a device or emulator, never in a dev build (dev builds are much slower and stutter).

## 3. Delegate the implementation details
| Need | Skill |
|---|---|
| Reanimated / Gesture Handler / Skia / layout animations API | Software Mansion `react-native-best-practices` |
| Whether and how to animate, timing, feel | Emil Kowalski `animate-expo` |
| Canvas / shader performance | `reanimated-skia-performance` (optional module `motion-skia`) |
| Expo specifics (Expo Router transitions, expo-haptics with motion) | `expo:expo-animation` (Expo plugin, core module) |

Load the matching skill before writing animation code. If a delegated skill isn't installed, say so and suggest `/mobile-kit:update --add motion` (or `--add motion-skia`). Without it, follow the rules above and the installed Reanimated version's docs (check `react-native-reanimated` in `package.json` first; v4 changed spring defaults and requires `react-native-worklets`).

## 4. Review and show
Use `${CLAUDE_PLUGIN_ROOT}/skills/mobile-motion/references/review.md`:
1. Build release (`npx expo run:android --variant release` / `npx expo run:ios --configuration Release`) and install it (device-control).
2. Drive the interaction (agent-device, or ask the user) while recording:

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs record qa-shots/motion/<name>.mp4 --seconds 8
   node ${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs record qa-shots/motion/<name>.mov --seconds 8 --platform ios
   ```

3. Go through the review checklist, and give the user the recording path. A video can't be judged from screenshots, so the user watches it.
4. Check reduced motion too: Android `adb shell settings put global transition_animation_scale 0`, then restart the app (Reanimated reads this setting at launch), and **restore it** afterwards (`... transition_animation_scale 1`). iOS: Settings → Accessibility → Motion → Reduce Motion on the simulator; turn it off again.
