# New Moon 2 Reader Port — Feature Mapping

Comparison between the original New-moon-2 reader (`feature/durable-zeus-job-console`)
and this LNReader iOS port (`fix/ios-rtl-newmoon-reader-port`).

## Legend

- ✅ **Ported** — works exactly like the original, engine code verbatim
- 🔀 **Adapted** — same UX, wired to LNReader services instead of the site
- ⏸️ **Intentionally absent** — site-only feature, removed rather than shipped broken

## Engine files

| New-moon-2 file | Port destination | Status |
|---|---|---|
| `src/reader/worShell.js` (engine + UI, 2592 lines) | `src/reader/newmoon/worShell.js` | ✅ verbatim + documented surgical edits (Google-Fonts removed, report/comments UI removed, image style added) |
| `src/reader/worCSS.js` (Galaxy stylesheet, 488 KB) | `src/reader/newmoon/worCSS.js` | ✅ verbatim (Galaxy Novels attribution header kept — see licensing note) |
| `src/reader/worFonts.js` (29 Arabic font entries) | `src/reader/newmoon/worFonts.js` | 🔀 every picker entry kept; rendering backed by 9 locally bundled TTFs (`assets/reader/fonts/newmoon/`, all OFL) — zero network font requests |
| `src/reader/wordsStore.js` (replacement store) | `src/reader/newmoon/wordsStore.js` | ✅ verbatim (braced `if/else` for lint) |
| `src/reader/storage.ts` (localStorage shim) | `src/reader/newmoon/storage.ts` | 🔀 MMKV-backed, same async `getItem/setItem/removeItem` API |
| `src/screens/Reader/wor/sections.ts` (HTML builder) | `src/reader/newmoon/sections.ts` | 🔀 same `processLineHTML`/`buildWorSectionHTML`/`DEFAULT_SETTINGS`/`THEME_CYCLE`; site decrypter removed; `<img>` lines pass through unescaped |
| `src/screens/Reader/wor/WorReader.tsx` (host, 1498 lines) | `src/screens/reader/newmoon/NewMoonReaderScreen.tsx` + `NewMoonAdapter.ts` + `NewMoonBridge.ts` | 🔀 rewritten as a thin RN controller over the SAME message contract |
| `src/reader/optionalModules.ts` (Wake Lock) | `src/screens/reader/components/KeepScreenAwake.tsx` | 🔀 `expo-keep-awake` driven by the engine's `keepAwake` setting |

## Reader features

| Feature | Status | Notes |
|---|---|---|
| Galaxy Novels reading surface / design | ✅ | verbatim CSS + DOM |
| Single-tap toolbar (dock) show/hide | ✅ | engine logic verbatim (selection / interactive-element / 700 ms touch / 8 px drag guards) |
| Floating dock panels (book / text / font / background / settings / color) | ✅ | report panel removed with the site backend |
| Chapters sheet: list, search, pagination, load-more | ✅ | list + load-more served from LNReader DB → plugin extension; search is local over the same list |
| Font size / family / weight | ✅ | 29 entries, offline TTFs |
| Text direction & alignment (`rtl` / `ltr` / `center`) | ✅ | per-reader setting, independent of app UI RTL |
| Line height / word spacing / brightness | ✅ | JS color-mix brightness (no CSS filter re-render) |
| Preset themes + theme cycle button | ✅ | `THEME_CYCLE` verbatim |
| Visual color pickers (bg / text / progress) | ✅ | HSV canvas pickers verbatim |
| Progress bar + reading percent | ✅ | percent also written to `Chapter.progress` |
| Position save / restore (pixel-exact) | 🔀 | MMKV `@wor_scroll_<novelId>_<chapterId>` + `@wor_last_<novelId>`; restored via `chapter.scrollOffset` (in-section offset, multi-retry pin) |
| Auto-scroll | ✅ | engine rAF loop, touch-pause |
| Continuous mode across chapters | ✅ | `needNext` → position-neighbor fetch → `appendChapter` + `scrollToChapter`; re-entrancy lock + epoch stale guard |
| Next / previous chapter | ✅ | resolved through the real chapter list (NEVER `number ± 1` arithmetic) |
| Word replacement (per-novel / global) | ✅ | store keys `@reader_words_v3` identical; HTML-safe application |
| Colored replacement terms | ✅ | same colored-regex path |
| Dialogue / markdown / bracket / custom-mark formatting | ✅ | same `STRUCTURAL_KEYS` rebuild-with-keepScroll behavior |
| Hide chapter title | ✅ | engine body class |
| Keep screen awake | 🔀 | engine switch → `expo-keep-awake` (mirrors the classic reader) |
| Favorites | 🔀 | maps to LNReader "in library" (`switchNovelToLibraryQuery`) |
| Offline reading | 🔀 | LNReader downloads (`NativeFile`) served first, plugin fetch fallback |
| TTS | 🔀 | expo-speech on the post-replacement chapter text, native overlay bar (basic start/stop) while the dock is open |

## Site-only features (intentionally not ported)

| Feature | Reason |
|---|---|
| Login / roles / admin cleaner & copyright tools | LNReader has no site account (card hidden via `userRole: ''`) |
| Comments (`CommentsModal`, counts) | site backend only; trigger markup removed |
| Report submissions | site backend only; panel/modal markup removed, handler stays a defensive no-op |
| Reader session / risk engine / captcha | anti-scrape stack specific to galaxynovels.com |
| IndexedDB offline store | replaced by LNReader's download system |
| Content decryption (`normalizeContent`) | site payload format |
| Google-Fonts network loading | offline-first app → bundled TTFs |

## LNReader features preserved (outside the engine)

- Full library, browse, downloads, trackers, statistics — untouched.
- Classic reader remains available: **Settings → Reader → "محرك القارئ / Reader engine"**
  (`EngineSelector`, keys `readerSettings.engine*`), setting `@reader_engine_v1`;
  New-moon is the default, Classic is the fallback. EPUB/TTS-depth features of the
  classic reader stay there for now.

## Bridge protocol (unchanged from the original)

- web → RN: `window.ReactNativeWebView.postMessage(JSON {t:…})` — `ready`, `scroll`,
  `needNext`, `chaptersSearch`, `dock`, `wordsOpen`, `settings`, `themeCycle`, `nav`,
  `goto`, `fav`, `novelPage`, `chaptersLoadMore`, `words`, `profile`, `exit`, `error`
  (`comments` / `report` / `tool` remain as accepted no-ops)
- RN → web: `injectJavaScript('window.__wor.receive(<literal>)')` — `settings`,
  `chapter`, `appendChapter`, `scrollToChapter`, `endReached`, `loadingNext`,
  `chapters`, `chaptersSearchResults`, `words`, `wordsSaved`, `fav`, `scrollTo`,
  `backPress`, `toast`
- Invalid inbound messages are dropped; the outgoing queue flushes on `ready`;
  stale chapter fetches are discarded by request-id/epoch; the WebView is never
  reloaded for settings changes.

## Licensing note

`worCSS.js` is a verbatim copy of the Galaxy Novels (galaxynovels.com) compiled
reader stylesheet and ships without a license in the source repository. It is
reproduced here because the port contract requires the engine's original design.
Before ANY public redistribution of this bundle beyond the current repos,
confirm usage rights with the design's owner — otherwise replace the stylesheet
with a functionally equivalent, self-authored one.
