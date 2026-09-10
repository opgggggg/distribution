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
