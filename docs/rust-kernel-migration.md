# CubeOffice Rust kernel integration

This tracks the downstream migration from the pinned TypeScript-era ALS Office
checkout to its shared Rust kernels. Vue, layout, OS file access and pixel rendering
remain host responsibilities. A WASM kernel still runs inside a WebView; it is not
a native drawing view.

## Current acceptance batch

| ID    | Requirement                                                               | Acceptance                                                                                                                                                |
| ----- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RK-01 | Update the upstream pin and npm workspaces/peer ranges                    | Accepted: retained packages and distribution adapters build against `5eef435900d5da72185c2e53c7f82c0f21306a2c` (2026-10-31 refresh below)                 |
| RK-02 | Ship the matching WASM assets on Web, desktop, iOS, Android and HarmonyOS | Accepted: Chromium/WebKit runtime checks and all four production payloads verify the 12 pinned binaries                                                   |
| RK-03 | Preserve platform storage and OS file behavior                            | Accepted for integration: existing origins retained, Android Java compilation and browser file workflows pass; native device execution remains unverified |
| RK-04 | Inventory downstream kernel bypasses and define owned-format boundaries   | Accepted: matrix below records owned formats, retained host work and the separate native handwriting track                                                |

Closure: this upstream-integration batch is complete. The remaining owned-format
and native-view migrations below stay open; this does not claim a fully native app.

The pin ships npm packages at `0.88.0` while its migration documentation describes
the 6.x kernel transition. Build inputs require Node 22.13+ and the explicit pinned
font asset preparation documented in the repository README. Upstream sources remain
unmodified.

## Format ownership and migration boundary

| Format                 | Current owner                                                                                           | Rust migration                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DOCX                   | Upstream Word controller and Vue surface                                                                | Use upstream compact WASM authority; keep layout in TS                                                                                                                                                                                                                                                                            |
| XLSX                   | Upstream workbook/session and Vue surface                                                               | Use upstream WASM workbook/formula authority                                                                                                                                                                                                                                                                                      |
| PPTX                   | Upstream editor/session and Vue surface                                                                 | Use upstream WASM model/transactions/save                                                                                                                                                                                                                                                                                         |
| VSDX / draw.io         | Upstream session and Vue surface                                                                        | Use upstream WASM document/ShapeSheet/import paths                                                                                                                                                                                                                                                                                |
| PDF                    | Upstream viewer/processing plus mobile page/signature tools                                             | Default processing uses Rust; mobile page rotate/delete/reorder, PNG signature placement and PNG/JPEG-to-PDF now use the distribution Rust authority. PDF.js viewing, mobile wrapper history and native PDF views remain open                                                                                                     |
| Markdown               | Upstream editor, including the mobile wrapper                                                           | Inherit WASM session; no separate mobile string-edit authority                                                                                                                                                                                                                                                                    |
| HTML                   | Upstream registry/editor                                                                                | Inherit WASM session when registered                                                                                                                                                                                                                                                                                              |
| Image                  | Upstream desktop plugin; mobile raster tools own Blob revisions                                         | Mobile rotate/crop/resize execute Rust image commands; TIFF pages now decode in Rust, retaining original multi-page source bytes. Other pixel decoding/export, text/ink and persistent command/history migration remain open                                                                                                      |
| Legacy DOC/XLS/PPT/RTF | Upstream conversion registry                                                                            | Inherit native/WASM byte converters                                                                                                                                                                                                                                                                                               |
| CUBENOTE / XOPP        | `crates/notes-core` authority; `packages/notes` shipping host                                           | Rust model/history/codecs are used by default sessions; all 10 built-in brushes and the native iOS canvas in the existing CubeOffice app are integrated. Complete native interactions/platform rollout remain open                                                                                                                |
| EPUB                   | `crates/formats-core`, hosted by `packages/epub`                                                        | Rust ZIP/OPF/navigation/fonts/search now feed the existing DOM reader; original bytes export unchanged; native platform views remain open                                                                                                                                                                                         |
| OFD                    | `crates/formats-core::ofd` package authority, existing `packages/ofd` renderer and native trust sidecar | Rust owns archive/metadata/edits/saves, signature structure/reference checking, writers, full SVG drawing/font outlines/gradients, BMP/TIFF decoding, structural validation and final device stroke widths. Security/ICC/XSD and pixel export remain explicit host bindings; native platform views and PDF conversion remain open |
| Plain text / source    | `crates/formats-core`, hosted by `packages/text`                                                        | Rust Rope/encoding/range decoding/grouped history/selection/detached saves now feed CodeMirror; syntax/IME/display adapters remain host duties during native migration                                                                                                                                                            |

