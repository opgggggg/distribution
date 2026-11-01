# CubeOffice for iOS / iPadOS

This iOS target keeps the existing CubeOffice workspace and document library. Notes
open in the Rust/UIKit editor directly; other formats continue to use the shared
mobile editors from `apps/harmony/web` while their native migrations remain open.
The iOS host supplies document pickers, file delivery, external links and the splash.

`apps/harmony/web/src/android/` is the shared touch workspace, so iPhone and iPad get
the same UI as Android and HarmonyOS phones. Nothing in those components branches on
platform.

## Rust native notes in CubeOffice

The `NativeNotesRegression` Xcode scheme runs hosted UIKit/Rust integration tests
inside this same application (no additional QA app). It covers editing after a
background flush, color/undo, camera presentation before gesture end, and live ink
during a complex board's background refinement. It also covers cold native-host
opening, exact preview-cache reuse, viewport raster reuse, Latin/CJK text, rapid
commits and 40 Pencil touch sequences across all ten brushes, color changes,
autosave, unrelated palm cancellation and missing/recycled touch callbacks.
These are controller/ABI-to-layer tests using touch doubles, not physical
Pencil-to-photon measurements. Run it with `xcodebuild test` and
an iOS device/simulator destination. For the optional private-board regression,
copy an archive to the test app's `Library/Caches/NativeCanvasRegression.cubenote`;
the test edits a temporary copy and leaves the original library untouched. Without
that file, only this private regression is explicitly skipped.

The existing CubeOffice application (`com.cubexp.office`) includes native notes. Rust owns
notes state, brushes, layout, typed input and wgpu/Metal drawing; UIKit supplies controls,
coalesced touches, the native color picker and file services. It does not create a
WKWebView for drawing. Opening/new/importing a note from the existing file list
enters the native editor; its back button saves and returns to that list, including
the new thumbnail and full archive/history. It does not create a second app or a
separate user library. Remaining feature/UI parity is tracked in the migration ledger.

Archive decoding occurs once on the file worker and transfers ownership of the
Rust session to the editor. The production canvas retains committed meshes and
GPU textures. Camera changes update a uniform and do not queue whole-board CPU
refinement. Growing ink uses GPU coverage; oil uploads only changed bristle
sections. Both erasers preserve existing geometry and alter GPU coverage.
Photo transforms reuse their decoded texture, paper is procedural, and recent
undo/redo geometry is retained under a bounded cache. Pure ink boards skip font
initialization; text loads portable fonts on the worker and uses object textures.
The CJK fallback and SIL OFL license are in `App/Resources/NotesFonts`.

The CPU reference/fallback renderer still has its bounded draft, exact PNG cache,
progressive raster tiles and geometry caches. It also supplies exports and
thumbnails. Those raster-specific assertions are intentionally separate from the
production GPU acceptance tests. Camera movement in the GPU path must present
new frames before fingers lift, retain the mesh upload count and preserve actual
GPU pixels through selection, erasure, undo/redo and archive reopening. Renderer
resources are released on memory warnings; GPU readback is reserved for QA.

From the repository root, after installing Rust 1.88.0:

```sh
rustup target add --toolchain 1.88.0 aarch64-apple-ios aarch64-apple-ios-sim
npm run test:notes:native
APP_PROFILE=cubeoffice npm run build:ios
```

The script builds a static XCFramework for iOS devices and Apple Silicon simulators,
then generates and builds the existing `AuroraPrimeOffice.xcodeproj`. The old
`build:notes:ios-native` command is an alias for the same application. Physical device
signing uses the existing bundle ID and profile. See
[the full migration ledger](../../docs/rust-rewrite.md) for acceptance and measured limits.

Native drafts are atomically saved under Application Support. The workspace writes
a valid initial archive before presenting native UI, and imports unacknowledged
native drafts into its existing IndexedDB history after a restart. Recovery is
acknowledged only after that history write succeeds; original file-provider metadata
is retained. Pointer samples never pass through the JavaScript bridge.

