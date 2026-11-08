# Moon novels — Release 2.2.0 evidence index

Branch: `moonnovels/release-2.2.0` (rollback tag: `rollback/2.1.4-good-ipa` @ `0a10815c`)
Reference (untouched): `fix/ios-rtl-newmoon-reader-port`

## Batch 1 — P0 stability (commit `5fc8e15b`)

### 1. Tap-to-toggle chapter reload (root cause + fix)

**Root cause (code-proven):** `NewMoonReaderScreen.tsx` built `shellHtml` in a
useMemo depending on LIVE `insets.top`/`insets.bottom`. Tapping the screen
toggles the reader dock → `StatusBar.setHidden()` → iOS changes the safe-area
insets → the memo returns a NEW html string → the `<WebView source={{html}}>`
prop changes → WKWebView reloads the whole document → chapter re-fetch, black
screen, dead buttons, lost position. Rotation had the same effect.

**Fix layers:**
- `shellHtml` frozen to a MOUNT-TIME safe-area snapshot (lazy one-time state).
- Live safe-area deltas travel as a bridge `viewport` command → `:root` CSS
  custom properties (`--wor-safe-top/bottom`, clamped 0–200) — never a doc rebuild.
- Full lifecycle protocol: `onLoadStart` bumps the doc epoch + resets the
  bridge queue; the shell's `ready` self-heals a reloaded document (chapter
  re-sent when `chapterSentEpoch !== docEpoch` — pure helper
  `shouldResendChapterOnReady`); 10 s boot failsafe replaces the eternal
  spinner with a retry button; `onContentProcessDidTerminate` (3 GB iPad 7
  render-process kill) cleanly remounts and restores state.

**50-tap acceptance path (code path):** tap → shell `dock` event → RN
`setDockOpen` → re-render with IDENTICAL `shellHtml` string → no reload;
status-bar toggle changes insets → exactly one `viewport` message → CSS var
update. Zero document rebuilds, zero chapter sends.

### 2. `FunctionCallException: 'setActive' ... 'undefined' → Bool` (root cause + fix)

**Evidence chain:**
- `modules/native-volume-button-listener/ios/NativeVolumeButtonListenerModule.swift`:
  `Function("setActive") { (active: Bool) ... }` — strict Expo Modules Core
  conversion; JS `undefined` throws the exact reported message.
- `src/screens/reader/hooks/useChapter.ts:159` passed `useVolumeButtons`
  (from MMKV settings) straight into that call inside a mount-time effect.
- `src/hooks/persisted/useSettings.ts`: `createSettingsWriter` used
  `latest ?? ({} as T)` → the first single-field write persisted a PARTIAL
  object; `useChapterGeneralSettings` merged defaults only when the WHOLE
  object was missing → a stored partial object yields `undefined` booleans →
  crash on reader open. Matches "crash while reading AND after changing
  settings" 1:1.

**Fix (all layers):** JS coercion `useVolumeButtons === true`; every settings
hook now merges defaults (`{...initialX, ...stored}`, memoized) and the
writer folds defaults into every write; Swift parameter relaxed to `Bool?`
(nil → off). Native-call audit of all local modules: no other call site of
this bug class (table in the agent report, commit message).

### 3. Reader-settings unification

New Moon is the only visible engine: EngineSelector removed, old classic
preview (SettingsReaderWebView) removed from the screen, the 4 tabs rewritten
against `@wor_reader_settings_v4`, a REAL preview (`WorPreview.tsx`) runs
`buildWorShell` + `buildWorSectionHTML` through `NewMoonBridge` (never reloads
its document on settings change), and a one-time typed migration
(`CHAPTER_READER_SETTINGS` → WOR settings, flag `@wor_settings_migrated_v1`,
per-key validation + clamps).

## Batch 2 (commit `a38c4d7f`) — reader buttons + RTL + smoothness

- The drawer was UNREACHABLE (no caller of the shell's drawer toggle after the
  native-bar port) → new menu button in the native bar → `drawer` command.
- `nav to:home → Library tab`, `to:downloads → MoreStack/Downloads`,
  `to:settings → ReaderSettings` (+ focus-adopt of persisted settings via
  `diffSettingsPatch`), `to:about → MoreStack/About`; `contact` link removed
  (site-only), admin `tool` card removed; every remaining `{t:…}` event
  audited (table in the commit report).
- RTL: `src/utils/textDirection.ts` first-strong-character detector (18
  tests); NovelSummary/NovelTitle/NovelInfo/ChapterItem/Chip get
  `writingDirection`+`textAlign` per CONTENT language; physical margins →
  logical (`marginStart/End`, `paddingStart/End`).
