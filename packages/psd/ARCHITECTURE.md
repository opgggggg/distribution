# PSD package architecture

## Layering

```
src/codec/    binary reader/writer, PackBits, PSD read/write, descriptor codec
src/render/   compositor, raster ops (brush/fill/bucket/dodge/burn/clone),
              filters, geometry ops (flip/rotate/gradient/shape), layer
              effects, selection rasterization
src/editor/   actions.ts (union + descriptors + validator),
              reducer.ts (behavior), session.ts (revision, undo/redo)
src/ai*.ts    AI manifest (data), guards (policy), errors, runtime API
src/artifact-plugin.ts + format-manifest.ts
              headless ArtifactEngine lifecycle and capability contribution
src/vue/      PsdEditor / PsdViewer, tool strip, stage, panels, parameter
              dialogs on the shared editor shell, plus the Vue format contribution
```

Rules:

- Every core layer is DOM-free: compositing, filters, and effects are pure
  math over RGBA arrays, so node tests and the browser agree exactly. Only the
  Vue layer touches canvas (for display, PNG export, and text rasterization).
- Descriptors (`actions.ts` metadata) describe actions; the reducer applies
  them. The AI manifest is data; `ai.ts` is the only dispatcher.
- Unparsed PSD sections travel through the document model as opaque byte
  ranges and are re-emitted verbatim on save (source preservation).
- The headless root exports `PSD_FORMAT_MANIFEST` and `PSD_ARTIFACT_PLUGIN` and
  never imports Vue. The `/vue` entry exports `PSD_VUE_FORMAT_CONTRIBUTION`;
  Desktop and focused apps register it at their composition root.

## Selections

A selection is a serializable descriptor (rectangle, ellipse, polygon, or a
pixel mask from a magic-wand pick) plus an `inverted` flag, stored on the
document so undo restores it. `rasterizeSelection` derives a canvas-sized
coverage mask on demand, and the reducer slices that mask to layer-local space
before handing it to any pixel operation — that single path is what makes
"edit only inside the selection" true for fills, strokes, adjustments,
filters, gradients, and shapes alike. Selections never serialize into the PSD
file.

## Document model

`PsdDocument` holds canvas size, color mode, resolution, preserved blocks, and
a layer tree (`PsdLayerNode = raster | text | group`). Layer pixels are
immutable `PsdBitmap` values (RGBA `Uint8ClampedArray`); edits replace the
bitmap of the touched layer only, which keeps undo snapshots structural.

## AI surface

Follows `docs/office-ai-action-design-standard.md`: bounded batches (1–100),
manifest discovery with TS-style signatures, JSON Schema per command, response
byte budgets (whole-pixel reads are refused, list reads page), readonly
sessions hide write commands, and write results report
created/affected/deleted ids diffed from digests.
