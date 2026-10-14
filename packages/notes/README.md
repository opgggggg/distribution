# CubeOffice Notes

CubeOffice's own paginated handwriting editor, using the same Vue surface on desktop, Android, iOS and HarmonyOS. It owns its notebook model, editing history, pointer interactions and UI. Xournal++ is a file interchange reference; its application and GPL editor code are not embedded. The small MIT-licensed `perfect-freehand` library generates pen outlines.

## Features

- Resizable page sidebar with remembered width, keyboard adjustment and double-click reset.
- Fixed physical pages, page thumbnails, insertion, duplication, reordering and deletion.
- Infinite graphical boards: grid fills the body; pan in every direction and pinch to zoom the drawing. Navigation composites a bounded bitmap with a small cached border; long pans refresh adjacent ink at reduced resolution and restore full quality at release. New strokes update the ink overlay and append to unchanged paper without repainting older ink. Immutable stroke vectors use a bounded LRU cache. Tool glyphs do not rebuild on every gesture frame. Pages, scene bookmarks, tape and undo history work in world coordinates. PNG/PDF and previews include the complete visible artwork, independently of the current view. Xournal imports retain bounded paper and can be expanded in Paper settings.
- Ballpoint (uniform width), fountain (gentle pressure), Chinese brush (bamboo silhouette, tapered ink and adjustable dry texture), pencil (paper grain), watercolor (soft translucent washes), marker (broad ink), crayon (waxy grain) reed (angled calligraphy), spray (deterministic scattered pigment) and oil paint (pigment ridges and bristle texture), with per-type color/width/pressure settings. Watercolor also remembers color strength (10–100%) and supports widths up to 60 pt. Choose a pen directly in the mobile tray; tap it again for settings. Reed supports a 0–180° nib angle.
- Pen with real stylus pressure or velocity-based finger pressure (slow writing is thicker, fast writing thinner), highlighter, whole-stroke eraser, lasso selection and dragging. The pressure toggle enables both; ballpoint remains uniform.
- Stroke colors and thickness, separate pen/highlighter presets, selection recoloring and duplication.
- Straight lines, rectangles, ellipses, editable text boxes, layers and page bookmarks.
- Blank, ruled, grid and dotted paper; paper colors, A4/A5/Letter and orientation.
- Undo/redo with a single transaction per stroke, erasing gesture, selection move or page operation. Native saves and local recovery drafts retain both stacks and their cursor, up to 200 steps and a bounded history payload.
- Pen-only writing by default; fingers pan, two-finger gestures zoom. Finger drawing is opt-in using the footer Touch button. Touch contacts during pen writing are ignored.
- Direct selection with an anchored color/action bar, corner resize handles and keyboard scaling. Alignment guides, equal-gap feedback, optional 20pt grid snapping and Alt/Option bypass.
- Editable rectangle/ellipse connections: drag a side arrow to another shape or empty paper; endpoints follow move/resize and deletion is undoable.
- Named scene bookmarks save a selected region or visible viewport, with jump, rename, ordering and deletion across pages.
- Floating tool dock on desktop; draggable pen silhouettes on mobile/iPad, undo/redo, a two-row tablet color palette, scrollable tools and contextual width/strength/angle settings. Writing fills the workspace and paper defaults to its available width. Native application chrome stays at a fixed scale while the canvas handles pinch zoom. Toolbar labels are nonselectable; text fields retain selection.
- iPad custom colors retain the iOS system picker. HarmonyOS, Android and standalone mobile previews use an in-app replica measured against the native iPadOS palette: the 120-color 12×10 grid, vertical rainbow spectrum, RGB sliders and numeric fields, HEX entry, opacity and persistent color samples. It remembers the active tab. Eyedropper uses the system sampling API where available, with an in-board sampler otherwise; no browser color popup is opened. Interrupted input clears touch contacts before the next stroke. A topbar Pages button opens the page list in both reading and editing modes; zoom and export remain in the host’s More menu.
- Masking tape under More tools: add a strip or a four-edge frame, drag with one finger, rotate with two fingers or a handle, resize the endpoints, adjust width, paint and peel. Placement uses a compact action bar and visible angle snapping instead of a large settings panel. Captured tape footprints preserve clean white space in native files, undo/redo, previews, PNG and PDF; adjusting or peeling tape never reveals paint underneath. Tape overlays are omitted from exports.
- Chinese and English labels, keyboard commands, native modal focus behavior, small-screen layouts, dark mode and reduced-motion support.
- Existing host New/Open/Save, file associations, recent previews and mobile local-draft recovery.
- Current-page PNG image export, numbered PNG images for every page in a ZIP archive, and multipage PDF export through the host's file picker.

