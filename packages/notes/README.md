# CubeOffice Notes

CubeOffice's own paginated handwriting editor, using the same Vue surface on desktop, Android, iOS and HarmonyOS. It owns its notebook model, editing history, pointer interactions and UI. Xournal++ is a file interchange reference; its application and GPL editor code are not embedded. The small MIT-licensed `perfect-freehand` library generates pen outlines.

## Features

- Resizable page sidebar with remembered width, keyboard adjustment and double-click reset.
- Fixed physical pages, page thumbnails, insertion, duplication, reordering and deletion.
- Ballpoint (uniform width), fountain (gentle pressure) and brush (expressive pressure), with per-type color/width settings. Tap the active Pen or Pen settings to switch.
- Pen with real stylus pressure, highlighter, whole-stroke eraser, lasso selection and dragging.
- Stroke colors and thickness, separate pen/highlighter presets, selection recoloring and duplication.
- Straight lines, rectangles, ellipses, editable text boxes, layers and page bookmarks.
- Blank, ruled, grid and dotted paper; paper colors, A4/A5/Letter and orientation.
- Undo/redo with a single transaction per stroke, erasing gesture, selection move or page operation.
- Pen-only writing by default; fingers pan, two-finger gestures zoom. Finger drawing is opt-in using the footer Touch button. Touch contacts during pen writing are ignored.
- Direct selection with an anchored color/action bar, corner resize handles and keyboard scaling. Alignment guides, equal-gap feedback, optional 20pt grid snapping and Alt/Option bypass.
- Editable rectangle/ellipse connections: drag a side arrow to another shape or empty paper; endpoints follow move/resize and deletion is undoable.
- Named scene bookmarks save a selected region or visible viewport, with jump, rename, ordering and deletion across pages.
- Floating tool dock with three quick color/width presets, contextual pen settings and a secondary shapes panel. Writing fills the workspace and paper defaults to its available width.
- Chinese and English labels, keyboard commands, native modal focus behavior, small-screen layouts, dark mode and reduced-motion support.
- Existing host New/Open/Save, file associations, recent previews and mobile local-draft recovery.

## Source navigation

| Module                               | Responsibility                                                           |
| ------------------------------------ | ------------------------------------------------------------------------ |
| `src/model.ts`                       | Versioned document schema, physical coordinates and validation limits    |
| `src/codec.ts`                       | Native archive and guarded Xournal XML interchange                       |
| `src/history.ts`                     | Transactions, undo/redo and revision-aware save acknowledgement          |
| `src/manipulation.ts`                | Selection transforms, alignment/grid/spacing and connected shape anchors |
| `src/geometry.ts`                    | Hit testing, lasso selection, movement and shape geometry                |
| `src/render.ts`                      | Canvas appearance and safe SVG thumbnails                                |
| `src/vue/sidebar-resize.ts`          | Page rail resizing, pointer/keyboard handling and local UI preference    |
| `src/vue/canvas.ts`                  | Pointer capture, pen/palm handling, gesture cancellation and navigation  |
| `src/vue/editor.ts`                  | Notebook tools, pages, paper, layers, live text and export UI            |
| `src/pdf.ts`                         | Appearance-only PDF export                                               |
| `src/office.ts`, `src/office-vue.ts` | Headless session and graphical host contribution                         |
| `src/thumbnail.ts`                   | Recent-file preview integration                                          |

## Native file format

`.cubenote` is a ZIP archive with these two entries:

- `mimetype`: UTF-8 `application/vnd.cubexp.notebook+zip`.
- `notebook.json`: UTF-8 JSON matching the exported `Notebook` type. The root has `format: "cubeoffice-notebook"`, `version: 1`, `title` and `pages`.

Pages contain ordered layers; layers contain ordered stroke/text elements. Coordinates, font sizes and stroke widths use points (1/72 inch). An optional stroke `penStyle` (`ballpoint`, `fountain`, `brush`) retains the chosen pen; older strokes without it keep their original pressure curve. Xournal exports flatten these pen types to segment widths, retaining width variation rather than pen-type identity. Pressure values are normalized to `[0, 1]`; optional per-point widths preserve imported Xournal segment widths. Text `x/y` identify its top-left origin. Optional stroke `shape` identifies `line`, `rectangle` or `ellipse`. A connector is still a renderable stroke with `connector: { from: { elementId, side }, to: { elementId, side } }`; anchor sides are `top`, `right`, `bottom`, `left` and both targets must be same-page rectangles/ellipses. Optional page `scenes` contain `{ id, name, x, y, width, height }` in physical points (up to 200 per page). These additive fields retain version-1 compatibility and are preserved in native saves. Paper, visibility and bookmark settings remain editable. All content is local and offline.

The reader validates versions, identifiers, finite coordinates and resource limits: 64 MiB compressed/expanded input, 1,000 pages, 100,000 elements and 2 million ink points. Unknown schema versions are rejected. No external file or network reference is followed.

## Interchange boundaries

`.xopp` and `.xoj` support basic solid-background pages, layers, pen strokes including segment widths, constant-width highlighters and simple text. Gzip XML, plain XML and ZIP `content.xml` are accepted. XML declarations with entities/DTDs are refused. Unsupported content (images, PDF backgrounds, audio-linked objects, filled/dashed strokes, non-round caps, transformed/wrapped/aligned text and configured paper) stops import with a clear error; the original bytes are never rewritten.

Xournal export produces gzip XML with physical coordinates and segment widths. It rejects dotted paper, bookmarks, named scenes and hidden layers instead of silently dropping those settings. Native archives preserve these features. Shape and connector appearance exports as ordinary Xournal strokes; their object identity and connections remain native-only. Stroke appearance is rendered by CubeOffice, so this is basic interchange rather than a claim of pixel-identical Xournal++ rendering.

PDF export renders visible page appearance at up to 2× resolution (maximum edge 2,400 pixels). Handwriting, backgrounds and CJK text stay visible; exported pages are images, not editable ink or searchable text. Keep `.cubenote` for further editing.

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
```

The browser suite uses installed Chrome, writes screenshots and exported notebooks/PDFs to `.cache/notes-qa`, and checks mouse/pen writing, palm contacts, erasing, lasso, history, live-text export, failed/stale saves, readonly transitions and responsive layouts. It checks PDF page count as well. Stylus latency, actual palm rejection and native save dialogs still need hardware QA on each supported OS.

Research and design decisions: [CubeOffice notebook UX](../../docs/cubeoffice-notes.md).

Freeform-inspired controls: use the lasso to click an item or circle several, drag a corner (Shift keeps proportions), and use the adjacent settings for width/alignment/distribution. A selected rectangle or ellipse shows connection arrows; there is also an Add connected shape button. The header Snapping button configures guides/grid. Save scene captures the selection or current visible area; the left Scenes tab navigates across pages. `node tests/freeform.cjs` checks these interactions against the source preview.