## Requirements

- macOS with **Xcode 15 or newer** (the Command Line Tools alone are not enough).
- **XcodeGen**: `brew install xcodegen`.
- Node 22.13+, and `npm install` already run at the repository root.
- The iOS platform component. Xcode 26 no longer ships it: `xcodebuild -showsdks` lists an
  iOS SDK either way, but `xcrun simctl list runtimes` is empty and every destination is
  ineligible until you run `xcodebuild -downloadPlatform iOS` (or Xcode → Settings →
  Components). `xcodebuild -runFirstLaunch` is also needed once, or `CoreSimulator.framework`
  is missing and `xcodebuild` cannot even load its own plug-ins.

## Build

```bash
npm run build:ios
```

That syncs the app profile, builds the mobile Web payload, generates the Xcode project,
and compiles for the simulator without signing. To work in Xcode instead:

```bash
npm run ios:open
```

The Xcode project is **generated, not committed**: a `pbxproj` is unreviewable in a diff
and merges badly, and the identity it would hardcode already lives in
`profiles/<profile>/app.json`. `project.yml` is the source of truth. Re-run
`npm run ios:project` after changing it; your scheme selection and breakpoints survive,
but anything you change in Xcode's project settings does not — change `project.yml` or
`App/Config/Base.xcconfig`.

## Installing on an iPad with a free Apple ID

No paid Apple Developer Program membership is needed to run this on your own iPad. Xcode's
free provisioning ("Personal Team") signs the build for devices registered to your Apple ID.

1. Xcode → Settings → Accounts → **+** → Apple ID, and sign in.
2. On the iPad: Settings → Privacy & Security → **Developer Mode** → on, then reboot.
3. Connect the iPad, open the project, select the **AuroraPrimeOffice** target →
   Signing & Capabilities → Team → _your name_ (Personal Team).
4. Pick the iPad as the run destination and press Run.
5. On the iPad: Settings → General → VPN & Device Management → trust the developer
   certificate. Launch the app again.

Optionally record the team id in `App/Config/Signing.xcconfig` (copy the `.sample` next
to it) so step 3 is not repeated after every project regeneration. That file is
gitignored.

### What a free Apple ID costs you

|                                              | Free Apple ID                                                                   | Paid program ($99/yr) |
| -------------------------------------------- | ------------------------------------------------------------------------------- | --------------------- |
| Signing certificate                          | **expires after 7 days** — the app stops launching until you rebuild from Xcode | 1 year                |
| Apps installed per device                    | 3                                                                               | unlimited             |
| New App IDs                                  | 10 per 7 days                                                                   | unlimited             |
| Distribution to other people                 | none (no TestFlight, no Ad Hoc)                                                 | yes                   |
| Push, App Groups, iCloud, Associated Domains | unavailable                                                                     | available             |

The shell is deliberately built to stay inside that envelope: it declares **no
entitlements at all**. Document import/export goes through `UIDocumentPickerViewController`
and `LSSupportsOpeningDocumentsInPlace`, which are `Info.plist` keys rather than
capabilities, and `UIFileSharingEnabled` exposes the app's Documents folder in the Files
app. Nothing here needs a paid account until the app is distributed to someone else.

Bundle identifiers are globally unique on Apple's side, so free provisioning can refuse
`com.cubexp.office` if that App ID is already registered. Build under your own instead:

```bash
IOS_BUNDLE_ID=com.example.office npm run ios:project
```

App Store submission additionally requires an opaque app icon; the profile artwork has an
alpha channel, which local device builds accept and the upload validator does not. That is
a paid-account concern.

## Startup payload

`scripts/sync-web.mjs` builds the shared mobile Web shell with `vite build --mode ios`
straight into `App/Resources/web/`, which the Xcode project carries as a **folder
reference** so the hashed chunk names survive into the bundle. As on Android, the payload
is code-split rather than inlined: `index.html` is a small shell that loads a ~1 MB entry
chunk, each format engine is a separate chunk loaded when a document of that format opens,
and the icon and SmartArt libraries load only when a picker inside the editor asks for
them.

