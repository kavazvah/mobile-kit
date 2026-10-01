// Motion tokens: the single source of truth for durations and springs.
// Animate with these instead of inline numbers: withTiming(v, { duration: motion.duration.base }),
// withSpring(v, motion.spring.snappy). Checked against react-native-reanimated 4.
import { useMemo } from 'react';
import { ReduceMotion, useReducedMotion } from 'react-native-reanimated';

export const duration = { instant: 100, fast: 150, base: 220, slow: 320 } as const;

// Explicit damping/stiffness/mass: Reanimated 4 changed the withSpring defaults, so never rely on them.
export const spring = {
  snappy: { damping: 20, stiffness: 300, mass: 1 },
  gentle: { damping: 18, stiffness: 180, mass: 1 },
  bouncy: { damping: 12, stiffness: 220, mass: 1 },
} as const;

type Durations = { [K in keyof typeof duration]: number };

export type Motion = {
  /** Durations to use; all 0 when the user asked for reduced motion. */
  duration: Durations;
  /** Opacity-only crossfade duration; stays > 0 so state changes remain visible with reduced motion. */
  fade: number;
  spring: typeof spring;
  /** True when the OS "reduce motion" setting was on at app start. Swap movement for a crossfade or nothing. */
  reduced: boolean;
  /** Pass to withTiming/withSpring/layout animations so they follow the OS setting (Reanimated's default). */
  reduceMotion: ReduceMotion;
};

const ZERO: Durations = { instant: 0, fast: 0, base: 0, slow: 0 };

/**
 * Motion tokens for the current accessibility setting.
 * Reanimated already skips withTiming/withSpring when the OS setting is on (ReduceMotion.System);
 * `reduced` lets a component choose a different, non-moving transition instead of a jump.
 * useReducedMotion() reads the setting once, at app start: a change applies after an app restart.
 */
export function useMotion(): Motion {
  const reduced = useReducedMotion();
  return useMemo(
    () => ({
      duration: reduced ? ZERO : duration,
      fade: duration.fast,
      spring,
      reduced,
      reduceMotion: ReduceMotion.System,
    }),
    [reduced],
  );
}