## Platform boundary

- Web, macOS/Windows/Linux desktop, Android, iOS and HarmonyOS currently share
  Vue/WebView document surfaces. They can consume the same Rust WASM kernels.
- Upstream `office-ffi` ABI v1 currently opens DOCX bytes only. Its JNI/N-API/Swift
  adapters are integration contracts, not pre-existing nine-format native views.
- File permissions, share sheets, cameras, IME, font discovery and persistence
  acknowledgment remain native host duties.

## Native handwriting track

Handwriting is the first candidate for removing WebView from the interaction path.
Use a native canvas subview while retaining the surrounding document shell initially:

1. Implemented core: a distribution-owned Rust notes core owns page/element identity, brush settings,
   transactions, 200-step bounded history, save snapshots and `.cubenote` bytes.
2. iOS UIKit receives actual/coalesced/predicted Pencil touches and owns palm/gesture
   arbitration; the live stroke renderer uses a native drawing surface. Predictions
   are temporary display data and must never enter saved strokes/history.
3. Per-move input and live ink must not round-trip through JavaScript or JSON. Only
   tool/document/page state and committed transactions cross the shell boundary.
4. Preserve custom watercolor/oil/Chinese brush, eraser masks, masking tape,
   background transforms, sampled colors, infinite pan/zoom, selection and exports.
   PencilKit cannot be assumed to reproduce the existing custom brush rendering.
5. Android/HarmonyOS use the same Rust model with their own native input/render
   adapters; desktop/Web can retain the current Canvas view during transition.
6. Verify roundtrip/parity against current synthetic fixtures, save-during-input,
   cancellation and undo/redo before switching defaults. Measure input-to-visible-ink
   and frame times on iPad mini 6; browser heartbeat measurements are not device ink latency.

The Rust core is integrated into existing surfaces. The selected existing
`com.cubexp.office` CubeOffice app now runs native wgpu/Metal notes, typed input,
Rust-owned tool/layout state and background saves without a drawing WebView.
The separate QA packaging has been retired. Retained ink paths are validated
against committed rendering. Complete feature/UI acceptance, portable plugins,
accessibility and other native platform adapters remain open in
[the full rewrite ledger](rust-rewrite.md).

## Acceptance evidence and limits

- `npm run build:packages`: retained upstream packages plus OFD, text, EPUB and
  notes build successfully. The owned-format regression batch passes after adapting
  the desktop lazy-text hook to upstream's new kernel options argument.
- Upstream DOCX, PPTX, PDF, Markdown, HTML and image default-kernel checks pass;
  XLSX's 111 WASM oracle cases and VSDX's 130 action steps cover edit/history/save parity.
- `scripts/test-rust-kernels.cjs` on the shared mobile dev server checks Chromium
  and WebKit: fetch/compile all 12 real assets, actual WASM Markdown/PDF processing,
  and Rust image rotate/crop/resize. It rejects observed kernel fallback warnings.
- Desktop production build and startup pass. iOS, Android and HarmonyOS web payload
  builds/type checks pass. `scripts/check-office-kernel-assets.mjs` verifies SHA-256
  equality with the pinned upstream binaries, including the desktop payload.
- Android `:app:compileDebugJavaWithJavac` passes. Its local asset endpoint serves
  only packaged WASM with the required MIME/CORS headers; its file origin and
  IndexedDB namespace remain unchanged. iOS/HarmonyOS already serve WASM MIME types.
- `apps/android/tests/file-workspace.cjs` passes real shared-host workflows:
  concurrent save/edit, failure/cancel/recovery, image conversion/undo, TIFF pages,
  PDF form/annotation/signature/rotation export and responsive file actions.
  PDF annotation commands now capture plain rectangles before asynchronous work;
  passing Vue proxies to the new detached-command capture previously lost the edit.
