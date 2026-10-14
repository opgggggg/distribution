# CubeOffice handwritten notebook

## iPad audit — 2026-10-13

This pass covered the notebook workspace, library entry, pen selection/settings, colors, page navigation in writing and reading, masking tape, selection gestures, undo/redo persistence, image/PDF export, and app-versus-canvas zoom. It used an isolated test notebook on the connected iPad mini (6th generation), iPadOS 27.0.1, plus responsive browser checks for portrait, landscape, Split View-sized and keyboard-sized viewports in both themes. The native host uses the same safe-area and keyboard constraints and `WKWebView` canvas implementation as the shipping app. User documents were not used as test fixtures.

Fixed:

- Pen input no longer repaints existing ink on each frame. An appended stroke is composited into unchanged paper; full redraws remain for erasing, selection transforms and document replacements.
- Pans use a cached border of adjacent ink and compositor transforms. Long travel refills that border at lower resolution while navigating, then restores sharp ink at release. Pinch and pan share stable viewport coordinates.
- Immutable ink references survive page transactions. A bounded LRU reuses compiled brush paths; its weight estimate is capped at 48 MiB, and individual canvas buffers stay below 8 million pixels and 4096 px per side. These are cache/allocation bounds, not limits on total process memory.
- Landscape pen trays now start centered. A more specific legacy writing-dock rule previously overrode the new tray positioning and caused clamping to align the tray left.
- Page/scene tabs and bookmark filters have 44 pt touch targets on the mobile workspace.

Measured on the real iPad, using 96 strokes × 90 points across Chinese brush, watercolor, pencil, crayon, spray and oil. Values are `requestAnimationFrame` intervals around synthetic app input, not a measurement of physical Apple Pencil latency:

| Workload  | Before: mean frame interval | After: mean frame interval |
| --------- | --------------------------: | -------------------------: |
| Drawing   |                    222.2 ms |                    16.3 ms |
| Short pan |                    236.1 ms |                    17.1 ms |
| Pinch     |                     16.6 ms |                    16.7 ms |

Drawing release processing, including two frame waits, fell from 722 ms to 33 ms. Drawing performs zero full paper redraws during the gesture and at commit; short pan and pinch perform zero during the gesture and one at release. The added long-pan test averaged 19.0 ms, with a 21 ms 95th percentile and a 71 ms maximum at a border refill. Occasional boundary hitches remain in this deliberately dense material fixture. A pinch following a long pan has a different visible region, so its release time is not presented as a direct before/after comparison.

An Instruments Activity Monitor capture was also recorded on-device. Peak physical footprints in that short synthetic workload were approximately 11.1 MiB for the test host, 425.1 MiB for its WebContent process, and 117.5 MiB for its GPU process; peak reported CPU percentages were 5.6%, 59.0%, and 58.5%, respectively. This is a short stress sample, not a long-term leak certification or a guarantee for larger notebooks. Trace exports and raw metrics are kept locally under `.cache/notes-qa/ipad-audit-*`.

Verification: 47 model/codec/history/brush tests, iPad responsive and dark-mode checks, pen tray bounds/dragging, native color-input recovery, interrupted contacts, canvas-only zoom, masking tape, saved undo/redo, and PNG/PDF exports passed. The zoom anchor error was under 0.35 px in the browser pixel check. Real Pencil force, physical typing and native Split View gestures still require hands-on coverage; the corresponding responsive sizes and modeled input paths were checked here. The updated main app was built and installed over the existing iPad app, preserving its data container.

This feature adds a local, editable handwritten notebook to CubeOffice's existing document workspace. It follows the distribution's shared Vue/WebView architecture: a CubeOffice-owned editor renders inside every host, with host-owned files, tabs, save dialogs and recovery. It does not launch another note application or embed its UI.

## Research and adopted interactions

Reviewed on 2026-10-11 against official product documentation:

