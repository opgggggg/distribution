# @cubexp/psd

Migrated from `openfilekit` branch `origin/codex/psd-editor-profile` (af45ad3626decf6a9190dfe11c2d8aa27d020294). Uses the distribution workspace’s `@yaochn/als-office-*` core and UI packages.

PSD (Adobe Photoshop document) headless artifact plugin, source-preserving codec,
layer compositor, and Vue viewer/editor with a Photoshop-style workspace built
on the shared editor shell.

## Features

- **Codec** — reads and writes 8-bit RGB/grayscale PSD files (Raw and RLE
  compression). Groups, layer masks, unicode names, lock flags, and text layer
  content are parsed; every unparsed section is preserved byte-for-byte and
  written back unchanged.
- **Compositor** — pure-pixel bottom-up compositing with 19 blend modes,
  group/layer opacity, bitmap masks, and clipping masks. No DOM required, so
  node and the browser produce identical output.
- **Layer masks** — create reveal/hide/selection masks, invert, enable, disable or
  delete them without changing image pixels. Select the mask thumbnail to paint
  black/white with live preview, fill, feather, link/unlink or transform the mask
  independently. Layer and group masks survive PSD save; operations participate
  in undo/redo and the AI command surface.
- **Selections** — rectangle, ellipse, lasso polygon, and magic wand, plus
  select-all/deselect/inverse. Selections live on the document (undo restores
  them) and constrain every pixel operation.
- **Painting** — brush, eraser, clone stamp (aligned or reset per stroke, current-layer
  or all-visible-layer sampling, live preview), dodge, burn, paint bucket,
  gradients (linear/radial), and shapes (rectangle/ellipse/line).
- **Curves adjustment layers** — editable RGB and per-channel curves, cubic
  interpolation, opacity, blend modes and masks. Preview/cancel and point dragging
  or numeric editing; persisted as native PSD `curv` blocks. Other adjustment
  commands below remain destructive pixel operations.
- **More live adjustments** — levels with channel histograms/auto levels, hue/saturation
  with six hue ranges and colorize, exposure in linear light, and gradient maps
  with editable stops. Native `levl`, `hue2`, `expA`, and `grdm` PSD blocks; preview,
  cancel, re-edit, masks and undo/redo. Rendering is not Photoshop pixel-certified.
- **Film grain layer** — editable amount, size, roughness and seed; deterministic
  monochrome grain without changing source pixels. PSDs containing grain store a
  standard flattened view plus one embedded editable PSD (up to 128 MiB). This
  editor restores layers only while the visible view matches; other editors see
  a flat layer. Private-data removal loses editable layers. No Photoshop smart
  filter or Compositor pixel-for-pixel equivalence is claimed.
- **Retouch** — local blur on pixels or masks, spot healing, and selection-based
  content-aware fill with optional merged-layer sampling. Deterministic exemplar
  repair is limited to 65,536 affected pixels per operation; photo-quality and
  large-canvas performance parity with Compositor have not been established.
- **Adjustments & filters** — brightness-contrast, hue-saturation, levels,
  color balance, exposure, vibrance, black & white, invert, grayscale;
  gaussian blur, unsharp sharpen, noise, pixelate, threshold, posterize.
- **Layer styles** — drop shadow, stroke, and outer glow, rendered
  destructively into the layer's pixels.
- **Transforms** — per-layer flip/rotate (including arbitrary angles) and
  scale, retaining original image pixels across repeated transforms and saves;
  whole-image flip, rotate, resample, canvas resize, and crop preserve masks.
  Pixel edits establish a new transform source. Masks are resampled on transform.
- **Editor** — `PsdEditorSession` with transactions, undo/redo history, and a
  typed action union.
- **Artifact plugin** — `PSD_ARTIFACT_PLUGIN` detects native bytes and adapts
  PSD sessions to the shared `ArtifactEngine` for Desktop, CLI, and focused apps.
- **AI surface** — `createPsdAiApi` exposes a bounded, manifest-driven command
  API following the repository's office AI action design standard.
- **Vue components** — `PsdEditor` / `PsdViewer` compose the shared
  `UiEditorShell`: a six-tab ribbon on top, a 17-tool Photoshop-style strip on
  the left, and Properties/History + Layers docks on the right, with
  parameter dialogs for every adjustment, filter, and layer style.
