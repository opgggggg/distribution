# CubeOffice for iOS / iPadOS

This iOS target reuses the mobile Web editor from `apps/harmony/web` inside a native
`WKWebView`, the same way the Android target does. The iOS host provides the system
document picker, chunked Save As, external-link handling, and the startup splash
without duplicating editor code; local IndexedDB autosave is the Web shell's own.

`apps/harmony/web/src/android/` is the shared touch workspace, so iPhone and iPad get
the same UI as Android and HarmonyOS phones. Nothing in those components branches on
platform.

## Requirements

- macOS with **Xcode 15 or newer** (the Command Line Tools alone are not enough).
- **XcodeGen**: `brew install xcodegen`.
- Node 20+, and `npm install` already run at the repository root.
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

## Not implemented yet

- **Client services.** Android's `CubeOfficeServices` — persistent client id, update feed,
  feedback form, native clipboard — has no iOS counterpart. The Settings panel's update and
  feedback entries fall back to their browser behaviour.
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

Also not yet verified: opening a document _into_ the app through the picker or a share (the
staging path in `DocumentBridge`), and **installation on a physical iPad** — so free
provisioning, Developer Mode, and the certificate-trust flow described above are all still
on paper.