`WebAssetSchemeHandler` serves that directory over `aurora-app://localhost/`. It is not
optional plumbing: WebKit gives every `file://` document an opaque origin, so ES module
chunks are rejected as cross-origin and `localStorage` / IndexedDB — the workspace's
autosave — are unavailable. Android gets away with `file://` only because
`setAllowFileAccessFromFileURLs` has no WebKit equivalent; HarmonyOS solves it the same
way this does, by intercepting a reserved origin.

While the entry chunk loads, `StartupSplashView` covers the `WKWebView` with the app mark
and a spinner. The Web shell removes it by calling `auroraHarmonyHost.appReady()` right
after Vue mounts; a failed navigation and a 20 s timeout are the fallbacks, so the user is
never stuck behind it.

## The native bridge

`App/Resources/bridge.js` defines `window.auroraHarmonyHost` and is injected at document
start. The contract was written against Android's `@JavascriptInterface`, where every call
returns synchronously, and **WKWebView has no synchronous native call** — `postMessage` is
one-way and `WKScriptMessageHandlerWithReply` returns a promise. So the shim answers the
synchronous parts itself and the native side only pushes state in or receives work orders:

- **Opening a document.** `WorkspaceViewController` copies the incoming file (a
  security-scoped URL is unreadable once the scene callback returns), then
  `DocumentBridge` stages the bytes into the page in 192 KB chunks _before_ announcing the
  document through `consumePendingIntent()`. `readOpenDocumentChunk` then slices a
  `Uint8Array` that is already in JavaScript, which is how it can return on the spot.
  The trade-off is peak memory: the staged copy is held alongside the `File` the Web shell
  builds from it. Streaming it instead — a synchronous `XMLHttpRequest` against the scheme
  handler, which does not deadlock because the handler runs in the UI process while the
  page blocks in the content process — is the optimisation to make once it can be measured
  on a device.
- **Save As.** `beginSave` mints the session id in JavaScript and `appendSaveChunk` reports
  success optimistically; WKWebView delivers messages to one handler in order, so the
  chunks reach the host in sequence. A failed write is remembered natively and surfaces
  when `finishSave` settles, which the caller already awaits. `finishSave` resolves when
  the export picker opens, matching the point at which the Android host returns.
- **`exitApp` is deliberately absent.** iOS apps must not terminate themselves, and the
  privacy gate already handles a container that cannot close itself by keeping the notice
  up.
- **`setPresentationLandscape`** is best-effort. iPadOS ignores an orientation request
  while the app is resizable (`UIRequiresFullScreen` is `false` so multitasking works), so
  a slide show on iPad stays in whichever orientation the user is holding.

`cubeoffice://assistant/...` deep links are parsed by `AssistantCommand`, which accepts the
same spellings as the Android host so a shortcut authored for one platform works on both.

## Siri, Shortcuts, and Spotlight

`AssistantAppIntents.swift` declares four App Intents — new document (by format), open the
file picker, recent documents, and switch reading/editing mode — plus an
`AppShortcutsProvider` that gives five of them Siri phrases. Each produces the same
`AssistantCommand` the `cubeoffice://assistant` URL scheme produces, so both routes
normalise in one place and reach the Web shell by one path; `AssistantCommandCenter` holds
a command until the workspace exists, because an intent can launch the app and run before
the scene has built one.

None of this needs a paid account: App Intents is a framework, not an entitlement.

It requires iOS 16, and the shell deploys to 15, so the whole file is behind
`@available(iOS 16.0, *)` and simply does not exist on iOS 15. Raise
`IPHONEOS_DEPLOYMENT_TARGET` if those devices stop mattering and the annotations can go.

**What this does not buy you.** Third-party assistants — ChatGPT, Claude — cannot invoke
another app's intents on iOS; there is no public API for it. What they can do is be one
step in a shortcut the _user_ builds, which is exactly what these intents make possible.

