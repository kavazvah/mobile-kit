# Copy rules

- **Sentence case** for titles, buttons and labels ("Save changes", not "Save Changes"), unless the brand guide says otherwise.
- **Buttons are verbs** that name the result: "Save changes", "Delete trip", "Send invite". Avoid "OK", "Submit", "Yes/No" in dialogs; repeat the action ("Delete" / "Cancel").
- **No truncated critical text**: titles, prices, errors and button labels must never end in "…" on `small-360` or at 2.0× font. Truncation is acceptable only for secondary text with the full value reachable.
- **Errors** say what happened and what to do next, without blame or codes: "Couldn't save. Check your connection and try again."
- **Empty states** explain and invite: what this screen holds and the first action.
- **Numbers, dates, currency** are formatted for the locale (`Intl`), never concatenated strings.
- **Every locale checked**: run the matrix per locale (device-matrix-qa → Locales). The longest translation decides the layout; no text baked into images.
- Consistent terms: one word per concept across the app ("Trip" everywhere, not "Trip" / "Journey" / "Booking").
