# CI

If Callstack's `github-actions` skill is installed, follow it for build-artifact workflows (simulator/emulator builds, caching). The templates below are the minimal versions. Action versions were current on 2026-10-01; bump them when you add the workflow.

## Unit + component tests on every PR (GitHub Actions)

`.github/workflows/test.yml`:

```yaml
name: test
on:
  pull_request:
  push:
    branches: [main]
jobs:
  jest:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache: npm            # or yarn / pnpm, matching the lockfile
      - run: npm ci
      - run: npx jest --ci
```

## E2E option A: EAS Workflows (Android and iOS, no emulator setup)

`eas.json` needs a build profile that produces an `.apk` and a simulator `.app`:

```json
{
  "build": {
    "e2e-test": {
      "withoutCredentials": true,
      "ios": { "simulator": true },
      "android": { "buildType": "apk" }
    }
  }
}
```

`.eas/workflows/e2e-android.yml` (same shape for iOS with `platform: ios`):

```yaml
name: e2e-test-android
on:
  pull_request:
    branches: ['*']
jobs:
  build_android_for_e2e:
    type: build
    params:
      platform: android
      profile: e2e-test
  maestro_test:
    needs: [build_android_for_e2e]
    type: maestro
    params:
      build_id: ${{ needs.build_android_for_e2e.outputs.build_id }}
      flow_path: ['.maestro/smoke.yaml']
```

EAS Workflows is a paid EAS service; for details use the Expo plugin's `eas-workflows` skill if it is installed.

## E2E option B: Android emulator on GitHub Actions (free runners)

```yaml
  e2e-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 22, cache: npm }
      - uses: actions/setup-java@v6
        with: { distribution: temurin, java-version: 17 }
      - run: npm ci
      - run: npx expo prebuild --platform android --no-install
      - run: cd android && ./gradlew assembleRelease
      - run: curl -fsSL "https://get.maestro.mobile.dev" | bash && echo "$HOME/.maestro/bin" >> "$GITHUB_PATH"
      - name: Enable KVM
        run: |
          echo 'KERNEL=="kvm", GROUP="kvm", MODE="0666", OPTIONS+="static_node=kvm"' | sudo tee /etc/udev/rules.d/99-kvm4all.rules
          sudo udevadm control --reload-rules
          sudo udevadm trigger --name-match=kvm
      - uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          arch: x86_64
          script: |
            adb install android/app/build/outputs/apk/release/app-release.apk
            maestro test -e APP_ID=<android package> --format=junit --output=maestro-report.xml .maestro/
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: maestro-report
          path: maestro-report.xml
```

- The release build is signed with the debug keystore by default in a fresh `prebuild`, which is fine for CI.
- Keep E2E in a separate job (or a nightly schedule) so unit tests stay fast.
