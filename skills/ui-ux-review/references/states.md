# Screen states

Every data-driven screen handles all of these. A review lists each missing state as a finding (missing error or empty state: P2; a state that crashes or blocks: P1).

| State | Required | Check in code |
|---|---|---|
| **Loading** | Skeleton that matches the final layout when loading can take > 300 ms; a spinner only for short or unknown waits. No layout jump when data arrives. | `isLoading` / `isPending` branch renders a placeholder with the same structure |
| **Empty** | Explanation of why it's empty + the primary action ("No trips yet. Plan your first trip"). Not a blank screen. | `data.length === 0` branch |
| **Error** | Human message + **Retry**. Keep previously loaded data visible when a refresh fails. | `isError` branch with a retry that calls `refetch()` |
| **Offline** | Visible indicator; cached data stays usable; actions queue or explain they need a connection. | NetInfo / query `networkMode` handling |
| **Partial data** | Missing optional fields (avatar, description) don't break layout; long text truncates or wraps on purpose. | Optional chaining + fallbacks; `numberOfLines` where intended |
| **Success feedback** | Mutations confirm (toast/snackbar, inline check, navigation) and don't leave the user guessing. | `onSuccess` path visible to the user |

Also check:
- Pull-to-refresh on lists that show remote data.
- Pagination: a footer loader and an end-of-list state; errors while loading more don't wipe the list.
- Forms: disabled + loading state while submitting; server errors mapped to fields when possible.
