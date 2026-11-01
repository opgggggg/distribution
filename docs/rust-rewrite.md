# CubeOffice Rust rewrite

User-confirmed scope: the entire CubeOffice application, every format and every
platform UI. Rust owns application behavior and UI state/layout, with thin OS SDK bindings
where platform APIs require Swift/Objective-C, Java/JNI or ArkTS/N-API. Native
handwriting must not send pointer moves through WebView. Existing document and
brush features remain acceptance requirements; a partial implementation cannot
silently replace the shipped editor.

## Mandatory migration ledger

| ID    | Owner / requirement            | State and acceptance                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RN-01 | Notes model and validation     | Implemented: all current element kinds and extension metadata; native/WASM roundtrips and 24 malformed-model parity cases pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| RN-02 | Notes transactions and history | Implemented: 200-step/32 MiB bounded history, immutable save snapshots, readonly, atomic errors and stale save/revision protection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| RN-03 | Notes file codecs              | Implemented: `.cubenote` v1/history and XOPP import/export; TS/native/WASM cross-language roundtrips pass                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| RN-04 | Notes built-in brush geometry  | Implemented: all 10 current/legacy brushes, pressure, seeded pigment and clip passes; 174 native/WASM parity fixtures. Native extensions still need a portable plugin ABI                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| RN-05 | Native notes surface           | In progress across platforms: iOS now uses the Rust wgpu/Metal retained canvas with the original UIKit chrome and unchanged file/history authority; CPU rendering remains for exports/reference/fallback. Typed coalesced input, velocity pressure, camera/tools/save and hosted device QA are implemented. Native selection/move/four-corner resize, both erasers, tape transforms/cutouts, photo import/background controls, color sampling, context cards, quarter turns and raster PNG/PDF exports now have implementations and regression coverage; full original-feature/UI and device acceptance remain open |
| RN-06 | App integration                | Rust authority is used by Vue and headless sessions with visible loader errors. iOS now embeds native notes in the existing workspace/library and bundle ID, per the user's explicit request; other formats/platforms remain pending                                                                                                                                                                                                                                                                                                                                                                                |
| RF-01 | EPUB                           | Accepted portable core: Rust archive/metadata/navigation/search and IDPF/Adobe fonts now feed the unchanged reader; native/WASM/browser acceptance is recorded below. Native UI replacement remains under RP-01                                                                                                                                                                                                                                                                                                                                                                                                     |
| RF-02 | OFD                            | In progress: Rust package/metadata/edit/save, signature structure/reference checking, XML/ZIP writers, complete SVG drawing/font/gradient authority, BMP/TIFF decoding, structural validation and device stroke widths feed the unchanged APIs. Crypto/trust/ICC/XSD and pixel-output bindings remain explicit. Native format views and PDF conversion remain open                                                                                                                                                                                                                                                  |
| RF-03 | Text                           | Implementation: Rust Rope buffer, grouped history/selection, BOM/legacy encoding, bounded large-file decoding and detached save acknowledgements now feed the existing CodeMirror surface; native platform IME/view adapters remain open                                                                                                                                                                                                                                                                                                                                                                            |
| RF-04 | Upstream formats               | Existing Rust kernels plus distribution-owned mobile PDF mutations and raster-PDF serialization are integrated. Native Office layout/viewing, PDF/image wrapper history and remaining image text/ink commands stay open                                                                                                                                                                                                                                                                                                                                                                                             |
| RP-01 | Native platform shells         | In progress: the existing iOS workspace hosts native notes without a separate app. Remaining iOS native shell/format work, desktop/Android/HarmonyOS native views, file/library UI and device acceptance stay open                                                                                                                                                                                                                                                                                                                                                                                                  |

Accepted core: RN-01–04 and the existing-host half of RN-06. Native C ABI includes
independent documents, detached save/render snapshots and direct typed input. Raster
strings share allocations across history; bridge projections pool pages/photos instead
of retransmitting embedded images. History accounting caches immutable page weights.

Native integration: `npm run build:ios` (also `npm run build:notes:ios-native`)
builds the existing `com.cubexp.office` CubeOffice application. The user explicitly
requested integration in CubeOffice instead of a separate QA app and selected
the existing CubeOffice 文档 1.8.1 installation. Notes use a UIKit adapter around
Rust-owned tools, layout, documents and pixels, with no WKWebView in the drawing
path. Other formats retain their existing editors. Initial native tests ran on the
iPad mini (A17 Pro) simulator: brush drawing, native color picker, drawing after
color changes, undo/redo and background save. The saved archive contains both
strokes/colors and both history steps. This integration does not establish complete
native feature/UI parity or the complete rewrite. The separate QA packaging was
retired; upgrading uses the existing app identity and preserves its library.

UI migration requirement: reproduce the existing iPad interface 1:1; no redesign.
`native_ui.rs` ports the original ten built-in pen silhouettes plus highlighter,
eraser and lasso, per-pen presets, the floating scrollable tray and original topbar
SVG paths. Tray geometry is checked against the current Vue UI in WebKit at 375,
744 and 1024 logical pixels. The iOS QA includes:

- Original brush-settings card and Rust-rendered live previews; iPad custom colors
  use `UIColorPickerViewController`. Common and deduplicated visible canvas colors
  appear in the preceding color card.
- A two-column page thumbnail overlay below the topbar trigger, bookmark filtering,
  saved regions, page creation and readonly page navigation.
- Sweep/stroke erasing, highlighter, lasso selection/move/four-corner resize,
  duplicate/delete, text and line/rectangle/ellipse creation. Editing previews commit
  one history step per gesture; masking and duplication preserve seeded pigment.
  Selected content accepts color/opacity changes with undo; choosing a color alone
  retains each stroke's opacity. Resizing retains stroke/point widths, as in the
  original editor. New shapes enter selection mode and can create an attached shape;
  arrows follow moved/resized endpoints across layers, including hidden layers.
- Original object-edge/center alignment, equal-spacing hints, optional 20pt grid
  snapping and finite-page move constraints. Guides are transient view state and a
  cancelled drag does not enter history. Thirty-two fixtures generated directly
  from the existing TypeScript manipulation helpers check snapping parity.
- Layer selection/visibility/addition; tape center coordinates compatible with the
  existing format, drag/rotation/end resizing and cutouts on new ink.
- Native camera/photo-library imports, content/background insertion, background
  translation/scale/angle/opacity controls, canvas/background color sampling and
  90-degree canvas rotation. PNG and multipage PDF exports render Rust frames on a
  serial worker. PDF currently embeds raster pages rather than searchable vectors.
- A native notes-only file gallery with full-bleed thumbnails, search, new/import,
  a long-press action menu and recoverable Recently Deleted storage. Autosave
  retains the interoperable archive/history; explicit exports use OS file panels.

The infinite board starts at one world point per screen point and retains that
scale across viewport resizing. These are functional migration steps,
**not completed UI parity or the complete CubeOffice rewrite**. Remaining notes
acceptance includes full source-layout screenshots for every card/overlay,
connector endpoint dragging/relinking, rich text/image selection
controls, the original background/tape multitouch and sampling-loupe interactions,
portable brush plugins, dark/Dynamic Type/VoiceOver audits and extended physical Pencil
input/palm/dense-board performance. The iOS integration retains the existing mixed-format
file library; replacing that whole shell with native Rust UI remains open, as do the
other native platform shells and format rows.
Do not mark RN-05/RP-01 complete until that feature/UI/device acceptance is complete.
The user's same-app requirement authorizes iOS integration; it does not accept
the still-open feature/UI/format/platform rows.

The existing library stages a note once into a private native draft. Pointer batches
and frame rendering stay native. Returning commits the complete archive/history and
thumbnail to the same library item. Native draft metadata remains pending until the
IndexedDB write is acknowledged; on restart, pending native archives are recovered
before opening notes. Background saving waits for both the archive and its recovery
metadata. A discarded frame whose base cache already advanced forces a new base
publication, preventing saved shapes/edits from remaining invisible after menu/layout
transitions. Final feature/UI/device acceptance is still required.