- Smoothness: BrowseSourceScreen rows memoized (worst re-render offender:
  every keystroke re-rendered all visible covers); NovelScreenList placeholder
  memoized; full audit table in the agent report (measurement deferred to CI).

## Batch 3 (commit `fe7b8814`) — Data & Storage

Native: `getDirectoryStats` (recursive, container-guarded),
`getDeviceStorageInfo`, `clearWebViewWebsiteData`, `TemporaryDirectoryPath`.
Service: real category measurement + per-novel download breakdown +
`formatBytes`. Deletion guarantees: container guards (native + JS),
download/backup coordination guards, per-chapter error capture,
`freedBytes = before − after`, post-delete verification, DB flip via
`markChaptersNotDownloaded` (counter kept in sync by the existing SQLite
trigger). UI: overview + per-novel downloads + category detail with the
separate cookie/login warning for WebView data. Honest limits: WebView size
approximate (no public iOS API), crash-logs category measured-empty on iOS.

## Batch 4 (commit `ac9996f5`) — Theme Studio

Override layer integrated INTO the existing `useTheme` pipeline
(`buildThemeColors`, memoization preserved); all 35 MD3 tokens + 2 editable
keys, light/dark separated; HSV pad + hue slider (no new deps); live preview
local — app re-renders only on commit; 5 presets + user themes
(`@theme_studio_*`); WCAG contrast checker (4.5:1 / 3:1); clipboard
export/import with strict validation; corrupt values fall through to MD3
tokens (never crash).

## Batch 5 (commit `b577cec5`) — identity

Real New-moon-2 logo (`public/icon.png` from the site, 3464×3464, identical
SHA-256 on main/master) → all icon/splash assets regenerated (pure Lanczos
downscales); splash bg #000000 sampled from the logo; `expo.name` +
`CFBundleDisplayName` = "Moon novels"; **bundleIdentifier unchanged**
(`com.rajarsheechatterjee.LNReader`) so the user upgrades over the old
install without losing data; honest limitation: Arabic home-screen name needs
`ar.lproj/InfoPlist.strings` (not generable from app.json CNG); About screen:
identity + tagline + "Based on LNReader" (link preserved) + "Reader engine:
New-moon-2" credit; version 2.2.0.

## CI / simulator (commits `506476e8`, `5acadd10`, `a26dd224`)

- AX-dead XCUITest failures (runs #15–#23) reproduced on iPad/iOS 18.5 AND
  iPhone 17 Pro/iOS 26.5 while the app renders perfectly (boot-smoke.png +
  clean app-console) → runtime-mismatch theory disproven;
  `testAAccessibilityTreeProbe` + `dumpAXTree` added to produce the decisive
  artifact (empty tree ⇒ runner-level AX problem; populated ⇒ query mismatch).
- Bottom tabs + onboarding Complete now expose deterministic `testID`s;
  reader-settings e2e section synced with the batch-1 New Moon settings UI.

## FINAL RESULTS (2026-11-08)

| Deliverable | Result | Link |
|---|---|---|
| Simulator interaction suite (XCUITest, iPhone 17 Pro / iOS 26.5) | ✅ 4/4 tests passed | run 42450135720 |
| Unsigned device IPA (arm64, quality-gated) | ✅ artifact `LNReader-ios-unsigned-ipa` (~23.4 MB) | run 42454059831 |
| Branch tip | `d1a54c25` | moonnovels/release-2.2.0 |
| Rollback point | tag `rollback/2.1.4-good-ipa` @ `0a10815c` | — |

Simulator suite coverage (all green): AX-tree probe · onboarding → language
switch to Arabic (runtime reload + relaunch) → RTL UI assertion → reader
settings preview (real worShell) → engine dock → colors panel → theme preset
applied live · repeated-navigation stress · RTL top-tab indicator sync
(sources ⟷ plugins, rapid taps, library categories).

Engine a11y fixes that fell out of the e2e evidence loop: dock panel tabs
got aria-labels (icon-only compact mode previously left them unnamed).

Known limitation (documented, non-blocking): gorhom bottom-sheet content
(settings sheet) renders correctly but is pruned from the iOS 26 XCUITest AX
snapshot — open-sheet screenshot + AX dump pair in the artifacts proves the
UI itself is correct; the theme path is therefore e2e-driven through the
engine's own WebView panel (which IS AX-exposed) until upstream fixes it.