- Spray pigment is appended without resampling earlier particles; a saved pigment seed survives copying and reopening. Rendering revisions preserve the appearance of existing ink while new strokes use the revised materials.
- iPad/finger canvas gestures use complete touch-contact sequences. Interrupted input clears all contacts, one remaining finger pans, and pinch scales the current bitmap before a final sharp redraw.

- Registered [brush plugins](docs/brush-plugins.md) provide metadata, pressure curves, rendering and generated parameter controls. Includes a working charcoal extension example.

## Source navigation

| Module                               | Responsibility                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| `src/model.ts`                       | Versioned document schema, physical coordinates and validation limits         |
| `src/codec.ts`                       | Native archive and guarded Xournal XML interchange                            |
| `src/history.ts`                     | Transactions, undo/redo and revision-aware save acknowledgement               |
| `src/manipulation.ts`                | Selection transforms, alignment/grid/spacing and connected shape anchors      |
| `src/geometry.ts`                    | Hit testing, lasso selection, movement and shape geometry                     |
| `src/texture.ts`                     | Deterministic paper grain shared by Canvas and SVG, with bounded tile caching |
| `src/render.ts`                      | Canvas appearance and safe SVG thumbnails                                     |
| `src/vue/sidebar-resize.ts`          | Page rail resizing, pointer/keyboard handling and local UI preference         |
| `src/vue/canvas.ts`                  | Pointer capture, pen/palm handling, gesture cancellation and navigation       |
| `src/vue/editor.ts`                  | Notebook tools, pages, paper, layers, live text and export UI                 |
| `src/pdf.ts`                         | Appearance-only PDF export                                                    |
| `src/image.ts`                       | Full-page PNG rendering shared with PDF, and numbered image ZIP export        |
| `src/office.ts`, `src/office-vue.ts` | Headless session and graphical host contribution                              |
| `src/thumbnail.ts`                   | Recent-file preview integration                                               |

## Native file format

`.cubenote` is a ZIP archive with these base entries:

- `mimetype`: UTF-8 `application/vnd.cubexp.notebook+zip`.
- `notebook.json`: UTF-8 JSON matching the exported `Notebook` type. The root has `format: "cubeoffice-notebook"`, `version: 1`, `title` and `pages`.
- Optional `history.json`: `cubeoffice-note-history`, version 1, with `past`, `future` and a deduplicated page pool. Each frame stores its title and page references; nonnegative indices address the pool and negative index `-n-1` addresses page `n` of the current document. Stack order retains the current undo/redo cursor. Old files without history remain supported.

History is capped at 200 steps and 32 MiB uncompressed, within the shared 64 MiB document/archive budget. If necessary, export trims the farthest states first. Each historical page and frame is validated before use. Undoing to previously saved canvas content still counts as a persistent change when the redo stack differs; this ensures local autosave keeps redo available after restart. Pending text drafts export as one additional undoable transaction. Save acknowledgement applies only to the revision delivered by the host.

Pages contain ordered layers; layers contain ordered stroke/text elements. Coordinates, font sizes and stroke widths use points (1/72 inch). An optional stroke `penStyle` (`ballpoint`, `fountain`, `brush`, `pencil`, `watercolor`) retains the chosen pen; older strokes without it keep their original pressure curve. Xournal exports flatten ballpoint, fountain and brush to segment widths, retaining width variation rather than pen-type identity; pencil and watercolor require native or appearance export. Pressure values are normalized to `[0, 1]`; optional per-point widths preserve imported Xournal segment widths. Text `x/y` identify its top-left origin. Optional stroke `shape` identifies `line`, `rectangle` or `ellipse`. A connector is still a renderable stroke with `connector: { from: { elementId, side }, to: { elementId, side } }`; anchor sides are `top`, `right`, `bottom`, `left` and both targets must be same-page rectangles/ellipses. Optional page `scenes` contain `{ id, name, x, y, width, height }` in physical points (up to 200 per page). These additive fields retain version-1 compatibility and are preserved in native saves. Paper, visibility and bookmark settings remain editable. All content is local and offline.

The reader validates versions, identifiers, finite coordinates and resource limits: 64 MiB compressed/expanded input, 1,000 pages, 100,000 elements and 2 million ink points. Unknown schema versions are rejected. No external file or network reference is followed.

## Interchange boundaries

`.xopp` and `.xoj` support basic solid-background pages, layers, pen strokes including segment widths, constant-width highlighters and simple text. Gzip XML, plain XML and ZIP `content.xml` are accepted. XML declarations with entities/DTDs are refused. Unsupported content (images, PDF backgrounds, audio-linked objects, filled/dashed strokes, non-round caps, transformed/wrapped/aligned text and configured paper) stops import with a clear error; the original bytes are never rewritten.