The integrated `com.cubexp.office` build was installed over the selected iPad mini 6
CubeOffice 文档 app on 2026-10-22. Its existing WebKit library was backed up first;
three notes from the earlier QA app were imported and their recovery acknowledgements
were verified (`pending: false`). The user reported that new boards open but older
library boards do not, with the shared store reporting an automatic-save transaction
failure. All four pre-upgrade notebook archives pass native open/save,
retain identical current documents, and retain their undo/redo step counts. The entry
path now owns both current and original-file Blob bytes before library writes, leaves existing records
untouched until successful native completion, and removes reactive source references
before persistence. Regression tests cover these lifecycle conditions and multi-chunk
binary transfer (nine iOS bridge/library tests pass). The corrected device and
simulator builds pass; the correction was installed and launched successfully in
the same iPad app. The next physical-device attempt reached the renderer and reported
`Rendered scene exceeds 64 MiB.` Committed raster rendering now paints elements in
document order without serializing the entire board to one SVG, and culls offscreen
ink before generating geometry. Individual-stroke, surface and embedded-image limits
remain enforced. The four backed-up user archives render all eight current pages
successfully with unchanged undo/redo counts. The slowest page took about 2.3 seconds
for a 600-pixel-wide first raster on this Mac; this is not an iPad latency measurement.
Device/simulator builds and Android/HarmonyOS cross-checks pass after this change.
The renderer correction was installed and launched in the same iPad app.
The user confirmed that the older board now opens, but reported severe two-finger
pan/zoom lag. A fresh report from the integrated iPad app records six base redraws
taking approximately 1.7–3.2 seconds; 841 display-link intervals remain below 20 ms,
and this sample contains no pen input. Thus the visible content lags despite a
responsive main run loop. The next adapter change projects the last published raster
through Core Animation as the Rust viewport changes and defers expensive refinement
until camera gestures end. Published frames carry their source viewport; stale
generations cannot replace a newer camera presentation. Stroke SVG now shares identical
clip definitions across brush passes. World-to-raster projection is independently
tested across pan/zoom/window sizes. Physical interaction acceptance of these camera
changes remains required; complete performance acceptance is still open. Device and
simulator builds pass, and the camera correction is installed over `com.cubexp.office`.
Automatic launch was denied because the iPad had locked again; the user was asked to
open the same app and repeat two-finger pan/zoom. All eight backed-up current pages
have zero pixel differences before/after shared clip definitions. Background
refinement remains CPU rasterization and must not be described as fully optimized.
The user still reported clear pan/zoom lag with this projection build. Its fresh
iPad report has four base redraws (maximum about 3.2 seconds), no pen input, and no
display-link interval over 33 ms across 6,000 intervals. This does not establish
smooth visible camera movement. A diagnostic adapter revision
`camera-layer-projection-2` is installed to record gesture/projection/deferred-frame
counts and model/presentation layer transforms. Its physical sample records 13
gestures, 405 camera updates, 426 non-identity projections and nine base rasters
taking 1.7–3.6 seconds. The user reports almost no visible movement until release,
then inability to edit. Counts alone do not establish visible responsiveness.

A hosted UIKit regression target now exercises the actual native controller and
Rust ABI using temporary documents. The private complex-board regression is copied
only into the test device's cache, never committed as a fixture or edited in place.
It reproduces live ink waiting behind a full viewport refinement after zooming.
The adapter now uses an independent Rust ink renderer/worker and retains per-stroke
patches until a base raster containing their revision is published. Cancelled,
superseded-document and already-published patches cannot reappear. Camera projection
also maps these pending patches into the current viewport. Entering editing/input
resumes the display link after a background flush. The native core suite now has
47 passing tests, including an independent-ink cache isolation/pixel parity test.
All four hosted regressions pass on both the iPad mini 6 and iPad simulator, with
the private complex-board case executed (not skipped). On the physical mini 6,
12 successive camera updates reach the presentation layer while the gesture is
still active; the maximum observed wait is 22.2 ms. Ink publication after camera
refinement starts takes 10.1 ms in the final run (20.7 ms in the prior run), and
two successive strokes remain visible until merged into the base. These are
automated controller/ABI-to-layer checks, not real Pencil-to-photon measurements
or synthesized hardware finger/Pencil input. The five original native archive
files have byte-identical hashes before/after these tests. Cold base refinement
still takes seconds, and user acceptance of physical gesture feel remains open.
After testing, a clean normal application build (without the XCTest bundle/runtime)
was successfully installed over `com.cubexp.office` 1.8.1. No additional QA app was
created and no user archive was replaced by the regression fixture.

Further regression work (2026-10-23) removes duplicate archive decoding/browser
projection from the native entry path. The file worker transfers its parsed Rust
session to UIKit. A bounded draft precedes the exact first raster; later opens
can reuse a hash/camera-keyed exact PNG without rerendering. The disposable cache
is capped at 24 entries/64 MiB. Fonts initialize only for text documents, using
portable Latin/CJK outlines rather than Apple's private SFUI/PingFangUI tables.
Noto Sans CJK SC Regular is bundled unmodified with its SIL OFL license.

Camera rasters now include a 12.5% border on each side. When the current view is
contained in those pixels at sufficient detail, gesture release retains them
instead of queuing another entire-board raster. Compiled committed stroke geometry
is reused across other refinements with a 32 MiB budget and explicit memory-warning
trimming. Large pans and deeper zooms still require CPU refinement; this is not a
tiled/GPU scene renderer and complete dense-board performance acceptance remains open.

Native touch routing ignores cancellation of an unrelated palm, retires ended or
orphaned Pencil touches, handles reused touch objects and clears ownership before
callbacks. Live ink now queues completed patches independently so rapid commits
between display ticks cannot overwrite a preceding stroke's pending pixels.
Reproducers failed before these ownership fixes. The expanded native Rust suite
has 49 passing tests; all 14 hosted tests pass on the simulator, including cold
host opening, exact cache/raster reuse, Latin/CJK pixels and 40 Pencil touch-double
sequences across every brush, autosave and palette changes. An earlier physical
mini 6 run measured a 2.60 s cold complex-board first paint, a 0.16 s cached reopen
and a 10.4 ms raster-reuse decision. These timings are not hardware Pencil latency.
Final physical-device rerun is currently waiting on the device lock; do not infer
that physical pan/zoom/Pencil acceptance is complete from these checks.
The blocked test run was cancelled before delivery. A clean normal Release build
was verified to contain neither a hosted test bundle nor the XCTest runtime, then
installed successfully over `com.cubexp.office` 1.8.1 on the same mini 6. No library
reset/uninstall was performed. The final device rerun remains pending unlock.

After unlock, all 14 hosted cases passed on the physical mini 6: cold first paint
2.56 s, exact cached reopen 0.15 s, pixel-reuse decision 11.4 ms and 40 Pencil
touch-double strokes without loss of input. The complex-camera test was then
strengthened to zoom past the reuse limit and require an actual refinement job.
It passed on device/simulator, but exposed a remaining performance failure:
device base rasters took 6.07 s and 5.93 s while live ink still published in 20.5 ms.
This distinction prevents a responsive-input test from being mistaken for an
acceptable full-resolution refinement time.

Subsequent changes bound committed brush compositing surfaces using a scoped,
vendored resvg 0.45.1 entry point (see `crates/vendor/resvg/CUBEOFFICE-PATCH.md`).
The default renderer entry points are preserved. Nested group/pattern coordinate
spaces are accounted for; a 64-pixel guard band and the original simple marker
path preserve the existing pixel tolerance at deep fractional cameras. All eight
backed-up current pages still have zero channel differences. Fonts and both
dependency licenses are included in the normal app bundle.

`FrameRenderer` also merges a complete append-only pen suffix instead of handling
only one new stroke: multiple commits while a slow raster is running no longer
force a second full scene rebuild. Compositing is atomic, checks the original
prefix/layers/background/foreground constraints and preserves opacity/history.
The new regression checks that this path does not populate committed geometry
for the appended strokes. All 50 core tests and all 14 final simulator hosted
cases pass. The `native_camera` release example at 1860×2542 on this Mac measures
3.73 s for deep refinement, then 4.6 ms to merge four additional commits. These
figures confirm the repeated full pass is removed, but the remaining single pass
is still slow; they are not physical-device latency measurements.
The iPad locked again during investigation, so its waiting final rerun was
cancelled before reinstalling the normal Release package (without XCTest) over
the same app. Physical refinement time after these changes has not yet been
established, so dense-board performance acceptance remains open.

The next unlocked device comparison confirmed that bounded SVG composition and
batch merging reduced this specific deep refinement from about 6 s to 4.51 s,
still too slow. Profiling separated two remaining costs: a semi-transparent
background was rasterized well outside the visible view, and historical Chinese
brush strokes used repeated SVG opacity/clip surfaces instead of the direct
native path painter already used for live ink. Paper/background rendering now
uses bounded filter-free composition. `FrameRenderer` uses full-point native
rendering for committed UI pixels; draft-only point reduction remains separate.
Compiled native paths, colors and shared clips reuse one combined 32 MiB budget
with the SVG geometry cache and are cleared on memory warnings. Stroke masks
retain the SVG path where required. SVG scene generation is unchanged.