Siri here means "trigger a declared action by phrase", not "operate the editor". Going
further means Apple's **assistant schemas**, which do cover this app's domain — the iOS
26.5 SDK declares `WordProcessorIntent`, `SpreadsheetIntent`, `PresentationIntent`, and
`ReaderIntent`, with roughly a dozen operations each (create/open a document or page, add a
text box or image, update or delete a sheet or slide, start playback). Annotating an intent
`@AssistantIntent(schema: .wordProcessor.create)` opts into one, and the compiler enforces
the parameter shape Apple defines.

That vocabulary is closed, though, and it is the difference between this and the desktop
harness. `ArtifactControlHost` in the desktop app is an open protocol the app defines, so a
CLI agent can ask for any operation the editor supports. The schemas are a fixed table with
no fine-grained editing — no "replace this paragraph", no "apply this style" — and, notably,
**no way to read document content back**: `Reader*` manipulates pages, it does not extract
text. An assistant therefore cannot reason over the document, only act on it. Implementing
the schemas would also need new commands on the Web side; the shared `assistant-command`
vocabulary is currently five verbs wide.

## Client services

`ClientServices.swift` is the iOS half of the shared settings panel: a persistent random
client id, native clipboard copy, the opt-in daily statistics ping, and the feedback form
with its server-issued reference number. The identity is injected at document start as
`window.__auroraIosClientInfo`, which is how `bridge.js` answers the shell's synchronous
`getInfo()`; a request is posted to the host and settled back through
`__auroraIosHost.settleServiceRequest`, and the caller polls `takeResult` exactly as it
does on Android and HarmonyOS. Fixed endpoints only, `POST` to
`https://cubexp.com/api/v1/update-checks` and `/feedback`; nothing here reports a hardware
identifier, and no document, screenshot, or automatic log is ever uploaded.

The client id lives in Application Support with `isExcludedFromBackup`, mirroring
Android's no-backup directory: it survives an app update, is not carried into a restored
or migrated installation, and deleting the app creates a new one.

The reported platform carries the device type — `ios-iphone` or `ios-ipad` — so iPhone and
iPad installations are counted separately, the same `<system>-<device type>` scheme the
Android and HarmonyOS shells report. Mac is not among them: `project.yml` turns off
Catalyst and "Designed for iPad". `os_version` is `iOS` plus
`UIDevice.current.systemVersion` (no build number), and `arch` comes from the compiled
target, so a simulator build reports `x86_64` on an Intel Mac.

`node apps/ios/tests/services.cjs` drives the shim against a fake message handler: the
identity round-trip, one request per operation at a time, single delivery of a settled
result, and the update check moving `lastCheck` only when it succeeded.

**There is no in-app update check.** The App Store exposes no API for one, so the
`updates` operation only records the check and the panel tells the user to look in the App
Store; the update channel is `appstore`. A real version comparison (Apple's
`itunes.apple.com/lookup`, which needs no account) is worth adding once the app is
actually published — until then it could only report "not found".

## Not implemented yet

- **Home-screen quick actions.** Android ships `shortcuts.xml`; the equivalent
  `UIApplicationShortcutItems` are not declared.
- **Multi-window.** `UIApplicationSupportsMultipleScenes` is `false`, so iPadOS offers no
  second window.
- **`public.data` in `CFBundleDocumentTypes`** mirrors Android's `application/octet-stream`
  catch-all, which puts the app in "Open with" for every file. It is ranked `Alternate` so
  it never claims a format it does not own; drop that second entry if it is still too noisy.

## Verification status