- **Vue contribution** — `PSD_VUE_FORMAT_CONTRIBUTION` mounts the editor through
  `UiArtifactFormatRegistry` without teaching a Host about PSD component APIs.

## Usage

```ts
import { readPsd, writePsd, composePsdDocument } from "@cubexp/psd";

const document = readPsd(await file.arrayBuffer());
const bytes = writePsd(document);
```

```ts
import { ArtifactEngine } from "@yaochn/als-office-editor-core";
import { PSD_ARTIFACT_PLUGIN } from "@cubexp/psd";

const engine = new ArtifactEngine([PSD_ARTIFACT_PLUGIN]);
const session = await engine.open({ source: file, fileName: file.name });
const result = await session.execute?.({ commands: [{ type: "context.get" }] });
const saved = await session.export();
```

```vue
<script setup lang="ts">
import { ref } from "vue";
import { PsdEditor } from "@cubexp/psd/vue";

const appearance = ref<"light" | "dark">("dark");
</script>

<template>
	<PsdEditor
		:source="source"
		file-name="artwork.psd"
		v-model:appearance="appearance"
		:show-appearance-toggle="true"
		:show-ribbon-group-labels="true"
	/>
</template>
```

The three appearance props pass through to `UiEditorShell`. `appearance` can
also be controlled with `v-model:appearance`; the titlebar theme toggle and the
Ribbon group labels default to visible in `PsdEditor`.

## Fidelity boundaries

- 8-bit RGB/RGBA and grayscale PSD documents are editable (Raw/RLE only).
- 8-bit CMYK PSD opens read-only when its Raw/RLE composite can be decoded;
  conversion is approximate and does not apply ICC profiles.
- PSB, non-8-bit, indexed, Lab and other unsupported modes fail with an explicit
  conversion hint. ZIP-compressed layer data is not editable.
- Any failed layer or mask decode disables editing and PSD export. A decoded
  composite is required for this read-only fallback; otherwise opening fails.
- Blend modes with a native canvas equivalent render exactly; the remaining
  modes fall back to normal and are flagged in the layers panel.
- Text layers expose their text content for reading, search, and content
  edits; glyph rendering uses canvas fonts, so rendering is approximate.
- Layer styles and generic adjustment commands are destructive. Curves, Levels,
  Hue/Saturation, Exposure and Gradient Map also have editable native PSD
  adjustment layers. Film Grain remains editable here using private metadata;
  its standard PSD export is flattened for compatibility.
- Whole-image and per-layer transforms retain masks. Linked layer masks follow
  transforms; an unlinked mask stays at its own canvas position.

## Persistence of non-destructive edits

Curves use native PSD adjustment data (`curv`). The exported standard layer
channels always contain the currently transformed image. Original RGBA pixels
and the affine matrix are additionally stored in a versioned private `cXfm`
layer block; mask linkage is stored in `cMsk`. This is **not** a Photoshop smart
object. Other editors display the baked image and may discard private metadata.
When the baked pixel checksum no longer matches, this editor discards the stale
transform source. Keeping original pixels increases PSD size by roughly four
bytes per original pixel. Transform sources are limited to 80 megapixels.

The new action surface includes `curves.set` (omit `layerId` to create a layer),
`stroke.apply` with `target: "mask"`, `mask.edit` (fill/feather/transform), and
`layer.mask` link/unlink. `layers.list` reports curves, mask state and retained
transform-source dimensions. Selections constrain mask painting, filling and
feathering; mask transforms operate on the whole mask.

## Compositor editing workflows

`PsdWorkspace` adds independent project tabs, unsaved-change protection, new
canvas dimensions/resolution/transparent backgrounds, cross-project layer
copying, Copy Merged (cropped by selection), and clipboard image projects.
`PsdEditor` remains available for hosts that already manage document tabs.

Motion Blur and Lens Correction join the existing filters. Generic filter,
adjustment and effect dialogs preview without adding history, cancel cleanly,
and commit one transaction. Rounded rectangles, Shift-click brush lines,
Option-centered crop, crop snapping, layer/mask selection loading, shared
multi-layer transforms and Free Distort are available. Perspective transforms
retain original pixels in `cXfm` version 2; affine version 1 remains readable.

