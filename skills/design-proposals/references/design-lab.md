# Design Lab

A dev-only route that renders the variants of one feature so they can be captured on real devices and compared.

## Files

| File | Created by | Notes |
|---|---|---|
| `<routes root>/__design-lab/[feature].tsx` | `design-lab.mjs scaffold` (once) | From `assets/DesignLab.template.tsx`. An empty screen that only makes the URL valid. |
| `src/design-lab/DesignLabHost.tsx` | `design-lab.mjs scaffold` (once) | From `assets/DesignLabHost.template.tsx`. Mounted once in the root layout; when the app is opened with a `__design-lab/<feature>` link it draws that variant as a full-screen overlay. Needs `expo-linking`. |
| `src/design-lab/registry.ts` | `design-lab.mjs register` | Generated. Maps feature → { A, B, C } components. Never edit by hand. |
| `src/design-lab/<feature>/Variant{A,B,C}.tsx` | `design-lab.mjs new` (stubs) | One default-exported component per variant with a one-line thesis header. |
| `qa-shots/design-lab/<feature>.json` | `design-lab.mjs config` | Matrix config for the lab run (git-ignored with `qa-shots/`). |

(Without a `src/` folder, the variants live in `design-lab/` at the project root.)

## Commands

```bash
DL="${CLAUDE_PLUGIN_ROOT}/scripts/design-lab.mjs"
node $DL scaffold                                  # route + host + registry, once per project
node $DL new --feature onboarding                  # VariantA/B/C stubs (+ --variants A,B)
node $DL register                                  # regenerate the registry after adding/removing variants
node $DL config --feature onboarding               # matrix config for the variants
```

## Deep links and builds

- `<scheme>://__design-lab/<feature>?v=B` opens variant B; `&chrome=0` hides the A/B/C switcher (the generated matrix config adds it so screenshots are clean).
- The route renders only when `__DEV__` is true or the app was built with `EXPO_PUBLIC_DESIGN_LAB=1`. Android dev builds work as is. iOS matrix runs use a release build, so build it with `EXPO_PUBLIC_DESIGN_LAB=1 npx expo run:ios --configuration Release`. Never ship a store build with that variable set.
- Why an overlay that reads the URL itself: a tab navigator (expo-router `NativeTabs`, the SDK 57 default) silently drops a link to a route that isn't a tab, so the path never changes and the lab route never shows. The host listens to the incoming URL with `useURL()` from `expo-linking` (both `<scheme>://__design-lab/x` and Expo Go's `exp://host:8081/--/__design-lab/x`) and draws on top of whatever navigator the app uses. Opening any other screen closes it.
- In Expo Go the link is `exp://<metro host>:8081/--/__design-lab/<feature>?v=A`.
- `scaffold` reports `host mounted` once `<DesignLabHost />` is in the root layout. Keep it there after a decision; it renders nothing outside the lab.

## Promote

After the user chooses: move the chosen variant's code into the real screen/component (keep the tokens), delete `src/design-lab/<feature>/`, and run `node $DL register`. Leave the route and the host in place.