`npm run build:ios` succeeds end to end on a clean checkout: profile sync → XcodeGen →
`vite build --mode ios` (243 chunks, 82 MB, passing `sync-web.mjs`'s non-inlined check) →
`xcodebuild`. The Swift compiles with no errors or warnings.

The built bundle was inspected: `web/` keeps its `assets/` subdirectory and hashed chunk
names, `bridge.js` sits at the bundle root, every `Info.plist` build setting expands
(`CubeOffice 文档`, `com.cubexp.office`, `1.4.2`/`1004002`, the `cubeoffice` URL scheme,
`AuroraPrimeOffice.SceneDelegate`), both iPhone and iPad icons come out of the single
1024px profile artwork, and **the app carries no entitlements** — the free-account
premise holds.

It also runs. On an iPad Pro 11-inch simulator the following were exercised end to end:

- **Launch.** The splash gives way to the Web shell — which means `WebAssetSchemeHandler`
  served `index.html`, ES module chunks loaded over `aurora-app://localhost/` (the thing
  `file://` cannot do), `bridge.js` was injected at document start, and `appReady()`
  reached the host.
- **Touch workspace.** iPad gets the shared mobile workspace, not the desktop layout, so
  `isIosHost()` → `isNativeMobileHost()` behaves as intended on a tablet.
- **Deep links.** `cubeoffice://assistant/new-docx` and `.../new-xlsx` each create the right
  document: scene → `AssistantCommand` → `enqueueAssistantCommand` → the Web shell's
  `parseNativeAssistantCommand` accepting `source: "ios"`. The activity panel reports
  `iOS 文件桥接已就绪` and `URL Scheme · Assistant action`.
- **Save As.** "另存" opens the system export picker with the document's name, and saving
  writes a structurally valid `.xlsx` (OOXML package, correct part layout) to _On My iPad_ —
  so `beginSave` / `appendSaveChunk` / `finishSave` reassemble the base64 chunks byte for
  byte, and the export temporaries are cleaned up afterwards. The app's own folder shows up
  in Files, confirming `UIFileSharingEnabled`.
- **No entitlements.** The system log records the installed app as having none.

**App Intents are registered but not proven to run.** The build extracts all four into
`Metadata.appintents`, and the Shortcuts app lists the app with five actions under their
correct titles and icons — which a malformed provider would not manage. But running one
from Shortcuts in the simulator fails with "Unable to run App Shortcut", and the system log
shows no launch attempt at all, so the failure is upstream of `perform()`. App Shortcut
execution is known to be unreliable in the Simulator; that is the likely cause, but it
cannot be separated from a declaration the system rejects at run time without trying it on
a device. Treat Siri and Shortcuts invocation as unverified until then.

It installs and runs on a physical iPad. An iPad mini (iPad14,1) on iOS 27.0 was built for,
signed under a free personal team, installed with `xcrun devicectl device install app`, and
launched; the process stays alive. Worth knowing: the Mac's Xcode was 26.6 with the iOS 26.5
SDK, a major version behind the device, and `devicectl` installed anyway — it needs no debug
symbols, so it sidesteps Xcode's version check and saved an Xcode upgrade.

Two things that flow from free provisioning and bit us:

- The certificate expires **7 days** after it is issued. The app then refuses to launch
  until it is rebuilt and reinstalled.
- Free provisioning registers the App ID with Apple for real. Building under the profile's
  own `com.cubexp.office` put the production identifier on a personal team, and a free team
  is not visible in the developer portal, so it cannot be released from there. Use a
  throwaway identifier for personal-team builds —
  `IOS_BUNDLE_ID=com.cubexp.office.dev npm run ios:project` — and keep the real one for the
  organisation's team.

**Client services have not been run natively.** `ClientServices.swift` type-checks
against the iOS SDK and the JavaScript shim passes `apps/ios/tests/services.cjs`, but
nothing has been exercised through a real `WKWebView`: neither the statistics ping nor a
feedback submission has left a simulator, and no test feedback was sent to production. The
settings panel, the clipboard copy, the backup-excluded client id, and both requests still
need a pass on a device or simulator.

Still not verified: opening a document _into_ the app through the picker or a share (the
staging path in `DocumentBridge`), and everything on the device beyond launching — document
open and save were exercised only in the simulator. Siri and Shortcuts invocation remains
open, and a device is the only place it can be settled.: record the physical iPad install)

