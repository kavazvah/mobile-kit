// Design tokens: the single source of truth for spacing, radius, layout and type.
// Import from here everywhere; raw numbers in styles are only allowed for 0, 1 (hairline) and flex.

export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;

export const layout = {
  screenPadding: space.lg, // 16; on width >= 600 use space.xl
  maxContentWidth: 640, // text-heavy content on tablets and foldables
  minTouch: 48, // 44 is the iOS minimum; 48 satisfies both platforms
} as const;

export const type = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
} as const;

/** Width class in dp: switch columns, padding or panels on this, never on device names. */
export function sizeClass(width: number): 'compact' | 'regular' | 'expanded' {
  return width < 380 ? 'compact' : width < 600 ? 'regular' : 'expanded';
}