TIFF imports its first image and applies EXIF orientation using UTIF. Local
macOS foreground segmentation and HEIC decoding are available through the
optional image-services adapter; see [native integration](native/README.md).
CubeOffice packages the macOS helper and connects it through trusted Tauri
profile-service IPC. A local unsigned app has been built and tested; release
signing and Windows/Linux segmentation providers remain separate work.

Large documents use viewport-bounded canvases and a 64 MiB tile cache.
`test:performance` benchmarks tile composition; `test:quality` compares 44
opaque/transparent cases with original C and Apple rendering on macOS. Three
blend modes retain documented semantic differences. See the repository report
`docs/psd-performance-quality-native.md` for measurements, scope and limits.

The detailed feature and verification checklist is maintained in the
repository's `docs/psd-compositor-parity.md`; algorithmic and platform differences
remain and this package is not a pixel-identical Compositor clone.

Compositor-derived portions are attributed in [third-party notices](THIRD_PARTY_NOTICES.md).

## Agent workflow and binary resources

Use the exposed editor `aiApi()` or `executeCommands()` / `getCommandManifest()`.
A transport must forward the API; this package does not open an unauthenticated
HTTP or MCP endpoint. Vue and artifact hosts require `baseRevision` on writes.
Low-level `createPsdAiApi` integrations should set `requireRevision: true`.

```ts
const context = api.getContext();
const layers = await api.execute({ type: "layers.list" });
// Choose a pixel layer ID from the returned items.
const result = await api.execute(
	{ type: "background.remove", layerId, advanced: true, refineEdges: 4 },
	{ baseRevision: context.revision, requestId: "remove-bg-1" },
);
const preview = await api.execute({ type: "document.preview", maxDimension: 1024 });
const resourceId = preview.values[0].resourceId;
// Download binary chunks through the host; do not insert them into model context.
const chunk = await api.execute({ type: "resource.read", resourceId, offset: 0 });
// Continue at nextOffset until complete, then release the resource.
await api.execute({ type: "resource.release", resourceId });
```

- Discover `background.remove` only when a foreground service is attached.
  `context.capabilities` reports backgroundRemoval, preview, export, and save.
  Async mask generation rejects a changed document instead of applying stale pixels.
- Upload raw one-byte-per-pixel masks using `resource.create` (declared length),
  sequential `resource.write` chunks, then `mask.fromResource` with width/height,
  resourceId, layerId and baseRevision. Chunks decode to at most 48 KiB; storage
  is capped at 64 MiB and 64 resources per session. Release handles after use.
- `document.preview` accepts x/y/width/height and maxDimension. The input region
  is capped at 16 megapixels; output longest edge defaults to 1024, maximum 2048.
  Large canvases require regional previews. `document.export` accepts png/psd;
  PNG export has the same 16-megapixel budget. Both return binary resource handles
  tagged with the rendered revision, not filesystem save receipts.
- `document.save` is advertised only with a persistence handler. Vue hosts can
  pass `persistPsd(blob, {fileName, revision})`, or the format service `psdPersist`.
  Return persisted:true only after actual storage succeeds. The desktop PSD host
  first asks for a destination, then uses atomic writes and disk fingerprint checks.
  Writes do not automatically open save dialogs. Read the persistence result:
  cancellation is persisted:false; export alone never marks a document saved.
- Supply a stable requestId (operationId is an alias) for retryable requests.
  Concurrent and later retries with identical input return the original result,
  including the original revision, without repeating effects. A reused ID with
  different input is rejected. `request.get` queries pending/completed/failed or
  unknown. After a failed/cancelled operation, use a new ID for a new attempt.
  The ledger retains up to 256 requests until session destruction; reaching the
  limit refuses new IDs instead of evicting entries that might still be retried.
- Mixed read/write batches are atomic for document state, history and subscribers.
  Single-command services (including reveal, resource, render, save and foreground
  operations) are explicitly marked non-batchable in the manifest. The native
  processing call itself is awaited; closing the API prevents a late mask commit.

Headless artifact requests use `operationId`, `baseRevision` and `commands`.
The artifact export method supports PSD and PNG; headless persistence remains the
responsibility of its filesystem/CLI host. Native foreground processing is a host
capability, not a built-in headless dependency.