The native notes chrome follows the existing iPad design. Rust supplies the ten pen
glyphs plus highlighter/eraser/lasso, tray/topbar geometry, page overlay and action
cards. The UIKit binding supplies OS widgets, direct coalesced input, file services,
camera/photo library and the native color picker. The existing workspace owns the
file gallery; notes provide autosave/history, selection/erasing/tape/background tools and worker-rendered PNG/
raster PDF exports. Full feature and 1:1 UI acceptance remain open in
`docs/rust-rewrite.md`; integration uses the existing App identity and file list. The user confirmed
smooth drawing/zoom on iPad mini 6. A subsequent four-stroke, roughly 25-second
device sample recorded input p95 0.033 ms, live ink raster p95 19.872 ms and no
display-link interval above 33 ms. This is a limited CPU/UI timing sample, not
hardware Pencil-to-photon or dense-board acceptance. Local QA timing aggregates
are available at `Library/Caches/NativeNotesMetrics.json` in the app container.
Selection color/opacity, pigment-preserving duplication, attached shapes/arrows and
the original alignment/equal-spacing/grid snapping now have native implementations.

Native notes camera/selection QA (2026-10-23): the mini 6 hosted regression now
has 19 cases: the latest CPU-path run passed 18 and failed the whole-stroke eraser's
250 ms publication budget. Selected content restores the original bottom capsule (color, arrangement, saved
region, duplicate/delete and conditional text/shape actions), and an
isolated cropped layer follows manipulation before pointer-up; an underlying
replacement patch removes the original pixels without erasing other objects.
Camera updates use bounded world-aligned tiles, progressive rows and at most four
workers sharing immutable compiled paths/fonts/image trees. Local object edits retain
unaffected tiles; detached atomic tokens interrupt stale camera work between
objects and brush passes. The dense-board delete regression now measures command
latency and actual pixel publication instead of allowing a whole-scene redraw.
Timings are automated UIKit/Rust measurements using touch doubles, not hardware
Pencil latency. See `docs/rust-rewrite.md` for cache limits, visual
checks and measurement scope. Hosted tests keep only their process awake; normal
Release delivery retains the app's idle policy and existing bundle/data identity.
Live oil retains all 29 pigment passes but updates only new ribbon sections and
dirty tiles. An 8193-sample mini 6 hosted stroke measured late worker-frame p95
19.27 ms, max input callback 0.102 ms and max snapshot capture 0.816 ms. The test
also verifies final commit, undo and resumed drawing. Incremental pixel tests
cover overlapping paths, pressure, trims and tile seams; interchange geometry
remains covered by the native/WASM brush fixtures. These timings use generated
Pencil samples and do not measure hardware-to-display latency.
The expanded all-tool audit covers 10 pens, highlighter and both eraser modes.
Direct native paths and retained dirty coverage reduce long brush/watercolor
updates to 14.5/8.0 ms on mini 6, but whole-stroke erase still publishes after
363 ms p95 (path erase 181 ms p95, cold max 437 ms). CPU recomposition remains an
open performance issue; wgpu is the proposed next rendering layer and has not
been integrated. Full timings, scope and the failing acceptance budget are in
`docs/rust-rewrite.md`.

The iPad canvas migration adds `NativeGpuCanvas.swift` and the Rust `gpu-renderer`
feature (wgpu/Metal). Build the xcframework with
`node scripts/build-notes-native-ios.mjs`, then regenerate the Xcode project.
The normal CubeOffice app uses the GPU path; there is no separate delivery app
or file-format migration. Raster exports/thumbnails retain the existing renderer.
`NativeGpuCanvasTests` verifies the production GPU view; the earlier
`NativeCanvasTests` uses a Debug-only CPU reference initializer for assertions
about the old raster layers. The earlier CPU eraser failure remains a historical
baseline, not an assertion about GPU performance. See `docs/rust-rewrite.md` for
the implementation scope and final physical-device measurements.
