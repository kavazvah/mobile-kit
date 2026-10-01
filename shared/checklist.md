# Screenshot review checklist

Review each screen **across all profiles side by side**. Severity: **P1** = broken or unusable, **P2** = clearly wrong, **P3** = polish.

## 1. System UI and safe areas (P1)
- [ ] Nothing interactive or important sits under the status bar, notch/Dynamic Island, or camera hole.
- [ ] Bottom content and CTAs clear the home indicator (iOS) and the gesture bar or 3-button nav bar (Android). Check the `+3button` shot.
- [ ] Android edge-to-edge: backgrounds may extend under the system bars, but content must not. The status bar icons stay readable (light/dark style matches the background).
- [ ] Scrollable lists: the last item is fully reachable above the bottom inset / tab bar.

## 2. Fit and overflow (P1–P2)
- [ ] No horizontal overflow and no content cut at the right edge (the audit flags `horizontal-overflow`).
- [ ] Rows with text + icon/button: the text truncates or wraps and never pushes the button off-screen (on 360dp and at `font-200`).
- [ ] Buttons: the label fits on 360dp in both languages. No clipped text inside fixed-height buttons at large font sizes.
- [ ] Short screen (`short-360`): the primary action is reachable (scrollable if needed) and nothing overlaps.
- [ ] Nothing is laid out for one width only: on `large-448`, fold and tablet, content does not look stretched (use a max width, columns or a grid).

## 3. Touch targets (P2)
- [ ] Every tappable element is at least 48×48dp (Android) or 44×44pt (iOS), including icon buttons, chips and list-row actions. The audit flags `small-touch-target`; `hitSlop` does not show in the audit, so confirm in code.
- [ ] Adjacent targets are at least 8dp apart.

## 4. Spacing and alignment (P2–P3)
- [ ] Horizontal screen padding is the same on every screen (one token, typically 16; 20–24 on large widths).
- [ ] Vertical rhythm follows the spacing scale (4/8/12/16/24/32). No odd values like 13 or 17.
- [ ] Left edges align: the title, body text and list content share the same inset.
- [ ] Cards and lists: internal padding is consistent, and gaps between cards match.

## 5. Text and font scaling (P1–P2)
- [ ] At `font-130` / `xxxl`, everything is readable and nothing overlaps.
- [ ] At `font-200` / `a11y-large`, the layout reflows (wraps, scrolls). Clipped text is P1; ugly but usable is P3.
- [ ] Hierarchy: at most 3–4 text sizes per screen, with a clear title → body → caption order.
- [ ] Line length on wide screens stays readable (a max width on text containers).

## 6. Theming (P2)
- [ ] Dark mode: no hardcoded white/black surfaces, readable contrast, and borders/dividers still visible.
- [ ] Images/illustrations with transparent backgrounds still look right on dark.

## 7. Platform conventions (P3, P2 if confusing)
- [ ] Android: ripple feedback on pressables, a working back gesture/button, no iOS-only affordances (like a bare "<" back chevron without a label).
- [ ] iOS: the header/back behaviour matches the rest of the app, and sheets can be dismissed by swipe.
- [ ] Keyboard (when a screen has inputs): the focused field and the submit button stay visible above the keyboard on `short-360`.

## Findings format
`[P1] settings / small-360+font-200: the "Sačuvaj" button text is clipped by the fixed height 44 → use minHeight + paddingVertical (src/components/Button.tsx:32)`
