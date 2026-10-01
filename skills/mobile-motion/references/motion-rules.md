# Motion rules (React Native / Expo, Reanimated 4)

## What to animate
- `transform` (translate, scale, rotate) and `opacity` run on the UI thread without layout work. Prefer them.
- Animating `width`, `height`, `top/left`, `margin` or `padding` re-runs layout every frame. Use them only for a stated reason (for example an accordion whose content height is unknown), keep the subtree small, and test on a low-end Android profile. For size changes, prefer Reanimated layout animations (`layout={LinearTransition}`, `entering={FadeIn}` / `exiting={FadeOut}`) over manual height tweens.
- Never animate shadows or blur on Android lists.

## Where it runs
- Shared values (`useSharedValue`) and `useAnimatedStyle` keep animations on the UI thread. Work that must touch JS (navigation, analytics) goes through `scheduleOnRN` / `runOnJS` at the end, not every frame. Check the installed `react-native-worklets` API name.
- Never drive animations with React state (`setState` in `requestAnimationFrame`) or the legacy `Animated` API with `useNativeDriver: false`.
- Gestures: `react-native-gesture-handler` `Gesture.Pan()` etc. with worklet callbacks; compose with `Gesture.Simultaneous` / `Exclusive` instead of nested responders.

## Timing and springs (use the tokens)
| Use | Token |
|---|---|
| Press feedback, toggles | `duration.instant` / `duration.fast`, or `spring.snappy` |
| Small UI changes (chips, expand/collapse) | `duration.base` or `spring.snappy` |
| Larger surfaces (sheets, cards moving across the screen) | `spring.gentle` |
| Playful, rare moments (success, onboarding) | `spring.bouncy` |
| Screen transitions | the navigator's native transition; don't hand-roll them |

- Enter faster than you leave is wrong: exits should be as fast or faster than entrances.
- Anything over `duration.slow` (320 ms) for UI feedback feels sluggish. Long sequences need a reason.
- Easing for `withTiming`: `Easing.out(Easing.cubic)` for entering, `Easing.in(Easing.cubic)` for leaving, `Easing.inOut` for moves on screen.

## Interruptible and velocity-aware
- A new gesture or tap must take over a running animation from its current value; never queue animations or block input until they finish.
- On release, pass the gesture velocity to the spring (`withSpring(target, { ...spring.snappy, velocity })`) and pick the target from position *and* velocity (a fast flick should complete the gesture even if it moved a short distance).
- Use `cancelAnimation` only when you take control yourself; prefer re-targeting with a new `withSpring`.

## Reduced motion
- Reanimated animations follow the OS setting by default (`reduceMotion: ReduceMotion.System`): they jump to the end value.
- When a jump would hide meaning (something appeared, moved, or changed state), use `useMotion().reduced` to replace the movement with an opacity crossfade (`motion.fade`) or a static highlight.
- `useReducedMotion()` reads the setting at app start; a change applies after an app restart. On Android that setting is Developer options → Transition animation scale = off (`transition_animation_scale 0`).
- No auto-playing loops that can't be paused; nothing flashes more than 3 times per second.

## Judging
- Only on a release build on a device or emulator. Dev builds run JS much slower and stutter.
- Check on `small-360` (a low-end profile) as well as a large phone; turn on "Profile GPU rendering" (Android developer options) or the React DevTools profiler (agent-device) when something drops frames.
