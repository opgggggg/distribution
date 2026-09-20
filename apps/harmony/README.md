# CubeOffice for HarmonyOS

This proof of concept packages the existing Vue Office editors and viewers in an
ArkWeb-backed HarmonyOS application. The ArkTS shell owns document selection and
persistence; the editing surfaces remain browser-native and do not import Tauri.

## Current scope

- Phone, tablet, and 2-in-1 entry HAP.
- Offline Vue/Vite assets loaded from `resources/rawfile/web`.
- DOCX, PPTX, XLSX, JMP, VSDX, Markdown, PDF, and draw.io selection through
  `DocumentViewPicker` and ArkWeb's file-selector event.
- New editable DOCX, PPTX, XLSX, VSDX, and Markdown documents.
- Read-only PDF and JMP surfaces, plus draw.io-to-VSDX import.
- Home and persistent multi-format tabs that keep editor state mounted.
- Debounced mobile autosave to an app-local IndexedDB store, with background
  flushing and restoration of open editable documents after relaunch.
- Chunked export to the application cache followed by a format-aware native save picker.
- Browser fallback for checking the renderer before DevEco Studio is installed.
- Shared Android/Harmony feedback and client-services UI (`web/src/services`),
  accessible from the Harmony app menu under **反馈与更新**.
- Harmony's native adapter persists a random client ID in Preferences and submits
  text feedback to the existing CubeOffice API. Update checks use AppGallery Kit
  `checkAppUpdate`; installation uses `showUpdateDialog` only after checking again.
  There is no website package-download fallback for Harmony or unknown channels.
  Successful checks report the client ID to the existing update-checks/DAU API;
  a statistics failure does not prevent a store update.
- The reported platform carries the device type from `deviceInfo.deviceType`:
  `harmonyos-phone`, `harmonyos-tablet` or `harmonyos-2in1`, so phone, tablet and
  computer installations are counted separately — the same `<system>-<device type>`
  scheme the Android and iOS shells report. Other form factors, and builds released
  before this, report plain `harmonyos`; the AppGallery update channel accepts every
  `harmonyos` device type.
- The rest of the anonymous identity now comes from the device instead of being stubbed:
  `os_version` is `HarmonyOS <M>.<S>.<F>` from `deviceInfo` (the build number B is left
  out), `arch` is the first entry of `deviceInfo.abiList`, `locale` is
  `i18n.System.getSystemLanguage()`, and `sdk` is `deviceInfo.sdkApiVersion` rather than 0.

### Document tab compatibility

PC/2in1 devices use native live document tabs. Each document owns a persistent
ArkWeb `WebviewController` and `BuilderNode`, managed by `tabs/NativeTabs.ets`.
The native tab strip in `pages/NativeWorkspace.ets` supports switching, closing,
dragging to reorder, dragging outside the strip into a new window, and dropping
onto another window's tab strip to merge. The system shows a tab preview during
drag; the document stays in its source window until the drop completes.

A detach/merge moves the existing Web component, preserving its JavaScript state,
selection and editor undo history. It does not export and reload the document.
The old NodeContainer must release the component before the destination mounts
it, and failed transfers restore the original ownership. Save and window commands
are rebound to the current window. Closing a tab or a window checks unsaved
changes; closing the main window also checks documents in its child windows.
The initial file is handed to its WebView through local IndexedDB; no file data
is put in system drag-and-drop payloads.

This uses the platform's documented
[Web component migration](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides-V5/web-component-migrate-V5)
capability. New windows are application subwindows owned by the main window,
so their native minimize/lifecycle behavior follows HarmonyOS rather than macOS.

Phone/tablet devices and hosts where native window setup is unavailable retain
the single-WebView workspace in `pages/Index.ets`. The desktop/tablet layout uses
the shared `UiWorkspaceTabStrip` with detaching disabled, including local drag
sorting, overflow handling and Alt+Shift+ArrowLeft/ArrowRight sorting. Phone
layouts keep the mobile document switcher. Local sorting reorders the existing
objects and keeps editor surfaces mounted.