| Reference                                                                                                                         | Relevant behavior                                                                      | CubeOffice decision                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Goodnotes pen controls](https://support.goodnotes.com/hc/en-us/articles/7353756785679-Write-and-customize-ink-with-the-Pen-tool) | Contextual color/width presets; constant or pressure-sensitive ink                     | Pen and highlighter remember their own colors and widths; pressure is optional                             |
| [Goodnotes sidebar](https://support.goodnotes.com/hc/en-us/articles/9497798035983-Use-the-Sidebar-to-navigate-your-document)      | Thumbnail navigation, bookmarks and page management                                    | Collapsible thumbnail sidebar, bookmarks filter, page operations with keyboard-accessible reorder controls |
| [Goodnotes templates](https://support.goodnotes.com/hc/en-us/articles/7353728093199-Import-and-manage-custom-notebook-templates)  | Paper templates form part of notebook creation/page insertion                          | Immediate grid-page creation; change paper in place and inherit it for added pages                         |
| [Notability getting started](https://support.gingerlabs.com/en-us/articles/16300108-getting-started-with-notability)              | Tools and presets grouped near writing; translucent highlighting; selection; undo/redo | Pen, highlighter, stroke eraser, lasso and pan stay together; advanced paper/layer actions use dialogs     |
| [OneNote notes](https://support.microsoft.com/en-us/onenote/take-and-format-notes)                                                | Handwriting and typed text coexist and move freely                                     | Text boxes coexist with vector ink; lasso moves both                                                       |
| [Xournal file model](https://xournal.sourceforge.net/manual.html#file-format)                                                     | Physical pages containing layers and ordered ink/text objects; widths per segment      | Same basic structure, independent of view zoom; retain imported widths                                     |

[Goodnotes’ redesigned document view](https://support.goodnotes.com/hc/en-us/articles/13682253498767-Improved-User-Interface) also informed the compact tool hierarchy: a floating dock keeps pen, highlighter, eraser, selection, pan and text directly accessible. Shapes open a secondary panel. Three color presets and three width presets stay beside the tools; width presets have distinct visual sizes and numeric labels; tapping the active writing tool or the palette opens its full settings.

These are interaction references, not copied screen designs. The UI uses CubeOffice's indigo accent, restrained chrome, neutral workspace and a paper-centered layout. Existing file/history screens remain the notebook library, so users do not need a second storage system.

## End-to-end flow

1. Choose **New → CubeOffice Notes / 手写笔记**. One grid A4 page is ready immediately.
2. Write with a mouse or stylus. When pressure is enabled, real pen pressure changes width; finger writing simulates pressure from speed, with slow strokes thicker and fast strokes thinner. Fingers move the page unless finger writing is enabled.
3. Switch tools directly. Choose ballpoint, fountain, brush, pencil, watercolor, marker, crayon or reed; each remembers its color/width/parameters. Tap an active mobile pen again to adjust its settings. Marker provides broad smooth ink, crayon provides a waxy grain, and reed provides an angled nib with a 0–180° angle control. Real stylus input supplies pressure; finger writing uses a smoothed speed curve for fountain/brush when pressure is enabled. Ballpoint, mouse writing and pressure-off strokes use the chosen nominal width. Pencil has deterministic paper grain and pressure-responsive width/tone; watercolor has soft translucent washes, a color-strength control and widths up to 60 pt. Their appearance is retained in SVG thumbnails and PNG/PDF export; `.cubenote` retains editable brush settings. Xournal export refuses these two textures to avoid silently flattening them. Watercolor is a basic wash effect, without wet pigment simulation. Ink colors/thickness are adjacent; highlighter presets start with yellow. The eraser removes whole strokes; lasso selection moves, duplicates, deletes or recolors content.
4. Add a page from the sidebar or page actions (also the footer on desktop). Pages inherit the current paper. Page actions duplicate, reorder, bookmark or delete; deletion/clearing are confirmable and undoable.
5. Save a native `.cubenote` through the host. Mobile hosts keep local drafts through their existing revision-based recovery system. Export a PDF for sharing or basic `.xopp` for interchange.

Desktop/tablet layouts have a collapsible sidebar aligned immediately below the notebook header, alongside the writing area and its tool dock. Drag the sidebar edge to resize it (160–440 px); arrow keys adjust a focused separator, and double-click resets it. Width is a local UI preference, independent of the notebook. The tool dock adapts to the remaining canvas width. Phones show one page with scrolling and an on-demand sidebar. Desktop uses a compact toolbar. Mobile/iPad uses a draggable floating tray with recognizable pen silhouettes, undo/redo and colors. Pens scroll horizontally when needed; tablets show two rows of colors. Settings are anchored above/below the moved tray. Mobile hosts omit the duplicate notebook title. The writing body fills the remaining workspace; paper defaults to the available width and scrolls vertically. Full color/width settings, shapes, paper and layer actions use secondary panels. Paper stays the same physical size across platforms. Zoom changes only the view.

## Integrity and editing invariants

- A stroke, erasing gesture, selected-content move or page operation is one undo step.
- Pointer cancellation discards incomplete ink; it cannot commit a partial eraser action.
- Palm contacts during a pen stroke do not cancel the stroke. Pen eraser-tip input selects the eraser transiently.
- Reading mode allows navigation/export and removes mutation controls; it does not reset the notebook or undo stack.
- Autosave can capture unfinished text without dismissing the text editor.
- Dirty state is acknowledged only after the host has delivered that revision. An older save cannot clear later edits.
- Exporting a PDF never overwrites/rebases the native notebook.
- Unsupported imported content produces a visible error before editing; it is not silently discarded.

## Scope

The implementation covers the core handwritten notebook workflow, physical pages, pressure ink, text, simple shapes, paper templates, layers, bookmarks, history and file persistence. Searchable handwriting/OCR, audio recording, cloud collaboration, PDF/image backgrounds and images/stickers are separate feature additions. No placeholder controls claim these capabilities.

The native format and module navigation are documented in [the notes package](../packages/notes/README.md). Its `.cubenote` schema is public and versioned; Xournal remains an import/export boundary, rather than defining every CubeOffice product feature.

## Acceptance

- Model/codec tests: native round-trip, Xournal widths and alpha, unsupported-content rejection, safe text thumbnails, readonly sessions, undo and stale-save acknowledgement.
- Browser interactions: actual pointer writing and erasing, pressure and palm input, selection duplication/deletion, live text, readonly transitions, page/paper/bookmark controls and PDF export.
- Visual checks: 375×812 and 390×844 phones, 1024×768 tablet, 844×390 landscape and 1280×900 desktop; light/dark and reduced-motion modes.
- Host integration: desktop/mobile renderer builds, mobile types, generated file-association checks and existing profile regression tests.

Automated browser input does not replace real Apple Pencil/S Pen/HarmonyOS stylus and native save-dialog checks. Latency and OS-level palm handling should be verified on devices before a release.

## Freeform interactions (2026-10-12)

The paginated notebook borrows Freeform's lightweight floating controls and direct manipulation, with CubeOffice's system typography, purple accent and grid paper retained. Ink/shape properties now open in compact nonblocking popovers. A contextual bar follows the selection and stays within the viewport; corner handles resize ink/text, and Shift retains proportions. Alignment/distribution commands also work without dragging.

Resize handles and connection anchors share the canvas's live move/resize geometry, including proportional text scaling. `node packages/notes/tests/selection-preview.cjs` verifies positions while the pointer is held, continuity after release, and restoration on cancellation; the mobile touch test also checks handle positions before release.

- [Drawing controls](https://support.apple.com/en-ie/guide/freeform/frfm6e3d132d2/5.0/mac/27): select ink directly and edit near it.
- [Alignment](https://support.apple.com/guide/freeform/align-items-frfma75f5f63/mac): live edge/center guides, equal-gap cues, optional 20pt grid and Alt/Option bypass.
- [Connections](https://support.apple.com/en-euro/guide/freeform/frfm1e6c3d3e/mac): selected rectangles/ellipses show four side arrows. Drag to connect an existing shape, or preview/create the next shape on empty paper. Connections follow move/resize, copy remaps internal endpoints, and deleting an endpoint removes attached connections in the same undo transaction.
- [Scenes](https://support.apple.com/en-ie/guide/iphone/iphbe64aa259/ios): named region bookmarks capture a selection or current view. The left Scenes tab supports cross-page navigation, rename, ordering, deletion and undo. Read-only notebooks permit navigation without edits.

The native schema stores optional shape/connector metadata and up to 200 scenes per page; old notebooks still load. PDF and thumbnails retain connector appearance. Xournal flattens shape/connector appearance to strokes and refuses named scenes to avoid silently losing bookmarks.

## Mobile validation (2026-10-12)

Built and ran the current iOS target on an iPhone 17 Pro simulator (iOS 26.5). Exercised finger ink, shape creation/connections, the system Save picker, byte-level native-file validation, draft recovery after reinstall/relaunch, named scene creation/navigation, and the on-screen keyboard. The simulator is left available as `CubeOffice Notes QA iPhone`. Physical stylus pressure remains a device check.

Mobile fixes keep selection actions in one 54px row with 44px touch targets, place the page/scene drawer above canvas controls, keep manipulation targets mounted through drags, prevent host button gestures/native dragging from interrupting handles, use a movement threshold before snapping, and use 16px text inputs to prevent iOS focus zoom. `node packages/notes/tests/phone.cjs` covers real touch events through the shared mobile shell, resize geometry and connection updates, tap-with-snap stability, named scenes, file contents and 375/390/414px portrait plus landscape layouts.

## Freeform phone layout (2026-10-12)

PNG and PDF sharing are available under View options → Export on phones and Export in the desktop header. Current-page PNG exports the entire page at up to 2× resolution; all-page images are numbered and delivered as a ZIP archive. PDF preserves page count, physical dimensions and appearance. All three use the same page renderer, including grid/background, visible ink and Chinese text, and omit selection/tool overlays. The export suite verifies PNG pixels, page choice/names, ZIP ordering, PDF page dimensions, reading mode and cancellation; the mobile host suite checks each export and confirms a subsequent native save still contains the original editable notebook.

The phone UI follows Apple's [iPhone Freeform composition](https://support.apple.com/guide/iphone/get-started-with-freeform-iphb86e84e2b/26/ios/26) and [drawing interaction](https://support.apple.com/guide/iphone/draw-or-handwrite-iphe749c1957/26/ios/26): floating back/history/share controls over the canvas, a single bottom tool capsule, and a second tap on the active pen to open its properties. Drawing mode has pen, highlighter, eraser, selection and the current color; Done returns to pen/text/shapes insertion controls. Pages/scenes and view options open from the two bottom corner buttons. Finger drawing is enabled initially on phones. The page covers the available viewport initially, while View options still offers fit width and explicit zoom values; panning and pinch zoom remain available.

The mobile shell no longer duplicates its title/status and editor action bars during note editing, and read mode exposes Edit in the floating navigation. Desktop controls retain their existing layout. Browser tests verify the full-height writing surface, a bottom dock under 60px tall, single-row controls, 375/390/414px widths, landscape, pinch input, ink, selection/connection geometry and save contents. The iPhone 17 Pro simulator also verifies native finger drawing, undo, properties and the page drawer; reinstalling the current build preserves the prior notebook draft.

Native `.cubenote` files and mobile recovery drafts now retain undo/redo stacks and the current cursor. An optional `history.json` stores shared page versions once, bounded to 200 steps/32 MiB within the total archive limit. Legacy files remain readable. A redo-stack change remains dirty even if undo returns to saved canvas content, so autosave can preserve it. Browser QA includes real mobile IndexedDB save, host reload and redo restoration.

Brush metadata, pressure response and shared Canvas/SVG rendering are registered through the public `BrushPlugin` API. Numeric plugin parameters are generated in the settings panel, stored in native files and retained by history. See [brush plugin integration](../packages/notes/docs/brush-plugins.md) and [the charcoal example](../packages/notes/examples/charcoal.ts).

Native mobile notes expose Pages directly beside Back in both reading and editing modes. Custom colors use the system picker, with contact state reset on color changes and backgrounding. Chinese brush silhouettes now use bamboo handles and pointed bristles; ink supports taper and dry texture. Spray and oil paint extend the same brush plugin registry with density and bristle controls. More tools → Masking tape offers strip/frame presets, direct dragging, width/length/rotation and peeling. Each stroke stores the tape footprints it was painted through, preserving white space after peeling, native history restoration and PNG/PDF export. Live tape overlays are editing guides and do not appear in exports.

The iOS workspace disables native WebView magnification and honors a fixed-scale viewport. The shared mobile shell also excludes browser pinch zoom in its chrome; notes continue to implement document zoom in the canvas. Toolbar, sidebar and popover text is nonselectable while editable fields retain selection. Masking tape now opens directly on the visible page with a compact action bar: one finger moves, two fingers rotate, endpoints resize, and a rotation handle provides an alternative. Angle feedback snaps lightly every 15°. Completed gestures create a single history entry; cancellation, mode changes and backgrounding discard uncommitted previews.

Spray revision 2 appends pigment from a persistent seed; extending a long stroke cannot change earlier particles, and copying its element preserves the seed. Native files retain renderer revisions so existing notes keep their original appearance. New oil strokes use flat pigment beds and restrained bristle ridges; pencil, crayon, watercolor, marker and Chinese ink have distinct texture/edge geometry. Canvas touch input uses complete TouchEvents for fingers and PointerEvents for Pencil/mouse/handles. Actual cancellation resets all contacts; normal capture loss after an up cannot cancel another finger. The remaining finger pans without zooming. During pinch, CSS scales the existing bitmap and a final redraw restores sharpness, avoiding repeated full-page rebuilds on a busy board. Regression tests replay sustained pinches, partial cancellation, backgrounding, one-finger drawing and deterministic pigment save/reopen/copy.

### Infinite boards

New graphical notebooks use `NotePage.infinite: true`. Older native pages without this field also open as expandable boards; explicit `false` retains fixed paper (including imported Xournal pages). Each board retains its own content/layers/scenes/tape and the notebook keeps its existing page navigator. A fixed page can be expanded in Paper settings as one undoable operation.

The viewport grid fills the body. The camera pans in all directions, including negative coordinates, through two-finger movement, the Hand tool, trackpad/wheel or arrow keys when no objects are selected. Two-finger pinch changes only the canvas; Show all fits the complete visible content. Selection handles, connections, tape and saved scenes use the same world coordinates. The renderer allocates only the visible bitmap (up to 4096 pixels / 8 million pixels), with adaptive grid spacing at overview scales; world travel never enlarges the bitmap.

Native files retain all world coordinates and undo/redo. SVG page previews, homepage previews, PNG and PDF include the complete visible artwork with margins, independent of the camera. PNG keeps its existing 2400-pixel maximum and large PDF pages scale to the PDF page-size limit. Xournal exports finite copies of boards that fit its 5000-point page constraint; larger boards require native/PNG/PDF export. Coordinates are checked for finite numeric values within ±1 billion points.

Validation: `tests/infinite.mjs` covers native/history roundtrips and finite compatibility. `tests/infinite.cjs` covers desktop/phone viewport fill, drawing beyond all four old page edges, constant bitmap allocation, pinch, scenes/tape at negative coordinates, complete PNG/PDF output, distant tape masks and overview navigation.
