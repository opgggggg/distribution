# Android interaction design

Android uses `AndroidWorkspace.vue` around the existing format editors. The native
host selects this shell independently of viewport width, so tablets and split
screen keep touch controls. HarmonyOS retains its own home and chrome.

## User flows

- **Files:** searchable recent drafts and open documents, format filters, the
  Android system document picker, and an extended New button. No desktop welcome
  panel or unsupported AI connection claims.
- **Navigation:** Files / Settings are top-level destinations. A document
  occupies one screen. Switch documents from its title or the document menu.
- **Reading:** imported and restored documents open read-only. Tapping text does
  not enter editing. Markdown displays a rendered preview. Edit is an explicit
  bottom action; completing editing returns to reading without remounting the
  engine or losing its undo history.
- **Editing:** bottom controls expose Undo, Format, Insert, Save a copy, and Hide
  keyboard. Sheets share the DOCX Insert surface and a right-aligned close button; advanced commands use the
  format engine's mobile ribbon. Redo lives in the document menu.
- **Saving:** the status distinguishes a local draft from an exported file.
  Save a copy opens the system destination picker. Closing first saves a draft;
  a failed or out-of-date save keeps the document open. Back from Home cannot
  close the Activity while an open editor still has unpersisted changes.
- **Back:** dismiss the active sheet first, then presentation/search/tool layers,
  keyboard, editing mode, document, home filters/destination, and finally the
  Activity. Android 13+ uses `OnBackInvokedDispatcher`; older versions retain the
  Activity callback. Escape mirrors the internal stack during browser testing.

## Accessibility and adaptation

Shell controls have at least 48px touch targets and named SVG icons. Native HTML
modal dialogs isolate sheet focus and restore it when dismissed. Layout uses
scrollable content, safe fixed controls, reduced-motion support, semantic light
and dark tokens, and system fonts. Android respects system font scaling.
Android 11+ system-bar, display-cutout, and IME insets resize the WebView bounds,
including fixed sheets, for Android 15 edge-to-edge behavior. Home and editor
footers have 52px rows, 48px touch targets and a green active home tab.

## Validation (2026-09-06)

Passed:

- Shared package build, Vue type checking, and production mobile Web build.
- Java compilation against the official Android API 35 `android.jar` with
  generated-resource stubs (this is not an APK build).
- Browser checks at 375×812, 812×375 and 1024×768: home, document reading/editing,
  sheet layout and no root horizontal overflow.
- Measured primary document controls: top bar 48px tall; bottom bar 56px tall,
  67px wide on a 375px viewport.
- DOCX: sequential keyboard input, select all, format-sheet bold command, draft
  persistence, restore, and explicit reading/editing transition.
- Markdown: input, rendered reading preview, draft persistence, safe close, and recovery.
- XLSX: initialization, cell entry, reading mode, and draft save. Mounting is
  deferred outside the Vue render effect to avoid recursive snapshot updates.
- PPTX: initialization within the mobile shell.
- New and Insert modal focus isolation, Escape dismissal, search empty state.

Remaining device checks:

- Actual Android keyboard/IME composition, keyboard resize animations, TalkBack,
  gesture Back, display cutouts, system font scaling and dark-mode contrast.
- APK packaging and on-device open/save cancellation. No full Android SDK build
  tools or connected device were available in this workspace.
- A single multiline browser automation text insertion into DOCX triggered the
  pinned upstream engine's semantic-write-log export error; sequential keyboard
  input and bold export passed. The host now preserves the error status while
  retrying and refuses unsafe close/exit. The engine exception itself remains
  an upstream issue to reproduce with Android paste/IME input.

## Startup validation (2026-09-08)

Headless Chromium 152 with the WebView's file-to-file access preference, an
emulated Android host object and a 390×844 viewport, loading the built
`assets/web/index.html` from `file://`:

- Home rendered and `appReady()` fired 150–230 ms after navigation with only
  the ~1 MB entry chunk fetched; no console, exception or network errors.
- New → Word loaded the DOCX engine chunks on demand and produced an editable
  surface in about 600 ms; no errors.
- Without the file-access preference the entry module is rejected by CORS, so
  `setAllowFileAccessFromFileURLs(true)` in `MainActivity` is load-bearing.
- `assembleDebug` with the API 35 SDK produced a 21 MB APK containing 101 chunks.

Not yet verified on a device: the native startup view, real WebView timing,
and the picker-open prefetch. No emulator or device was available.

## Local browser preview

```sh
npm ci
npm run build:packages
APP_PROFILE=cubeoffice npm run profile:sync
npx vite --config apps/harmony/vite.config.ts --host 127.0.0.1
```

Open `http://127.0.0.1:5173/?platform=android`. The preview override is development
only. Installed APKs detect the native host automatically.

Design references:

- https://developer.android.com/develop/ui/views/layout/edge-to-edge
- https://developer.android.com/design/ui/mobile/guides/patterns/predictive-back
- https://support.google.com/accessibility/android/answer/7101858

## Android workspace update (2026-09-09)

- Files and Settings share a compact footer. Active navigation uses green without a pill.
- Word formatting has a dedicated phone panel with Text/Paragraph tabs, a font picker,
  size stepper, style controls, and color palette. All tools remain available from its
  secondary action. Other tool panels share the title, right-side close, spacing,
  neutral controls and borderless sections.
- Ribbon scrims end at the tool surface; they cannot intercept its controls. Word
  establishes a text insertion point before opening formatting controls.
- Error notices can be dismissed, including validation inside the Insert/Format dialogs.
- New presentations offer the profile's existing template catalog, previews, retry,
  checksum-checked download, and an offline blank-document path.
- The file picker and Android VIEW/SEND/SEND_MULTIPLE associations include legacy
  DOC/DOT, XLS/XLT, PPT/PPS/POT, CSV and supported PNG/JPEG/WebP/EMF/WMF images.
- Surface refs compare the original component instance, preventing repeated Markdown
  adapter wrapping from remounting the same document in a render loop.

Browser regression checks: `apps/android/tests/workspace.cjs` (run with Vite's Android
preview; set `PLAYWRIGHT_MODULE_PATH` when using a bundled Playwright install).

Validation: the browser regression script passed for all five editors at 375×812,
390×844, 812×375 and 1024×768 (including dark mode and reduced motion). The pinned
XLS importer/converter regression passed. Vue type checking and Android API 35
`assembleDebug` passed. Native picker association/Back/IME behavior still needs an
Android device check.