Targeted validation:

```sh
node --test scripts/tests/harmony-native-tabs.test.mjs
# Connected PC/2in1 emulator; builds and installs an isolated unsigned test app.
node scripts/test-harmony-native-tabs-device.mjs
# Build the current Web payload first; also checks the real Markdown editor.
node scripts/test-harmony-native-tabs-device.mjs --editors
```

The device tests cover live Web state/selection through switch, detach and merge,
cancellation, close confirmation, and real editor dirty/undo state. They invoke
the native operations directly; manual pointer-drag, multi-monitor/mixed-DPI and
physical-device checks remain separate acceptance tests.

### Client-services integration status

This is not yet feature parity with the full planned client-services design.
Automatic checks are opt-in and currently run when the services panel mounts.
First-run consent, automatic diagnostic uploads, screenshot/system-info attachment
on Harmony and other store-specific adapters remain to be implemented. Desktop feedback uses the shared upstream desktop dialog and native collector
adapters; Android and HarmonyOS continue to use the shared mobile component.

Validation: shared bridge/channel tests and both frontend/ArkTS compilation.
Before release, use a signed installation on an AppGallery-capable real device to
verify no-update/update-available, offline, privacy refusal, store dialog dismissal,
feedback submission, and persistence across restart. Emulator-only validation
cannot prove the real market update flow. No signing or submission is implied by
these development builds.

## Build the web payload

Production signing material is outside Git at `~/cubexp.com/harmony/`:
`cubeoffice-release.p12` (alias `cubeoffice-release`), `cubeoffice-release.cer`,
`cubeoffice-release-profile.p7b`, and `store-password`. Store private reports under
`~/cubexp.com/logs/` and candidates under `~/cubexp.com/releases/<version>/`.
Never commit signing credentials.

From the repository root, install the npm workspace and build the Harmony web
payload:

```sh
npm install
npm run build:web
```

The package build is required because this application deliberately consumes
the same built entry points that are published to npm. In particular, format
workers are already bundled as JavaScript there; importing workspace source
files would copy uncompiled TypeScript workers into ArkWeb assets.

The generated files are written to
`entry/src/main/resources/rawfile/web/` and intentionally ignored by Git.

## Run in DevEco Studio

1. Install the current DevEco Studio for macOS ARM and its HarmonyOS SDK.
2. Open this `apps/harmony` directory as a project.
3. Let DevEco Studio synchronize the Hvigor/OHPM dependencies.
4. Configure automatic debug signing if the selected emulator requires it.
5. Create a phone, tablet, or 2-in-1 emulator whose API is at least 5.0.5 (17).
6. Run the `entry` module.

Web debugging is enabled for this POC so ArkWeb console and worker failures can
be inspected. Disable it before a production release.

## Known POC constraints

- The Base64 chunk bridge avoids one giant JavaScript string but still copies
  exported bytes. Profile large documents on a real device before production.
- Both hosts use the same code-split Vue build. HarmonyOS intercepts
  `https://cubeoffice.invalid/` and serves packaged `rawfile/web/` assets;
  Android serves its assets from `file:///android_asset/`.
  The reserved HarmonyOS origin is local, not a network service. Format engines
  and picker libraries load on demand. Do not run the old inline-assets script.
  Changing from the old rawfile origin changes Web storage scope: existing
  app-local recovery snapshots/settings require migration before publishing an
  upgrade. Verify module loading and file import/export on an API 17 device.
- Automatic saves are app-local recovery snapshots. The explicit Save action
  still opens the system picker and writes a user-visible copy; direct write-back
  to an original picker URI is intentionally deferred.
- The project uses the official HarmonyOS 5.0.5 sample project model. DevEco may
  offer to migrate metadata when opened with a newer SDK; review that generated
  change separately from application code.