Xournal export produces gzip XML with physical coordinates and segment widths. It rejects dotted paper, bookmarks, named scenes and hidden layers instead of silently dropping those settings. Native archives preserve these features. Shape and connector appearance exports as ordinary Xournal strokes; their object identity and connections remain native-only. Stroke appearance is rendered by CubeOffice, so this is basic interchange rather than a claim of pixel-identical Xournal++ rendering.

PDF export renders visible page appearance at up to 2× resolution (maximum edge 2,400 pixels). Handwriting, backgrounds and CJK text stay visible; exported pages are images, not editable ink or searchable text. Keep `.cubenote` for further editing.

PNG export uses the same renderer and resolution, includes the complete page rather than the visible viewport, and omits selection controls. `exportFile("png")` exports the active page; `exportFile("png-zip")` packages all pages as `page-001.png`, `page-002.png`, etc. Image archives are limited to 64 MiB of PNG data; individual pages can still be exported separately. Exports include pending text and visible layers, work in reading mode, and preserve the notebook's dirty state and save path.

## Integration and persistence

Register `NOTES_ARTIFACT_PLUGIN` from `@cubexp/notes/office` for headless creation/open/export. Register `NOTES_VUE_FORMAT_CONTRIBUTION` from `@cubexp/notes/office-vue` and import `@cubexp/notes/style.css` for UI. The desktop external profile and mobile lazy engine already register this contribution.

The UI exposes `getNotebook`, `getRevision`, `isDirty`, `subscribe`, `exportFile`, `saveFile`, `undo`, `redo` and `setDocumentName`. The headless session exposes `getNotebook` and transaction-based `update` in addition to the shared artifact interface.

Exports do not clear dirty state. `saveFile({ deliver })` acknowledges the captured revision only after successful delivery; cancellation, I/O failure and later edits keep the document dirty. Plain `saveFile()` without a delivery callback cannot acknowledge a persisted file. Export commands use the host's `export` intent, which never replaces a notebook with PDF bytes or rebases its save path.

Unfinished text is included in autosave snapshots without closing the text editor. Its transient revision changes on input. Switching to reading mode commits pending text before it removes editing controls.

## Development checks

From the distribution root, after building the upstream core/UI and other profile packages:

```sh
npm run test:notes
npm run test:open-formats
npm exec vue-tsc -- -p apps/harmony/tsconfig.json --noEmit
```

For interaction and visual checks:

```sh
npm exec vite -- --host 127.0.0.1 --port 5178
node packages/notes/tests/browser.cjs
node packages/notes/tests/export.cjs
node packages/notes/tests/phone.cjs
```

The browser suite uses installed Chrome, writes screenshots and exported notebooks/PDFs to `.cache/notes-qa`, and checks mouse/pen writing, palm contacts, erasing, lasso, history, live-text export, failed/stale saves, readonly transitions and responsive layouts. It checks PDF page count as well. Stylus latency, actual palm rejection and native save dialogs still need hardware QA on each supported OS.

Research and design decisions: [CubeOffice notebook UX](../../docs/cubeoffice-notes.md).

Freeform-inspired controls: use the lasso to click an item or circle several, drag a corner (Shift keeps proportions), and use the adjacent settings for width/alignment/distribution. A selected rectangle or ellipse shows connection arrows; there is also an Add connected shape button. The header Snapping button configures guides/grid. Save scene captures the selection or current visible area; the left Scenes tab navigates across pages. `node tests/freeform.cjs` checks these interactions against the source preview.

Pencil texture is deterministic and uses pressure for width and overall graphite tone. Watercolor supports soft edges and transparent stroke layering with optional finger velocity pressure; it is a basic wash brush, without wet pigment diffusion. The canvas, SVG thumbnails, PNG and PDF retain these brush appearances. Native files retain editable brush identity and strength. Xournal export rejects pencil/watercolor because that format cannot preserve these textures; export PNG/PDF or save `.cubenote` instead.

To verify the new brushes with the notes test viewer running on port 5178, run `node packages/notes/tests/art.cjs` from the repository root. It exercises actual pointer input, tone/grain/soft-edge pixels, watercolor layering and strength memory, native/PNG/PDF export, undo and mobile layout. Model and format checks also run with `npm run test:notes`.

History persistence checks: `npm run test:notes` and, with the notes viewer (5178) and mobile host (5179) running, `node packages/notes/tests/history-persistence.cjs`. The browser check reopens partially undone files, preserves redo on blank pages, exports a live text draft, and reloads a real mobile IndexedDB autosave before redoing its strokes.