All 51 core tests pass, including warm/fresh native pixel equality across all ten
brushes, color-change invalidation and memory-budget checks. The original SVG
reference still matches all eight backed-up current pages. The direct UI painter
has small antialias/compositing quantization differences from that SVG reference
(maximum isolated channel difference 15/255; largest page mean channel difference
0.375/255 in these samples); it retains every original stroke point/color and the
existing live-ink semantics. Cached versus freshly compiled native paths are
byte-identical in the ten-brush camera/color regression.

The final device suite passes all 14 hosted tests. On the same mini 6/complex
archive, camera projection reached the presentation layer in about 22 ms, new
ink published in about 10 ms, and deep refinement including newly committed ink
finished in 1.46–1.48 s. Two further zoom releases, both beyond raster reuse,
refined in 1.50 s and 1.20 s. The regression enforces a 1.5 s refinement budget.
All 14 simulator cases also pass (1.05 s / 1.06 s / 0.86 s in the corresponding
camera sequence). These are automated controller/ABI-to-layer checks using touch
doubles, not hardware Pencil-to-photon measurements. The hosted-test process
temporarily disables its idle timer so unattended profiling does not relock the
device; the normal application has no such change. A clean normal Release build
was verified to contain no XCTest bundle/runtime, installed over the existing
`com.cubexp.office` 1.8.1, and launched successfully on the same mini 6. Existing
app data was not reset or uninstalled. Full rewrite/UI parity acceptance remains open.

Validation: the prior 63 package/cross-language tests and 174 brush fixtures pass.
The expanded native suite has 47 renderer/input/session/UI tests, including the
32 original-editor snapping fixtures and cancellation/history checks. The scene fixture now includes highlighter and still differs
at 0/510000 pixels from the existing SVG scene in Chromium and WebKit. Native live
highlighter compositing matches committed pixels within one 8-bit channel level.
Streaming committed rendering also matches a monolithic ten-brush scene with eraser
masks and a highlighter overlay within one channel level; a compact synthetic board
whose aggregate SVG exceeds 64 MiB still rasterizes its visible ink successfully.
Device and ARM64 simulator XCFrameworks build, and Android/HarmonyOS renderer
cross-checks pass. The iPad mini simulator verifies drawing after custom colors,
page creation/readonly navigation, native gallery thumbnails, path erasing and
archive autosave. A two-page exported PDF was independently rendered and inspected.
Pencil double-tap/hold, camera capture, extended physical-device performance and complete UI
parity are not inferred from simulator or build success.

Performance: the first native prototype redrew/copied full frames and logged
40–66 ms simulator frames. Cropped previews retain the base layer; normal ink paths
are painted directly and Chinese-ink clip masks are reused. A newly appended stroke
is composited into the retained base without rebuilding the whole scene; edits and
foreground-layer cases invalidate that optimization. Save acknowledgment also
checks a Rust document epoch, so an older document's save cannot clean a newly
opened document at the same revision. Run the reproducible
release profile with `cargo run --locked --release -p cubeoffice-notes-core
--features native-renderer --example native_profile`. On this Mac, the 60-sample,
1488×2000 fixture measured preview p95 of 0.25–8.0 ms across the 10 brushes; input
batch p95 stayed below 0.01 ms. These are CPU fixture timings, not physical iPad
mini 6/Pencil-to-display latency. Dense boards, long strokes and real devices remain
acceptance work; the current renderer is CPU based.

Physical-device QA (2026-10-22): the independently signed `CubeOffice Rust QA` was
installed on the user's iPad mini 6 (iPad14,1, iOS 27.0.1). The user confirmed drawing
and two-finger zoom were smooth. Instruments could not attach (its device discovery
reported offline), so bounded in-app timing aggregates were added instead. A subsequent
user-operated sample recorded 229 input batches across four strokes, 192 live-ink
rasters and 1,494 display-link intervals, about 25 seconds. Input batch p95 was
0.033 ms (maximum 0.649 ms); live-ink raster p95 was 19.872 ms (maximum 21.768 ms).
The largest display-link interval was 29.253 ms, with no interval over 33 ms. Five
base updates included one 37.155 ms raster; raster-to-layer-publication maximum was
45.685 ms. One background archive save took 13.643 ms. This short sample did not
reproduce the reported long stall; some CPU ink frames still exceed the 60 Hz frame
budget. Publication timing measures worker dispatch through layer assignment, not
hardware Pencil-to-photon latency, and display-link timing is not a GPU frame trace.

QA aggregates retain counts/maxima and a bounded 512-sample percentile window per
channel, without note contents or coordinates. They are written to the app's local
`Library/Caches/NativeNotesMetrics.json`. The UIKit adapter also caches fixed chrome
icons instead of rasterizing them on every refresh. Quantitative dense-board,
long-stroke, palm and repeated zoom acceptance remains open; the short user sample
does not establish those cases. QA document backups and raw metrics stay in ignored
local QA storage and are not fixtures or release assets.

Upstream remains unmodified. Keep this ledger open until every mandatory row is
accepted. Build/tests prove the named scope only; they do not establish a complete
app rewrite. The old broad art test still assumes v1 graphite concentration, while
the shipped v2 graphite renderer varies pressure width. It is retained unchanged;
the new pixel-parity test checks preservation of the current renderer's output.

### Native camera and selection follow-up (2026-10-23)

The earlier 1.2–1.5 s full-frame result above was an improvement, not completion
of the zoom interaction work. The editor now keeps world-aligned raster tiles
across camera changes, with a 32 MiB LRU pixel budget. Half-octave LODs avoid
rendering above the requested display density; temporary camera rasters retain
all source points. The visible region is bounded to 8 MP. Small pans and local
object edits update affected tiles. A largely uncached LOD first publishes a
small central tile, then complete tile rows from at most four independent workers. Fonts, compiled paths, immutable
verification values and image trees are shared with Arc; each worker owns
its raster surfaces and cache inventory. Completed rows seed the same bounded
world tile cache. Independent atomic cancellation stops obsolete work between
objects and brush passes; cancellation keeps valid prepared paths but discards
unpublished stale pixels. Live ink stays on its independent worker. Cached PNG
opens use renderer cache version v7.

Native grain now uses shared small pattern rasters and direct paths, rather than
rebuilding an SVG tree around each textured pass. Geometry is bounded to 32 MiB
normally / 64 MiB for camera tiling, auxiliary image/text scenes to 16 MiB and
pattern pixels to 8 MiB; memory warnings release disposable caches. The tile job
externalizes its immutable page once. SVG interchange output is unchanged; native
antialiasing is checked separately from preview/commit continuity.

The mini 6 physical hosted regression measured an active camera presentation
maximum of 22.0 ms; detailed central tiles appeared after 194 ms, 113 ms and 6 ms
in the tested deep/repeated camera sequence. Concurrent live ink appeared after
10.7 ms. Refinement plus two committed strokes completed in 1.234 s; subsequent
complete camera updates took 0.921 s and 0.042 s. Observed process footprints at
the repeated views were 343 / 333 MiB. These are one private dense-board automated
controller/ABI/layer sequence, not hardware Pencil-to-photon or universal board
performance guarantees. The first two cameras require rendering; the final view
reuses cached tiles. Cached file opens in this run took 0.15–0.23 s; these do not
measure a cold raster cache.

Selecting content restores the original bottom capsule above the pen tray, with
color, arrangement, saved-region, duplicate and delete icons. Wide iPad views
also show the selection count and three quick colors. Text and connectable shapes
expose their original conditional actions. The arrangement card restores color,
stroke width, alignment, equal spacing and 90% / 110% resizing; edits use the
Rust model/history commands and saved regions use the selected bounds.
The capsule is automatic on selection;
readonly and active manipulation hide it. Rust supplies independently owned,
cropped replacement-background and transparent selected-content frames. UIKit
moves/scales their presentation layers during manipulation, keeps them until the
committed base is published, and defers full-scene drawing during the drag.
Replacement pixels retain other overlapping objects. Both selection layers sit
above pending ink patches, which may arrive asynchronously after selection starts;
otherwise those patches resurrect the original object during a drag. Selection snapshots are
internal render data and never enter notebook archives or history. Copy/delete
still use the existing Rust commands; movement commits one history step.

