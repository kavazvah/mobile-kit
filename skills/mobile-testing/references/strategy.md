# What to test at which layer

| Layer | Tool | Put here | Don't put here |
|---|---|---|---|
| Unit | Jest (`jest-expo` preset) | Pure logic: formatters, reducers, validation, date/number/currency per locale, hooks without UI (`renderHook`) | Anything that needs a device |
| Component | React Native Testing Library | One screen or component: renders the right states, reacts to presses/typing, calls the right callbacks, accessibility names/roles | Navigation across many screens, real network, animations |
| E2E | Maestro (`.maestro/`) | Critical journeys on a real build: launch, sign in, the main task, purchase, settings that persist | Edge cases already covered below; visual layout (use device-matrix-qa) |
| Exploratory | agent-device `dogfood` | Unscripted sessions that find crashes and UX problems; writes a bug report with screenshots | Regression checks (turn findings into tests) |

## Rules of thumb

- Most tests are unit + component. They run in seconds on every PR. E2E covers only the journeys that would block a release; aim for one flow per journey.
- Test behaviour the user sees, not implementation: no assertions on state variables, internal props or style objects (except when style *is* the behaviour, such as hidden vs visible).
- Every data-driven screen gets component tests for loading, empty, error (with retry) and success states. Mock the data layer (fetch / query client) at its boundary, not deep inside components.
- Queries, in order: `getByRole` > `getByLabelText` > `getByPlaceholderText` > `getByText` > `getByDisplayValue` > `getByTestId`. If you need `testID`, use `<screen>.<element>` (for example `settings.save-button`).
- Prefer `userEvent` over `fireEvent`. In RNTL 14 `render`, `fireEvent`, `act` and `rerender` are async: always `await` them. RNTL 13 renders synchronously. Check the installed major before writing tests.
- Native modules that Jest can't run (camera, maps, haptics): mock them in a `jest.setup` file, once, not per test. `jest-expo` already mocks most Expo modules.
- Snapshot tests only for small, stable, presentational output. Never for whole screens.
- A flaky test is a bug: fix the wait condition or the data, never add retries or sleeps.

## When a test fails

- Unit/component: read the failing assertion and the rendered tree (`screen.debug()`), fix the code or the test, re-run only that file (`npx jest path/to/file`).
- E2E: collect a screenshot and the last 100 log lines (device-control: `node ${CLAUDE_PLUGIN_ROOT}/scripts/device.mjs screenshot fail.png` and `... logs --app <appId> --lines 100`), then reproduce the step manually with agent-device before changing the flow.
