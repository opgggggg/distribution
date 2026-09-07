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

## Build the web payload

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
- All format assets are intentionally inlined so ArkWeb can load them without
  local-origin CORS failures. This produces a large HAP; split loading needs a
  native asset protocol or an equivalent verified ArkWeb-safe transport.
  This applies to HarmonyOS only: the Android APK builds the same sources with
  `vite build --mode android`, keeps the code-split chunks, and loads them from
  `file:///android_asset/` (see `apps/android/README.md`).
- Automatic saves are app-local recovery snapshots. The explicit Save action
  still opens the system picker and writes a user-visible copy; direct write-back
  to an original picker URI is intentionally deferred.
- The project uses the official HarmonyOS 5.0.5 sample project model. DevEco may
  offer to migrate metadata when opened with a newer SDK; review that generated
  change separately from application code.