The physical selection test verifies visible Delete, movement of the actual
presentation layer before pointer-up, no dark original-ink pixels in the composed
canvas during the drag, no whole-base replacement during the drag,
menu restoration, deletion, undo and resumed drawing. It also checks the restored
icon-only capsule position, arrangement controls and unavailable single-object
alignment. The full physical hosted
suite passes 15 cases, including the 40-stroke brush/color/autosave/palm sequence.
The expanded Rust tests additionally cover cropped transparency, underlying
content preservation, mixed cached/fresh tile seams, cache invalidation and
cancelled jobs. Raw archives, device screenshots and timing logs remain in ignored
local QA storage. This follow-up does not close the broader format/platform/UI
migration acceptance ledger.

### Small-edit latency and obsolete-camera cancellation

A dense-board physical regression exposed a missing acceptance case: deleting a
single selected stroke returned its command after 31.6 ms, but pixels changed
only after 1266 ms (1233 ms raster job, zero cache hits). The old tile policy kept
only append-only changes; any delete, move, style edit or undo cleared the whole
pixel and compiled-geometry caches. The previous one-second refinement threshold
was not an adequate test of interaction feedback.

Local object changes now invalidate the union of their previous/new conservative
bounds, including connector changes. Unaffected tiles and content-verified
compiled paths remain valid. Paper, layer compositing/order, background changes
and text edits retain conservative full pixel invalidation. Ordinary metadata
such as saved regions does not repaint pixels. The new regression checks delete
command latency, actual base publication and nonzero retained tiles. Pixel tests
compare local edits, delete, undo and redo against a fresh render.

Bristle masks and blending are restricted to conservative actual path bounds,
including curved control points, with an integer pixel gutter. Original samples,
pressure, brush passes, archive output and interchange SVG remain intact. A
colored-paper reference test bounds compositing/antialiasing differences against
the full-size native surface. All brush types additionally compare parallel row
boundaries against serial pixels.
Each base-render job has a detached atomic token. UIKit can signal that token
without borrowing the active renderer. The worker binds a shared owner before
rendering; child workers inherit it and stop between strokes/passes. A cancelled
camera joins its children, retains immutable prepared paths for subsequent jobs,
and never advances the committed base with partial pixels. ABI tests also verify
cancellation-token lifetime and recovery with a fresh token. These changes do
not implement a GPU brush renderer; measurements remain necessary for complex
first-time LODs and cannot imply universal 60 Hz rendering.

The final mini 6 hosted run passed all 16 cases. On the same dense board, the
delete command took 27.2 ms and changed base pixels appeared after 99.6 ms
(68.9 ms raster work, 22 retained tile hits), versus 1266 ms before local
invalidation. Active camera projection peaked at 22.9 ms. The first detailed tile
appeared after 203.8 ms; concurrent new ink appeared after 10.7 ms. Refinement
with two new strokes completed after 948.6 ms. Subsequent complete camera updates
took 570.2 ms at an uncached view and 41.8 ms when reusing tiles; their first detail
appeared after 114.7 / 6.5 ms. Observed process footprints were 427 / 425 MiB in
that hosted sequence, higher than the preceding synchronous-row run's 246 / 236
MiB. Parallel progress trades transient memory for earlier publication; this is
not a claim that first-time detailed zoom has no latency. These measurements use
automated controller input and actual UIKit/Rust rendering on the physical iPad,
not hardware Pencil-to-photon timing. The simulator's same 16 cases and Rust
pixel/cancellation regressions also pass. Raw logs and the private archive stay
in local QA storage.

After that run, a clean, signed normal Release build (no XCTest payload) was
installed over `com.cubexp.office` 1.8.1 and launched successfully on the mini 6.
The existing app container was retained; no uninstall or notebook reset was used.

### Long live oil strokes

The native live-ink worker previously regenerated all 29 oil ribbons, serialized
their complete polygons and parsed/rasterized the whole growing stroke on each
update. A release host profile measured 4.5 / 51 / 161 / 513 ms for 64 / 512 /
2048 / 8192 samples. These are desktop worker timings, not device input latency.

Live oil now retains sampled travel, per-pass ribbon sections and conservative
64-segment block bounds. Appending input updates the previous endpoint tangent
and new sections. Only tiles touched by the previous/new tail are repainted.
All original passes, pressure, travel-based noise, trims, opacity and pass order
remain present. Adjacent block contours share one winding fill per pass, so joins
and self crossings are not independently alpha-blended. A source-count change
that alters the existing interpolation cap rebuilds affected geometry rather than
silently changing archive/interchange output. Changed historical points, brush
settings, cameras and surface sizes invalidate the live state; memory warnings
release it on its owning worker. This path is for live version-2 oil ink; canonical
committed rendering and other brushes retain their existing implementations.

UIKit now captures live snapshots at display cadence when the ink worker is
available, instead of copying all previous points in every touch callback. It
still captures the complete final stroke before pointer-up commits it, preserving
short strokes that finish between display ticks. Regression coverage compares
incremental oil pixels against the complete renderer at crossings, trims and tile
boundaries and checks geometry work over 8192 dense samples. Hosted UIKit coverage
also records early/late frame times and verifies commit, undo and resumed drawing.

The mini 6 physical hosted suite passed all 17 cases after this change. Its
8193-sample oil stroke published frames throughout: worker raster p95 was 8.10 ms
in the first 64 batches and 19.27 ms in the final 64 batches, with a 0.102 ms
maximum input callback and 0.816 ms maximum snapshot capture. Commit, undo and
resumed drawing passed. These are actual device CPU/UIKit worker measurements
with synthetic Pencil samples, not measured hardware-to-display latency. The
three Rust oil regressions pass, including pixel parity (mean channel difference
below 0.0003 on the tested multi-point paths; no channels differing by more than 16) and bounded new-section counts over 8192 samples. All 174 native/WASM brush
geometry fixtures still match the existing implementation.

A clean signed normal Release, without XCTest payload, was subsequently installed
over the existing `com.cubexp.office` 1.8.1 app and launched on the mini 6. The app
container and existing documents were retained.

### All-tool audit and GPU direction

The subsequent audit runs every current brush plus highlighter at 64, 512, 2048
and 8192 samples, then appends 16 more samples, commits and undoes each tool.
On mini 6 before the common-path fixes, the 8192-point tail-update worker times
were: ballpoint 15.3 ms, fountain 15.3, Chinese brush 202.1, pencil 51.1,
watercolor 117.7, marker 54.3, crayon 46.6, reed 51.1, spray 59.6, oil 16.0 and
highlighter 15.2. These are single checkpoint worker timings, not p95s or
Pencil-to-photon latency. On the private dense board, 16 successive eraser updates
measured input/pixel-publication p95s of 61.8/716.3 ms for path erase and
43.0/402.1 ms for whole-stroke erase. The earlier oil-only fix did not establish
all-tool acceptance.

Identified common costs were JSON cloning/model revalidation on every eraser
callback, repeated stroke deserialization in hit tests, full-stroke damage for
small new erasure masks, SVG-mask fallback after erasure, polygon serialization
and parsing for live geometry, and repeatedly painting unchanged old ink. Native
paths now use typed source geometry directly; one shared resampling feeds the
ribbon passes. Live strokes retain a transparent raster and compare old/new path
control points to repaint changed coverage, retaining all original brush passes.
Eraser gestures use a bounded-segment index, copy-on-write previews and native
alpha masks. Appended/undone erasure tails invalidate their local bounds, while
whole-stroke removal still damages the removed object's full coverage. UIKit
coalesces eraser samples at display cadence and flushes before commit/commands.
Full archive/model validation remains at commit. This remains CPU rendering.

