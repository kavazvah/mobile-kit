# React Native / Expo layout rules

Follow these when writing or reviewing UI code. They prevent most multi-device bugs.

## 1. One source of truth for spacing, radius and type
Create a token file once (for example `src/theme/tokens.ts`) and import from it everywhere. Never use raw numbers in styles except 0, 1 (hairline) and flex values.

```ts
export const space = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 } as const;
export const layout = {
  screenPadding: space.lg,   // 16; on width >= 600 use space.xl
  maxContentWidth: 640,      // for text-heavy content on tablets and foldables
  minTouch: 48,              // 44 is the iOS minimum; 48 satisfies both
} as const;
export const type = {
  title:   { fontSize: 28, lineHeight: 34, fontWeight: '700' },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '600' },
  body:    { fontSize: 16, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
} as const;
```

## 2. A single `Screen` wrapper owns the insets
Every route renders inside it. Nothing else reads raw insets, except bottom bars and floating buttons.

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function Screen({ children, scroll = false, edges = ['top', 'bottom'] as const }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const pad = width >= 600 ? space.xl : layout.screenPadding;
  const style = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingHorizontal: pad,
    paddingBottom: (edges.includes('bottom') ? insets.bottom : 0) + space.lg,
  };
  const inner = <View style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center', flex: scroll ? undefined : 1 }}>{children}</View>;
  return scroll
    ? <ScrollView contentContainerStyle={style} keyboardShouldPersistTaps="handled">{inner}</ScrollView>
    : <View style={[{ flex: 1 }, style]}>{inner}</View>;
}
```
- If a navigator header or tab bar already handles an edge, pass `edges` without it. Never apply the same inset twice.
- Lists (FlatList / FlashList): put the insets in `contentContainerStyle` (`paddingBottom: insets.bottom + space.lg`), not on the parent, so content scrolls under the bars.
- Android edge-to-edge is on by default from Android 15 (targetSdk 35) and always on in recent Expo SDKs. Assume system bars overlay the app and always use insets. Style the status bar with `expo-status-bar` per theme.

## 3. Sizes come from flex, not from numbers
- No fixed `width`/`height` on containers that hold text. Use `flex`, `minHeight`, `padding` and `aspectRatio` (for images and media).
- Buttons: `minHeight: layout.minTouch` + `paddingVertical`, never a fixed `height`. A fixed height clips text at large font sizes.
- Rows: `flexDirection: 'row', alignItems: 'center', gap: space.sm`. The text child gets `flex: 1` (or `flexShrink: 1`) + `numberOfLines` where it makes sense. Trailing icons/buttons get `flexShrink: 0`.
- Chips and tags: `flexWrap: 'wrap'` with `gap`, never a single row that is assumed to fit.
- Don't use `Dimensions.get('window')` at module level (it goes stale on rotation, folding and split screen). Use `useWindowDimensions()` inside components.

## 4. Breakpoints by width in dp, not by device
```ts
const { width } = useWindowDimensions();
const size = width < 380 ? 'compact' : width < 600 ? 'regular' : 'expanded'; // phone-small / phone / fold+tablet
```
Use this to switch columns (1 → 2 grid), padding, or show a side panel. Never branch on model names or exact pixel sizes.

## 5. Touch targets
- Visual size can be smaller than 48 (for example a 24 icon), but the hit area must not be: use `padding` or `hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}`.
- Keep at least `space.sm` between adjacent targets.
- Android: `android_ripple={{ color: ..., borderless: false }}` on `Pressable`. iOS: an opacity/scale press state.

## 6. Font scaling
- Allow OS font scaling (the default). Cap it only for chrome that physically can't grow: `maxFontSizeMultiplier={1.3}` on tab bar labels and badges. Never use `allowFontScaling={false}` globally.
- Long content must scroll. Any screen that might not fit at 2.0× font should use `Screen scroll`.

## 7. Keyboard
- Use `react-native-keyboard-controller` (`KeyboardAwareScrollView`, or `KeyboardAvoidingView` from that library) for forms. The core `KeyboardAvoidingView` behaves differently per platform under edge-to-edge.
- The submit button either lives inside the scroll content or sticks above the keyboard (`KeyboardStickyView`).

## 8. Platform differences: only where conventions differ
Allowed: back handling, ripple vs opacity, header style, date/time pickers, haptics, native controls (`@expo/ui`).
Not allowed: patching spacing per platform (`Platform.OS === 'android' ? 14 : 16`). If spacing looks different, the cause is usually a font's line height or a double-applied inset, so fix that instead.

## 9. Bilingual / i18n
- Design for the longest translation. Test both languages on `small-360`.
- Don't bake text into fixed-width boxes. Let buttons and labels grow or wrap.
- Dates, numbers and currency go through `Intl` / locale formatting, not string concatenation.

## 10. Images and media
- `aspectRatio` + `width: '100%'`, `contentFit="cover"` (expo-image). Never a fixed pixel height for hero images.
- Provide @2x/@3x assets or vectors (SVG / icon fonts) so they stay sharp at 320–560 dpi.
