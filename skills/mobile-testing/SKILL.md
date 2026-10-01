---
name: mobile-testing
description: Decide what to test at which layer (unit, component, E2E, exploratory) in a React Native / Expo app, scaffold Jest + React Native Testing Library + Maestro, run the tests, and wire CI. Use for "add tests for this screen", "add an E2E test for login", "set up Jest", "why is this test failing", "run tests in CI". For RNTL API details defer to the react-native-testing skill; for an unscripted bug hunt use agent-device's dogfood skill.
---

# Mobile testing

## 1. Pick the layer

Read `${CLAUDE_PLUGIN_ROOT}/skills/mobile-testing/references/strategy.md`. In short:

| Layer | Tool | Where |
|---|---|---|
| Unit | Jest, `jest-expo` preset | next to the code or in `__tests__/` (never inside `app/`, which expo-router treats as routes) |
| Component | React Native Testing Library | same |
| E2E | Maestro | `.maestro/<journey>.yaml`, one flow per critical journey |
| Exploratory | agent-device `dogfood` | writes a bug report with screenshots |

Default to unit + component. Add an E2E flow only for a journey that would block a release.

## 2. Conventions

- Query by role, label or text; `testID` only as a last resort. `testID` format: `<screen>.<element>`, for example `settings.save-button`. Maestro selects the same id with `id:`.
- Check the RNTL major in `package.json` before writing tests. In v14 (React 19) `render`, `fireEvent`, `act` and `rerender` are async and must be awaited; v13 is sync. If the `react-native-testing` skill is installed, follow its version-specific reference.
- Prefer `userEvent` over `fireEvent`. No snapshot tests of whole screens.
- Maestro flows use `appId: ${APP_ID}`. The app ids come from `qa/device-matrix.json` (`app.androidPackage`, `app.iosBundleId`) through the npm scripts. **No sleeps**: wait with `extendedWaitUntil`. Details: `${CLAUDE_PLUGIN_ROOT}/skills/mobile-testing/references/maestro.md`.

## 3. Scaffold (only when asked; idempotent)

Preview, show the plan, then apply:

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs --testing --only package-json,test-example,maestro-smoke --dry-run
node ${CLAUDE_PLUGIN_ROOT}/scripts/scaffold.mjs --testing --only package-json,test-example,maestro-smoke
```

It adds:
- `"jest": { "preset": "jest-expo" }` to `package.json` if no Jest config exists (an existing one is reported, not changed);
- npm scripts `test` (`jest`) and `test:e2e` (`maestro test -e APP_ID=<android id> .maestro/`), plus `test:e2e:ios` when the iOS id differs. Existing scripts are never replaced;
- one example component test in `__tests__/` (or `src/__tests__/`), matching the installed RNTL major;
- `.maestro/smoke.yaml`, which waits for `testID="home.screen"` on the start screen.

Then do what the plan's "still to do" list says: install the missing dev dependencies (the exact `npx expo install … --dev` command is printed; ask first), and add `testID="home.screen"` to the start screen's root view. Run `npx jest` once to prove the setup works.

## 4. Run

- Unit/component: `npx jest` (one file: `npx jest path/to/file.test.tsx`; CI: `npx jest --ci`).
- E2E: build a **release** app (`npx expo run:android --variant release` / `npx expo run:ios --configuration Release`), install it on a booted device (`node ${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs install <apk|app>`), then `npm run test:e2e` (or `test:e2e:ios`). A dev-client build opens its launcher, so Maestro can't reach the app.
- Exploratory: if the `dogfood` skill is installed, follow it; turn every confirmed bug into a unit, component or E2E test.

## 5. When a test fails

- Unit/component: read the assertion and `screen.debug()` output, then fix the code or the test. Never loosen an assertion to make it pass without saying why.
- E2E: report the failing step with a **screenshot plus the last 100 log lines**:

  ```bash
  node ${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs screenshot qa-shots/e2e-fail.png [--platform ios]
  node ${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs logs --app <appId> --lines 100 [--platform ios]
  ```

  Maestro's own artifacts are in `--test-output-dir` (or `~/.maestro/tests/`). Reproduce the step with agent-device before changing the flow.
- Flaky test: fix the wait condition or the test data. Never add retries or sleeps.

## 6. CI

Read `${CLAUDE_PLUGIN_ROOT}/skills/mobile-testing/references/ci.md`: GitHub Actions for unit/component tests on every PR, and E2E either on EAS Workflows (`type: maestro` job) or on an Android emulator in GitHub Actions. If Callstack's `github-actions` skill is installed, follow it for build-artifact workflows.