For a shared Web/Android/iOS/HarmonyOS/Windows drawing engine, the recommended
next rendering layer is wgpu beneath the existing Rust document/brush/history
authority. Its documented primary backends are Metal for Apple platforms,
Vulkan for Android, DX12 for Windows and browser WebGPU via WASM; WebGL2 is a
secondary/downlevel path, not a promise of full compute-feature parity.
See [wgpu backends](https://docs.rs/wgpu/latest/wgpu/struct.Backends.html).
HarmonyOS needs explicit SDK/device validation of XComponent/NativeWindow and
surface creation; [OpenHarmony's native-window interface](https://github.com/openharmony/docs/blob/master/en/application-dev/graphics/native-window-guidelines.md)
and [VK_OHOS_surface](https://docs.vulkan.org/refpages/latest/refpages/source/OHNativeWindow.html)
provide the platform route, but are not evidence of a production-ready wgpu port.

The GPU architecture must retain incrementally updated brush meshes/stamps,
texture-backed tiles and local eraser alpha masks; update only new data, transform
existing textures during gestures, and avoid per-frame GPU readback to UIKit
images. Platform adapters retain native Pencil/touch events, camera/photo services
and controls. SVG stays for interchange/export, CPU rendering for portable tests,
thumbnails and fallback. wgpu is a graphics abstraction, not a completed 2D brush
engine: cache invalidation, antialiasing, pigment blending, input prediction and
memory limits remain application work. No wgpu/Metal engine has been integrated
by these CPU fixes, and no Rust toolchain upgrade is implied.

Apple explicitly states that PencilKit renders in Metal and recommends predicted
touches for low latency; see [WWDC26 PencilKit](https://developer.apple.com/videos/play/wwdc2026/203/)
and [Introducing PencilKit](https://developer.apple.com/videos/play/wwdc2019/221/).
That does not disclose Freeform's complete private rendering architecture.

The final CPU-path physical audit ran all 19 hosted cases: 18 passed, and the
whole-stroke eraser failed its unchanged 250 ms pixel-publication budget. This is
an open performance failure, not an all-green acceptance. All 11 drawing tools
passed their 50 ms tail-update budgets at all four checkpoint lengths. Mini 6
8192-point tail updates before/after (ms):

| Tool          | Before | After |
| ------------- | -----: | ----: |
| Ballpoint     |   15.3 |   2.1 |
| Fountain      |   15.3 |   2.6 |
| Chinese brush |  202.1 |  14.5 |
| Pencil        |   51.1 |   4.1 |
| Watercolor    |  117.7 |   8.0 |
| Marker        |   54.3 |   5.1 |
| Crayon        |   46.6 |   4.1 |
| Reed          |   51.1 |   4.8 |
| Spray         |   59.6 |  25.2 |
| Oil           |   16.0 |  15.8 |
| Highlighter   |   15.2 |  14.4 |

Path eraser input/pixel p95 became 0.040/181.3 ms, max 7.53/436.5 ms;
whole-stroke eraser became 0.017/363.1 ms, max 22.23/366.3 ms. Main-thread
coalesced erase application peaked at 6.31 ms. Input callback time excludes that
deferred work; it must not be presented as total eraser latency. The first cold
path update and whole-stroke recomposition remain visibly slow. Removing a long
stroke necessarily changes its full coverage; local mask damage cannot reduce
that operation to the new eraser-tip rectangle. GPU texture/mesh compositing is
the next renderer direction, not a completed fix in this CPU delivery.

The automated Pencil sample stream does not measure hardware Pencil-to-photon
latency or every possible drawing. Long oil's first/final 64-batch worker p95s
were 8.92/19.42 ms. Rust checks passed 47 distinct cases (5 unit, 11 native-input,
16 tools, 4 parallel, 7 raster, 4 all-tool/mask/dirty-region cases). Direct native
brush geometry matches original paths; native mask/reference mean channel error
was below 0.0005 with no channel differing by more than 16 in the tested tap/
elliptical/tape cases. Eraser cancellation, immutable history snapshots, undo,
redo and local tile pixels passed. The CPU performance failure stays recorded
until a subsequent renderer meets the same budget.

The interim CPU fixes were delivered as a clean signed normal Release over
`com.cubexp.office` 1.8.1 and launched on mini 6, preserving the existing app
container. The delivered bundle contains no XCTest payload. The whole-stroke
eraser performance failure above remains open in this installed version. All
174 native/WASM brush fixtures and the file-bridge/projection checks also pass.

### iPad wgpu migration (physical acceptance, 2026-10-23)

The iOS native canvas now has a real `gpu-renderer` feature using wgpu 26.0.1
(MSRV 1.84, compatible with the pinned Rust 1.88) and its Metal backend.
`NativeGpuCanvas.swift` owns a standalone CAMetalLayer and a serial Rust GPU
worker. The existing UIKit controller still supplies all controls, tool settings,
Pencil interactions, page overlay, selection capsule, background manipulation,
photo services and accessibility. `.cubenote` codecs, immutable document history,
200-step undo and the existing app/file-library bridge are unchanged.

Committed ink uses retained nonzero-fill triangle meshes; changing the camera
updates a uniform, without CPU board rasterization, SVG serialization, UIImage
publication, or GPU readback. Growing paths use GPU stencil winding and one
pigment cover per original pass; convex spray contours use union coverage.
Stroke/path erasers and masking tape modify GPU coverage while retaining the
original stroke geometry. A conservative winding bound falls back to exact
mesh construction for pathological high-winding paths, avoiding stencil wrap.
Oil reuses incremental bristle sections, uploads only changed positions into
persistent GPU buffers, and applies a spatial winding bound. Individual photos
are decoded once and retained as textures: movement, rotation, scale and opacity
change a quad rather than resampling the photo. Text uses the existing font
shaper and retained object textures; text exports remain vector based. Paper
patterns use a world-space GPU shader. GPU antialiasing is 4x MSAA; CPU/GPU edge
pixels are therefore compared numerically rather than claimed bit identical.

CPU rasterization remains for export, thumbnails, reference tests, and explicit
adapter failure fallback. The production editor defaults to GPU. The Debug-only
`cpuReference` initializer runs the old raster-specific regression assertions;
`NativeGpuCanvasTests` separately exercises the actual production display path,
reads GPU pixels only for QA assertions, and checks real device frame updates,
selection, undo/redo, reopening and all drawing/erasing tools. Test touch samples
are programmatic and do not establish physical Pencil-to-photon latency. User
library documents are never edited by tests; the dense archive is copied into a
temporary test directory.

The historical CPU 250 ms whole-stroke-eraser failure above is retained as the
baseline. The following GPU physical acceptance passes that unchanged budget;
this does not retrospectively make the CPU reference renderer pass it.

Physical acceptance on the connected iPad mini 6 (Apple A15, OS 27.0.1) passed
all five selected hosted cases: production cold file-host opening, the 11-tool
matrix, continuous oil plus repeated Pencil/color/autosave/reopen, dense-board
camera and both erasers, and the original selection capsule/move/delete/undo.
No private fixture was skipped. The actual GPU pixels were checked, the canvas
had no CPU UIImage base, and the backend reported `wgpu-metal` / Apple A15 GPU.
The existing original archive was copied into a temporary directory for edits.

| Device measurement                                           |     GPU result |
| ------------------------------------------------------------ | -------------: |
| Cold production host, first exact frame                      |      1462.6 ms |
| Cold host main-thread setup (decode on file worker)          |         9.9 ms |
| Active camera updates, p95 / max of 40 updates               | 18.2 / 22.6 ms |
| Path erase publication, p95 / max of 16 updates              | 29.1 / 32.7 ms |
| Whole-stroke erase publication, p95 / max                    | 32.4 / 39.4 ms |
| Main coalesced erase application, max (path / stroke)        | 7.44 / 8.86 ms |
| Continuous 8193-point oil, final 64 batches worker p95 / max | 5.29 / 5.49 ms |

Camera updates retained the exact same mesh upload count throughout the gesture;
there is no delayed CPU zoom-refinement job. The dense scene uses approximately
112.6 MiB of meshes and 2.9 MiB of textures. Erase publication includes display
scheduling; the worker preparation/submission timings below are neither GPU
execution timestamps nor physical Pencil latency. All original 50 ms tail / 250
ms eraser acceptance limits were retained.

| 8192-point tool, append 16 points | Worker milliseconds |
| --------------------------------- | ------------------: |
| Ballpoint                         |                6.84 |
| Fountain                          |                6.91 |
| Chinese brush                     |               44.08 |
| Pencil                            |               19.95 |
| Watercolor                        |               28.62 |
| Marker                            |               17.00 |
| Crayon                            |               15.14 |
| Reed                              |               14.82 |
| Spray                             |               29.41 |
| Oil                               |               10.98 |
| Highlighter                       |               14.30 |

The checkpoint matrix deliberately injects thousands of samples in a single
batch; oil's 2064-to-8192 catch-up was 107.1 ms on its worker, while its subsequent
16-point tail was 11.0 ms. This is distinct from normal continuous input's 5.29
ms late-batch p95. Other long brush styles still construct their live geometry
on the worker; the table does not establish a universal 60 fps drawing guarantee.
Pathological high-winding geometry uses an exact tessellation fallback and may
cost more. Glyphs currently use per-object raster textures (exports retain text
vectors), and large source photos are bounded/downsampled to 8 MP / 4096 pixels.
Other platforms are not migrated by this iPad change.

Rust validation passed 68 distinct cases across units, GPU, native input/tools,
parallel rendering, oil growth, exports, file/history sessions, tiles and tool
performance. GPU-specific checks include all current brushes/live-vs-committed
pixels, masks and lower-layer recovery, non-rebuilding camera updates, dense
chisel unions, incremental oil through 8208 points, photos/text/paper/rotations,
and overflow-safe winding. Grid/ruled/dotted mean normalized channel errors were
0.000048 / 0.000025 / 0.000103 against the existing paper renderer; dense chisel
live-vs-exact GPU error was 0.000008. The three file-bridge checks and two camera
projection checks also passed.

Delivery: a clean, signed normal Release of **CubeOffice 文档 1.8.1**
(`com.cubexp.office`, build `1008001`) was verified with codesign, checked to
contain no XCTest bundle, and installed over the existing app on mini 6 at
21:05:41 EDT on 2026-10-23. It launched successfully at 21:06:26 and its process
remained present in the subsequent device process snapshot. The app was never
uninstalled and its existing data container was retained. Final build/install
and measurement artifacts remain local under `.cache/notes-qa/wgpu-*`; private
archives and screenshots are excluded from version control.

### Incremental Chinese brush follow-up — 2026-10-23

Chinese brush v2 now shares the incremental ribbon engine: its 17 bristles retain
GPU position/index buffers and update the changed tail, including the preceding
section needed for continuity. The original pressure, dryness, flying-white
texture, outline clipping, masks and tape remain intact. The outline is computed
once per update and reused for base pigment, clipping and grain coverage. Its
cost still grows with stroke length; this is not a constant-cost whole-stroke
renderer. Unsafe high-winding paths retain the exact geometry fallback. Empty
zero-triangle initial nib meshes are skipped before buffer slicing.

On the same iPad mini 6 / Apple A15, the 8192-point checkpoint followed by 16 new
points improved from 44.08 ms to 8.60 ms worker time (about 5.1x). A separate
continuous 16-sample-batch test ran through 32769 points:

| Continuous Chinese brush measurement               |    Device result |
| -------------------------------------------------- | ---------------: |
| Final 64 batches at 8193 points, worker p95 / max  |   5.04 / 5.14 ms |
| Final 64 batches at 32769 points, worker p95 / max | 21.14 / 22.36 ms |
| Main input processing, maximum across run          |          0.18 ms |
| Main immutable frame capture, maximum              |          3.52 ms |
| Bristle sections updated per normal tail           |              289 |
| Steady bristle GPU upload per normal tail          |       9248 bytes |

Buffer capacity growth can upload more than the steady tail; injecting the
2064-to-8192 catch-up at once took 66.98 ms on the worker. Worker timings measure
preparation/submission, not physical Pencil-to-photon latency or GPU execution.
The 32769-point test also checks actual GPU pixels through undo/redo and saved
`.cubenote` reopening, then changes pen and draws again. UI, file codecs and
history are unchanged.

All six selected physical hosted cases passed: the cold production file host,
11-tool matrix, continuous Chinese brush, continuous oil/autosave/repeated input,
dense-board camera/both erasers, and original selection menu/move/delete/color.
The camera p95 was 18.08 ms; path/whole-stroke erase publication p95 was
28.93 / 26.06 ms. Rust validation passed 54 selected cases, including independent
full-geometry pixel comparisons at dryness 0/40/100 with pressure on/off, growing
tails through 8208 points, erase/tape clipping and overlay cancellation. Mean
normalized pixel error for the longest Chinese brush comparisons was at most
0.000012. Logs remain local in `.cache/notes-qa/chinese-brush-*`.

Delivery: a clean signed normal Release, **CubeOffice 文档 1.8.1**
(`com.cubexp.office`, build `1008001`), passed codesign verification and contained
no XCTest bundle. It was installed over the existing mini 6 app at 21:19:48 EDT
and launched at 21:19:57; process 5533 remained present in the device snapshot.
No uninstall/reset was performed and the existing data container was retained.

### Owned text / EPUB authority batch — 2026-10-25

The full user-confirmed scope remains every format and every platform UI with
the original interface. This batch implements RF-01's portable core and RF-03's
buffer/history/encoding plus their current-host integration. It does not close
the native shell/UI requirements, nor the remaining OFD/Office migrations.

| ID    | Mandatory acceptance                                                          | Result                                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OF-01 | Rust EPUB archive/metadata/manifest/spine/nav/NCX, fonts, original bytes      | Accepted: native and actual WASM tests cover original export, fallback chains, case-insensitive resources, nav/NCX/fixed layout/RTL and IDPF/Adobe font deobfuscation, including uppercase Adobe UUID prefix            |
| OF-02 | Rust text authority, UTF-16 transactions, encoding, grouped history/selection | Accepted: Rope state, 200-step/32 MiB history, atomic invalid ranges, readonly, UTF-8/16 BOM and legacy input, undo/redo selection and original mixed-newline exports                                                   |
| OF-03 | Detached and ordered saves; bounded large-file reads; host behavior           | Accepted: 12 MiB incremental editing, 5 GiB bounded range reads, edit-during-encoding/delivery, failure/cancel, overlapping ordered delivery, stale acknowledgements, retained folds and rejected invalid Unicode edits |
| OF-04 | Chromium/WebKit use actual Rust and all production payloads match             | Accepted: Chromium/WebKit pass; desktop renderer and CubeOffice iOS/Android/HarmonyOS shared payload builds pass, each with all 14 matching WASM assets                                                                 |

Ownership: `crates/formats-core/{src/text.rs,src/epub.rs,src/search.rs}` is the
portable authority. `packages/kernels` hosts the shared ABI v1 WASM instance
per document. The existing `packages/text` and `packages/epub` view APIs call
it directly; no JS fallback chooses a different authority on failure. Build
scripts compile the pinned Rust 1.88.0 source and copy its actual artifact.
The assets checker now expects the twelve pinned upstream binaries plus the
owned notes and formats kernels. Android retains its original asset origin.

Text view changes cross as UTF-16 ranges, never a complete document per key.
Rust validates before the display transaction so failed input cannot desync
the displayed and saved text. Undo returns the actual replacement range to
retain unrelated folds and restore its saved selection. Composition events
retain their group across typing pauses. Snapshot encoding emits bounded
chunks while the host yields, captures before destination queuing, and only
acknowledges successful delivery. Unchanged snapshot comparisons use persistent
identity and cached dirty state to avoid repeatedly scanning a large clean file.
EPUB resources inflate on demand; small-resource caching is bounded. Literal
search maps Unicode lowercase expansions back to original UTF-16 coordinates
without allocating a coordinate pair per byte of a large chapter.

The validation set contains 45 host/WASM cases and 10 native Rust cases; both
Chromium and WebKit independently exercise real text/history/concurrent saves,
EPUB metadata/resources and search. Original syntax, paging, sanitization,
thumbnail, cancellation and office-session tests are retained. Text's IME and
syntax/display adapters remain CodeMirror; EPUB's sanitized DOM/CSS pagination,
anchors and accessibility remain its original reader. These retained bindings
preserve the interface during the next native UI stage; they do not constitute
acceptance of the user's requested complete Rust UI migration.

Closure: RF-01's portable authority is accepted. RF-03's core is accepted but
the RF-03 native IME/view adapters remain open. RF-02 (portable OFD package and
renderer), RF-04 (native Office layout/rendering and remaining PDF/image command
ownership), RN-05's remaining interactions/plugins/accessibility and RP-01's
iOS shell/other native formats plus desktop/Android/HarmonyOS native views stay
open. No overall completion percentage or full-rewrite closure is claimed.
The mini 6 was reported `unavailable` by CoreDevice in this batch; new physical
touch/IME acceptance and installation have not been performed. Local evidence
is in `.cache/notes-qa/formats-*`.

A normal signed Release of the existing **CubeOffice 文档 1.8.1** bundle
(`com.cubexp.office`, build `1008001`) also built successfully with the new
payload. Codesign and the embedded formats-kernel hash were verified; it contains
no XCTest bundle. It is ready in the existing native delivery directory. No
separate app was created, no device data was modified and nothing was published.
The owned-format core/host batch is closed; the parent rewrite remains open for
the mandatory rows listed above. `git diff --check` passed.

### OFD package authority batch — 2026-10-25

RF-02 now uses `crates/formats-core/src/ofd` for package indexing, XML inspection,
document/version selection, metadata, part edits and validated save snapshots.
The existing OFD viewer receives the same public metadata shape and DOM resources.
This closes the portable package authority slice, not RF-02's renderer or the
whole application rewrite.

| ID    | Mandatory acceptance                                                               | Result                                                                                                                                                                                                                     |
| ----- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OP-01 | Original bytes, opaque parts, XML/metadata and selected versions remain compatible | Accepted: three metadata projections generated by the pinned original TypeScript implementation match exactly; unchanged output returns the source bytes, and edited output retains unrelated part bytes                   |
| OP-02 | Atomic, bounded raw-byte edits and independent save snapshots                      | Accepted: direct WASM uploads avoid JSON/base64 binary copies; invalid paths/uploads do not change the document; detached native save snapshots run on another thread while the live package changes                       |
| OP-03 | Signed-file policy, paths, ZIP/XML budgets and resource laziness                   | Accepted: removing a signature part cannot bypass the original signed-file policy; traversal/duplicate entries and DTDs are rejected; unused attachments stay compressed and the small-resource cache is bounded to 16 MiB |
| OP-04 | Existing host behavior and packaged Rust artifact                                  | Accepted: all 56 OFD host/WASM tests, 17 native formats tests, and Chromium/WebKit integration tests pass; all four production payloads contain the 14 expected Rust WASM artifacts with matching source hashes            |

The previous 45 text/EPUB host/WASM tests also pass with the shared client change.
Original OFD rendering, fonts, ICC, signature validation, cancellation and viewer
tests are retained. The original metadata oracle is pinned to commit
`43022d3584827e6adb89c18f1d7fa5b50ed17b21`, independently of the Rust implementation.
Binary part reads return owned copies; raw upload invalidates a pending destination
before validating another one, preventing a failed prepare from targeting an old
part. Lazy host resource overlays preserve original encoded resources in the core.

The normal signed **CubeOffice 文档 1.8.1** Release (`com.cubexp.office`, build
`1008001`) built successfully. Codesign, its embedded formats WASM hash and absence
of XCTest bundles were verified. The shared kernels package dry run includes the
compiled module, declaration, README and license; no package was published.
Local evidence is in `.cache/notes-qa/ofd-rust-*`.

Device delivery is pending: the mini 6 was connected, but its lock-state query
reported `passcodeRequired: true`. The overwrite installation timed out without a
success result; the launch attempt explicitly failed with `Locked`. Neither a
successful update nor physical acceptance is claimed. The user has been asked to
unlock the device; no uninstall or data reset was performed.

Remaining mandatory work is unchanged in scope: OFD rendering, signature descriptor
generation/host crypto bindings and static creation/conversion writers; native
Office layout/rendering and remaining PDF/image ownership; the remaining notes
interactions/plugin/accessibility acceptance; native shells and other format views
on iOS, desktop, Android and HarmonyOS. Keeping the original DOM/view adapters
preserves the interface during this transition and does not satisfy the requested
complete Rust UI migration. The parent rewrite remains open.

### OFD drawing, validation and raster authority — 2026-10-25

This supersedes the preceding OFD batch's open renderer/signature/writer items.
The existing viewer, controls, public synchronous writer APIs and file identity
are retained. Production no longer calls the old TypeScript paint/text/raster or
BMP/TIFF implementations. The original implementation at
`43022d3584827e6adb89c18f1d7fa5b50ed17b21` is loaded only by independent development
fixture generators and benchmarks, including its complete original dependency
closure. There is no original-renderer fallback in the shipped code.

| ID    | Mandatory portable acceptance                                                      | Result                                                                                                                                                                                                                                                                        |
| ----- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OR-01 | OFD draw geometry, resources, templates, clipping, actions, annotations and stamps | Accepted: native/WASM renderer and eight original complete-page projections; rendered pixel differences are zero for the eight fixtures                                                                                                                                       |
| OR-02 | Font outlines/CGTransform, synthetic styles, gradients/patterns and color bindings | Accepted: ttf-parser outlines and Rust sampling; original fallback/embedded font and ICC-provider cases pass; callback failures/NaN/reentry cannot corrupt or poison a session                                                                                                |
| OR-03 | Signature structure, index/descriptor generation and detached writes               | Accepted: ten original valid/tampered/malformed signatures, appended signatures, opaque XML namespaces, UTF-16 edits, original-versus-Rust resource/XML parts, abort/error isolation and strict reply routing; crypto/trust remain explicit providers                         |
| OR-04 | Structure/reference validation and ordered XSD results                             | Accepted: five full original reports match, including shared-resource traversal order, scoped IDs/types and Annex A error details; native validation plans reject missing/duplicate/unexpected host results                                                                   |
| OR-05 | Built-in image decoding preserves historical pixels and original file resources    | Accepted: 84 original BMP/TIFF comparisons, both endian orders, alpha/palette/bitfields/RLE, LZW/Deflate/PackBits/JPEG, Group-3 1D/mixed/bit order, Group-4 bit order and all eight orientations; lossless channel difference zero, JPEG maximum difference two               |
| OR-06 | Final zoom/export stroke minima preserve synchronous APIs                          | Accepted: Rust device geometry matches 41 scalar projections and five scale-specific page attributes/pixels; cold first call and invalid-request recovery pass                                                                                                                |
| IR-01 | Remove the mobile TIFF decoder bypass without losing multi-page files              | Accepted: image imports and selected-page previews use Rust; two synthetic three-page documents in different byte orders pass native and actual Chromium/WebKit preview checks in nonsequential page order; source bytes remain unchanged and cyclic directories are rejected |
| OR-07 | Native/host acceptance and matching delivery artifacts                             | Accepted locally: 34 native tests, 182 OFD host/WASM tests, the existing 45 text/EPUB tests, Chromium/WebKit, and the delivery checks below                                                                                                                                   |

The package still preserves raw image/font uploads, immutable source resources,
private render snapshots and explicit cleanup. BOM/namespace extensions and
unrelated resources are not rewritten during rendering. The small synchronous
module compiles shared Rust writers and device-stroke code; the large asynchronous
kernel remains lazy. Dependency notices and versioned source links accompany the
npm package and every production payload. Generated notices are checked alongside
the exact embedded synchronous module and 14 external WASM artifacts.

Desktop measurements on darwin/arm64, Node 24.16.0 (five interleaved samples,
warmed compilation, median milliseconds):

| Workload                                       | Original TypeScript | Rust WASM |
| ---------------------------------------------- | ------------------: | --------: |
| 5,000 visible OFD paths                        |              129.56 |     98.88 |
| 2.28 million radial-gradient samples           |             2710.20 |     71.83 |
| Final device-scale attributes for 10,000 paths |               69.93 |     14.37 |

These are desktop processing measurements, not iPad Pencil latency or native
frame-rate acceptance. The radial renderer avoids per-pixel stop parsing and heap
allocation; device-scale updates replace only changed SVG attributes instead of
serializing a complete DOM.

Closure decision: the portable OFD drawing/validation/codec and signature/writer
batch (OR-01–07), plus the concrete TIFF bypass IR-01, is accepted. RF-02 stays
open for native platform views and the remaining PDF/raster output/conversion
ownership. RF-04's Office layout/rendering, remaining PDF/image commands/history,
RF-03 native IME/view adapters, RN-05 plugin/accessibility/complete interaction
acceptance and RP-01 native shells/views on the other platforms remain mandatory.
This is not closure of the complete CubeOffice Rust rewrite.

Physical-device work is explicitly deferred by the user ("先不管真机，把能做的做完").
No new unlock request, install, launch or device-data mutation is part of this
batch. Local build evidence and final artifact identity are recorded below.

Final local delivery: the iOS, Android and HarmonyOS resource payloads and the
CubeOffice desktop renderer all built successfully. Their 14 external WASM hashes,
embedded synchronous-module bytes and dependency notices match the source builds.
The normal signed Release of **CubeOffice 文档 1.8.1** (`com.cubexp.office`, build
`1008001`) also built successfully at
`apps/ios/build/cubeoffice-native-delivery/Build/Products/Release-iphoneos/AuroraPrimeOffice.app`.
Codesign, its embedded module/notices and absence of XCTest bundles were checked.
The shared-kernel npm pack dry run includes its WASM, synchronous entry, declarations,
README, license and third-party notices; no package or app was published. No Git
push was performed. Local evidence is in `.cache/notes-qa/ofd-final-*`,
`ofd-delivery-*`, `raster-*-tests.log` and `ofd-strokes-benchmark.log`.

### Mobile PDF mutation authority — planned next local batch

Concrete remaining bypass: `apps/harmony/web/src/mobile/pdf-operations.ts` still
loads pdf-lib for page rotation/deletion/reordering, signature PNG insertion and
image-to-PDF creation. These functions feed existing controls; replacing them
must preserve the controls and PDF contents, including existing forms/annotations.

| ID    | Mandatory acceptance                                                               | State                                                                                                                                                              |
| ----- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| PM-01 | Detached page rotate/delete/reorder with inherited geometry/resources              | Accepted: original flat/inherited page order, rotations, text, resources and invalid-page behavior; a source-inheritance loss in the original move helper is fixed |
| PM-02 | Signature PNG placement, alpha and all quarter-turn page rotations                 | Accepted: all quarter turns and inherited pages compare original PDF.js/native pixels, forms, annotations and opaque metadata                                      |
| PM-03 | PNG/JPEG-to-PDF creation without a JS writer                                       | Accepted: PNG/JPEG, mixed multi-page raster PDFs and the original default empty A4 page compare dimensions/pixels; OFD browser/Node writers now share Rust         |
| PM-04 | Atomic errors, readonly/concurrent host contract and unrelated object preservation | Accepted: original bytes, fields/annotations and opaque trailer references are preserved; invalid requests/uploads/frames cannot replace valid session state       |
| PM-05 | Existing UI integration and deliverable artifacts                                  | Accepted locally: host/native/Chromium/WebKit, all production payload hashes/notices and normal signed app identity. Physical testing remains deferred             |

Implement against the pinned upstream Rust PDF parser/object model, without editing
upstream sources. The original pdf-lib helper will be retained only as an independent
development oracle. The parent rewrite remains open until these and the other
mandatory ledger rows are accepted.

PM-03 scope addition from a concrete production bypass: OFD's browser and Node
PDF exporters also call pdf-lib solely to package rendered PNG pages. Reuse the
same Rust image-PDF writer for this path, with a single bounded binary frame and
one serialization pass; do not implement repeated append/reparse per page.
Acceptance adds original multi-page sizes/pixels and the existing OFD conversion
tests. PDF.js/native canvas rasterization remains an explicit output adapter.

### Mobile PDF mutation and raster writer acceptance — 2026-10-25

PM-01–04 are accepted. `crates/formats-core/src/pdf` now uses the pinned upstream
Rust PDF object model for page rotate/delete/move, signature PNG placement and
PNG/JPEG image-PDF writing. The same one-pass batch writer replaces both OFD
browser/Node raster-PDF writers. The production mobile helpers and OFD converters
contain no pdf-lib imports; pdf-lib is retained as a development oracle dependency.
Existing Vue controls, async helper APIs, revision checks and host history are
unchanged. This does not close native PDF viewing or wrapper-history migration.

Acceptance uses 19 independent original outputs: flat and inherited page trees,
four signature rotations, inherited-page signatures, PNG/JPEG, mixed raster page
sizes, and the empty writer's original default A4 page. PDF.js pixels, dimensions,
rotation/order, text, forms, annotations and opaque metadata agree. The original
inherited-page move output loses its MediaBox/resources; that counterexample is
explicitly tested against the intact source pages instead of reproducing the
corruption. Rust now materializes those inherited values before changing parents.

21 host/WASM PDF tests and four native PDF tests pass, including invalid page/box
requests, failed PNG uploads, truncated/overflow/trailing batch frames, independent
calls, source-byte preservation, and opaque trailer-reference retention. A batch
uses one graph and one final write, not an append/reparse loop. Sweep traversal
borrows object values so it does not clone every image stream. Signature image
bytes use the raw upload extension and never JSON numeric arrays.

Shared regression: all 182 OFD tests and the existing 45 text/EPUB tests pass;
the complete native formats/writer suite passes 38 tests. Chromium and WebKit
exercise the actual mobile PDF helpers, multi-page TIFF previews, OFD page pixels,
cold synchronous writers and crypto/color provider recovery. The color callback
borrow guard also covers returned array accessors and provider-owned error getters.
Its regression confirms a callback cannot reenter or close the borrowed Rust
instance while its result/error is being read.

Retained bindings: OS/browser image rasterization, PDF.js viewing, libxml2 XSD,
security/trust and ICC providers; these are explicit and are not reported as
complete native platform UI. Remaining mandatory work includes RF-03 native text
views/IME; RF-04 Office layout/native rendering, PDF/image wrapper history and
image text/ink commands; RN-05 plugin/accessibility/full native interaction
acceptance; and RP-01 native shells/format views across desktop, Android,
HarmonyOS and the remaining iOS formats. The complete rewrite remains open.

PM-05 final delivery hashes/signing are recorded after the final packaging pass.
Physical-device work remains explicitly deferred by the user.

Final compatibility addition: two concrete RGB/RGBA TIFF counterexamples used a
same-sized LZW strip with Predictor=2. The compatibility copy path skipped the
original provider's post-copy byte-order/predictor step. It now performs that
step explicitly (the normal decoder already does), with checked layout arithmetic.
The independent image corpus is now 86 cases, all lossless pixels match exactly;
the OFD suite has 184 tests. These cases are generated from fixed seed 17 and a
7×2 image in the normal fixture generator. This reopens only the affected codec
and delivery checks, which are repeated for the final source build.

Final delivery acceptance (PM-05): all four final resource payloads—iOS, Android,
HarmonyOS and desktop renderer—built successfully. Each payload and the signed
normal iOS app contain the source-matching 14 external WASM artifacts, exact
embedded synchronous module and dependency notices. `codesign --verify --deep
--strict` passes for **CubeOffice 文档 1.8.1**, `com.cubexp.office`, build `1008001`;
no separate app or device installation is part of this user-deferred batch.
The final npm pack dry run contains the compiled modules/types and notices, and
`git diff --check` passes. No publication or Git push was performed.

Closure: PM-01–05 and OR-01–07/IR-01 are accepted for their stated portable/local
boundaries, including the two additional Predictor counterexamples. The final
regression set is 184 OFD + 21 PDF + 45 text/EPUB + 38 native tests (288 tests),
plus Chromium/WebKit and 12 profile integration tests. Async mobile PDF/TIFF
helpers snapshot source bytes before awaiting module loading; browser regression
mutates the caller's PDF/PNG arrays immediately after a call and confirms the
operation still uses its detached input. The final evidence is in
`.cache/notes-qa/migration-final-*`, `provider-*`, `snapshot-browser.log`,
`accepted-*`, `pdf-accepted-*` and `rust-final-profile-tests.log`.

The whole application rewrite remains open for the mandatory native layout/UI,
wrapper-history, remaining image commands, notes plugin/accessibility and other
platform items listed above. None is silently removed from scope or marked complete.

### iPad board extent regression — 2026-10-31

The native file-list creation path called `createNotebook()` without the existing
infinite-board argument, producing `infinite:false`. The native canvas still
painted paper across its body, but `Surface::position` clamped Pencil samples to
595.28×841.89. A regression reproduced an incoming x=760 being stored as 595.28.

The file-list entry now creates an infinite board, matching the other editor
creation paths. Native ink retains checked world coordinates. A paged/legacy
board becomes infinite only if committed pen/highlighter/shape points cross its
paper bounds; mode and content are one atomic history step. Cancelling a stroke,
readonly rejection and merely opening an existing file do not change its mode or
history. Original paper dimensions, layers and contents are retained. Missing
`infinite` flags now consistently mean infinite during fit/resize/add-page, as
already specified by both model validators.

Acceptance covers every built-in pen and highlighter across bottom/right,
negative and >10,000pt world coordinates, translated/zoomed views, live and
committed Metal pixels, shape previews/cancel, save/reopen and undo/redo. The host
regression executes the actual new-note function and reads back the archive sent
to the native editor. A hosted UIKit/Metal regression exercises a synthetic old
paged file through Pencil touch callbacks, then saves/reopens and checks history.
No user files are used. Final results/build evidence are recorded after checks.

Extent acceptance: 40 targeted native tests pass (6 extent, 11 input, 16 tools,
7 UI), including real offscreen wgpu/Metal pixel checks; 9 native-file bridge,
camera projection and actual file-list creation host tests pass. The added hosted
iPad mini simulator test passes through production UIKit Pencil callbacks and
Metal rendering, verifies off-page pigment in the expected screen area, undoes
and redoes the combined edit, then saves/reopens and checks visible ink/history.
The current camera's framing may reset on reopen; content is compared in world
coordinates by the Rust roundtrip tests rather than requiring identical viewport
framing for a legacy paged-to-infinite conversion.

The device/simulator XCFramework and iOS Web payload were rebuilt. Evidence:
`.cache/notes-qa/extent-before.log` (original clamp reproduced),
`extent-final-tests.log`, `extent-native-regression.log`,
`extent-host-regression.log`, `extent-hosted-simulator.log`, and
`extent-ios-library-build.log`. Physical-device installation remains deferred as
previously requested; simulator execution does not establish a new physical-device
Pencil acceptance result. The same CubeOffice app identity is retained.

The normal signed iOS Release also built successfully at the existing native
delivery path; codesign and its embedded Web payload/module hashes/notices pass,
with `com.cubexp.office` retained and no XCTest bundle in the delivery app.
No device install or Git push was performed in this fix.
