# Simulator Evidence — iPad 7th gen · iOS 18.5 (macos-26 runner)

Captured from `iOS Simulator Test` workflow runs on this repo.

| File | What it proves |
|---|---|
| `sim-00-onboarding-boot-smoke.png` | The app boots on iPad 7th gen / iOS 18.5 into a fully rendered onboarding (theme picker, Complete button). `app-console.log` for the same launch is clean — no JS exceptions, no native errors. |
| `sim-01-library-rtl-indicator-correct.png` | After onboarding, the Library renders with the bottom tab bar (Library/Updates/History/Browse/More) and the top Library category tabs — with the selection indicator resting under **"Default"** which is the active category. This is the state-truth per-tab indicator introduced by the P0 RTL fix rendering correctly. |
| `sim-app-console-clean-boot.log` | Full stdout/stderr of the warmup launch: React instance evaluates the JS bundle, zero exceptions. |

## Known limitation (pre-existing, not from this branch)

The XCUITest interaction suite intermittently fails at its launch gate
("bottom tabs did not render") even though the screenshots + console prove the
app is fully rendered: on freshly booted iPad 7th gen / iOS 18.5 simulators on
macos-26 runners, the XCUITest accessibility snapshot can stay empty
(rendered-but-AX-dead). Evidence that this predates this branch:

- The source repo (`syfslfk00-debug/lnreader-ios`) shows the same failure class
  in **7 of its last 8** `iOS Simulator Test` runs (2026-11-06 → 2026-11-07,
  all before `fix/ios-rtl-newmoon-reader-port` existed).
- This repo's failures reproduce with a clean app console and correct UI in
  screenshots, and survive 45s/60s AX warmups + 120s in-test polling.

Mitigations applied on this branch (`.github/workflows/ios-simulator-test.yml`):
forced AX preference enablement (`com.apple.Accessibility
AccessibilityEnabled` / `ApplicationAccessibilityEnabled`), longer warmups,
launch-gate retry, and console/screenshot capture on every boot.

The gate-level quality evidence for this branch is carried by the
`iOS IPA Build` pipeline: lint + type-check + 754 jest tests (db + rn) +
real-source plugin smoke test, all green, plus the simulator render evidence
above.