- Physical iPad Pencil latency and Android/HarmonyOS device execution are not
  verified in this batch. Native app signing/installers and exhaustive upstream
  release/CI gates were not run. That upstream-integration batch installed or
  published no production app; later native notes QA runs are tracked separately.

The notes save worker now runs Rust archive/history encoding off the main thread and
defers full-board previews during drawing. It preserves existing file/history behavior;
it does not implement the native drawing view. The broad
legacy notes browser suite still has an unrelated 700px sidebar-separator expectation;
targeted save/input/history checks are the acceptance evidence for that change.

## Upstream refresh — 2026-10-31

Completed refresh: `als-office` moved from
`4e0b07d5d0b82b648c7d5bc9c99966f40ad78590` to upstream `master`
`5eef435900d5da72185c2e53c7f82c0f21306a2c`. The submodule was clean and detached
with no local commits to replay; updating the pin therefore requires no downstream
commit rebase or conflict resolution. The previous pin is retained in the local
`refs/codex/pin-before-update-20261031` recovery ref. Existing uncommitted CubeOffice
source changes remain in the outer working tree.

| ID    | Required integration acceptance                                     | State                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UR-01 | Latest upstream pin and clean source checkout                       | Accepted: clean submodule at upstream master `5eef435900d5da72185c2e53c7f82c0f21306a2c`; prior pin retained locally                                                       |
| UR-02 | Upstream pnpm build boundary and root npm dependency lock           | Implemented: run the upstream script from its own cwd/package-manager boundary; renderer uses pnpm while owned kernels retain npm. Offline lock/install refresh completed |
| UR-03 | Rust path dependencies and existing owned-format contracts          | Accepted: 38 native tests, 184 OFD, 21 PDF, 45 text/EPUB tests; Chromium/WebKit owned-format and upstream-kernel checks pass                                              |
| UR-04 | Production mobile/desktop resource bundles use matching new kernels | Accepted: all upstream/owned packages, four production payloads and normal signed iOS Release build; all external/embedded module hashes and notices pass                 |

Upstream now declares `pnpm@10.30.3`; CubeOffice retains its independent npm root
workspace and local installation. `scripts/run-upstream.mjs` runs upstream scripts
from `als-office`, so Corepack resolves the correct package-manager declaration.
Do not invoke pnpm from the distribution root or rewrite upstream package files to
work around that boundary. The new `office-layout`/`office-render` crates are
available at the pin; installing the new pin alone does not implement the remaining
CubeOffice native UI/layout migration. No release or Git push is part of this refresh.

A pnpm forwarding difference was caught by final desktop artifact validation:
`pnpm run build -- --config ...` forwards the separator to Vite, which skipped the
CubeOffice config. The renderer runner now uses `pnpm run build --config ...`;
the actual nested native-branding integration regression rejects reintroducing
the extra separator and verifies the explicit profile config path. The rebuilt
desktop payload includes the expected CubeOffice assets and license notices.

Final evidence is in `.cache/notes-qa/upstream-*`: all upstream packages and owned
packages build; 14 build/profile tests and nine native notes host/library tests
pass, preserving the previously fixed infinite-canvas entry. Chromium and WebKit
compile all 12 pinned upstream WASM files and exercise Rust Markdown/PDF and image
rotate/crop/resize. The independent owned-format browser tests also pass, including
signature/color-provider recovery, raster codecs and multi-page previews.
Four production payloads contain the matching 14 external WASM files, exact
embedded synchronous module and third-party notices. The normal CubeOffice iOS
Release builds and codesign verifies; this refresh does not install it or publish
binaries. The temporary browser test server was stopped.

Closure: UR-01–04 are accepted for upstream integration. Full upstream MR/release
CI gates and cross-platform native installers were not run: upstream source is
unmodified and no upstream MR, Git push or release was requested. Existing
uncommitted source modifications outside the integration files were compared
against the pre-update patch and retained byte-for-byte. The separate whole-app
native rewrite requirements remain open in `rust-rewrite.md`.
