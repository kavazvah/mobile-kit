# Maestro conventions

Docs: https://docs.maestro.dev (commands under "Reference"). Install: `curl -fsSL "https://get.maestro.mobile.dev" | bash`.

## Layout

```
.maestro/
  smoke.yaml            # app starts, first screen renders (tag: smoke)
  login.yaml            # one file per critical journey
  subflows/sign-in.yaml # reusable steps, run with runFlow
```

## Flow rules

- Header: `appId: ${APP_ID}`, a `name`, and `tags` (`smoke`, `critical`, …). Android package and iOS bundle id often differ, so pass the id per run: `maestro test -e APP_ID=<id> .maestro/`. The npm scripts `test:e2e` / `test:e2e:ios` do this with the ids from `qa/device-matrix.json`.
- Select by `id:` (React Native `testID`), named `<screen>.<element>`. Text selectors break when copy changes or the app is translated.
- **No sleeps.** Wait with `extendedWaitUntil` (`visible` / `notVisible` + `timeout` in ms). Plain commands already wait up to about 7 s.
- Start each journey from a known state: `launchApp: { clearState: true }`, then sign in through a subflow.
- Deep links (`openLink: <scheme>://path`) are fine for jumping to a screen, but the journey under test should be tapped through.
- End important steps with an assertion (`assertVisible`), and capture `takeScreenshot` at the end state.

## Builds

- Run E2E on a **release** build (`npx expo run:android --variant release`, `npx expo run:ios --configuration Release`) or an EAS build with an `e2e-test` profile. A dev-client build opens its launcher instead of the app, and Expo Go can't be launched by `appId`.
- The app must be installed on the booted device before `maestro test` runs (device-control: `install`).

## Commands

```bash
maestro test -e APP_ID=com.example.app .maestro/                    # all flows
maestro test -e APP_ID=com.example.app --include-tags=smoke .maestro/
maestro test --device <serial|udid> -e APP_ID=... .maestro/login.yaml
maestro test --format=junit --output=maestro-report.xml --test-output-dir=maestro-artifacts -e APP_ID=... .maestro/
```

## On failure

Maestro writes screenshots and logs under `--test-output-dir` (or `~/.maestro/tests/`). Attach the failing step's screenshot plus the last 100 app log lines to the report.
