# Nielsen's 10 heuristics, for mobile (React Native)

1. **Visibility of system status**
   - Every async action shows progress within 100 ms (pressed state, spinner in the button, skeleton for content).
   - Pull-to-refresh and list loading use `RefreshControl` / footer spinners, not a blocking overlay.
   - Offline or failed sync is visible (banner or inline), not silent.
2. **Match between system and the real world**
   - Labels use the user's words, not API or table names. Dates, numbers and currency go through `Intl` for the active locale.
   - Icons are the platform's standard ones (SF Symbols / Material) for standard actions.
3. **User control and freedom**
   - Back works everywhere (Android hardware back, iOS swipe-back not blocked). Modals have a visible close/cancel.
   - Destructive actions offer undo (snackbar) or confirmation; forms keep input on back-and-return where expected.
4. **Consistency and standards**
   - Same component and spacing for the same job across screens (one button style per hierarchy level; spacing from tokens).
   - Platform conventions: iOS header back title and large titles where used; Android top app bar and ripple.
5. **Error prevention**
   - Correct `keyboardType`, `autoComplete`, `textContentType`, `autoCapitalize` on inputs; submit disabled until valid, with the reason visible.
   - Double-submit is prevented (button disabled or loading while the request runs).
6. **Recognition rather than recall**
   - Tab bar labels next to icons; recent/selected values are shown, not remembered.
   - Form errors appear next to the field, not only in a toast.
7. **Flexibility and efficiency of use**
   - Keyboard `returnKeyType` moves to the next field / submits. Lists that grow have search or filters.
   - Long-press or swipe shortcuts always have a visible alternative.
8. **Aesthetic and minimalist design**
   - One primary action per screen, visually dominant. Secondary actions are quieter (text or outline).
   - No decorative content that pushes the primary action below the fold on `small-360`.
9. **Help users recognize, diagnose and recover from errors**
   - Error messages say what happened and what to do, in plain language, with a retry action. No raw error codes or stack traces.
   - Field validation explains the rule ("At least 8 characters"), not just "Invalid".
10. **Help and documentation**
    - Empty states and first-run screens explain what the screen is for and offer the first action.
    - Permission prompts are preceded by an in-app explanation of why the permission is needed.
