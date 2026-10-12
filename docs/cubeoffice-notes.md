# CubeOffice handwritten notebook

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
2. Write with a mouse or stylus. Real pen pressure changes width when enabled. Fingers move the page unless finger writing is enabled.
3. Switch tools directly. Tap the active pen to choose ballpoint, fountain or brush; each remembers its color/width. Real stylus input supplies pressure, while mouse writing uses the chosen nominal width. Ink colors/thickness are adjacent; highlighter presets start with yellow. The eraser removes whole strokes; lasso selection moves, duplicates, deletes or recolors content.
4. Add a page from the sidebar or page actions (also the footer on desktop). Pages inherit the current paper. Page actions duplicate, reorder, bookmark or delete; deletion/clearing are confirmable and undoable.
5. Save a native `.cubenote` through the host. Mobile hosts keep local drafts through their existing revision-based recovery system. Export a PDF for sharing or basic `.xopp` for interchange.

Desktop/tablet layouts have a collapsible sidebar aligned immediately below the notebook header, alongside the writing area and its tool dock. Drag the sidebar edge to resize it (160–440 px); arrow keys adjust a focused separator, and double-click resets it. Width is a local UI preference, independent of the notebook. The tool dock adapts to the remaining canvas width. Phones show one page with scrolling and an on-demand sidebar. The dock uses one row on desktop and two compact rows on phones, retaining direct access to primary tools. Mobile hosts omit the duplicate notebook title. The writing body fills the remaining workspace; paper defaults to the available width and scrolls vertically. Full color/width settings, shapes, paper and layer actions use secondary panels. Paper stays the same physical size across platforms. Zoom changes only the view.

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

The phone UI follows Apple's [iPhone Freeform composition](https://support.apple.com/guide/iphone/get-started-with-freeform-iphb86e84e2b/26/ios/26) and [drawing interaction](https://support.apple.com/guide/iphone/draw-or-handwrite-iphe749c1957/26/ios/26): floating back/history/share controls over the canvas, a single bottom tool capsule, and a second tap on the active pen to open its properties. Drawing mode has pen, highlighter, eraser, selection and the current color; Done returns to pen/text/shapes insertion controls. Pages/scenes and view options open from the two bottom corner buttons. Finger drawing is enabled initially on phones. The page covers the available viewport initially, while View options still offers fit width and explicit zoom values; panning and pinch zoom remain available.

The mobile shell no longer duplicates its title/status and editor action bars during note editing, and read mode exposes Edit in the floating navigation. Desktop controls retain their existing layout. Browser tests verify the full-height writing surface, a bottom dock under 60px tall, single-row controls, 375/390/414px widths, landscape, pinch input, ink, selection/connection geometry and save contents. The iPhone 17 Pro simulator also verifies native finger drawing, undo, properties and the page drawer; reinstalling the current build preserves the prior notebook draft.
