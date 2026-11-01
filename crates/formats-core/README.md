# CubeOffice owned-format core

Portable Rust authorities used by `@cubexp/text`, `@cubexp/epub` and `@cubexp/ofd`, plus mobile PDF mutation commands. The library
builds as Rust rlib/staticlib and as the shared browser ABI v1 WASM module. It
does not own the operating system file service, DOM pagination, syntax highlighting
or platform IME. Those remain host adapters while native UI migration continues.

- `text.rs`: strict BOM/legacy decoding, bounded range decoding with 64-bit file
  offsets, persistent Rope buffer, UTF-16 edits, grouped 200-step/32 MiB history,
  selection restoration and detached save snapshots. Eight concurrent snapshots
  are allowed; the host queues destination writes. Failed/cancelled delivery
  never acknowledges a snapshot. Older acknowledgements cannot replace newer ones.
- `epub.rs`: indexed ZIP access with 256 MiB archive / 64 MiB resource / 16 MiB
  text limits, OPF metadata/manifest/fallback/spine, EPUB3 nav/NCX/fallback TOC,
  fixed layout, RTL, and IDPF/Adobe font deobfuscation. Original bytes remain
  available for lossless read-only export. HTML parsing uses html5ever rather
  than a browser DOM; rendering and sanitization still use the existing reader.
- `search.rs`: literal Unicode-insensitive search with original UTF-16 ranges,
  including lowercase expansions and contextual final sigma. The DOM host
  supplies sanitized text to preserve the exact display/anchor coordinate space.
- `ofd/mod.rs`: indexed and lazy ZIP access, canonical paths and source/expansion
  budgets, original-byte export, immutable opaque parts, atomic part replacement
  and original signature edit policy. `ofd/metadata.rs` owns version selection,
  document/attachment/outline/action/permission/view metadata; `ofd/xml.rs` keeps
  qualified names, namespace declarations, entities and CDATA inspection. The
  signature structure, signed-file reference comparison and result aggregation
  now use `ofd/signatures.rs`. Crypto and certificate trust remain explicit security
  provider bindings. `ofd/write.rs` supplies image OFD and editable-text DOCX XML/ZIP
  writers; the package-creation path also uses the Rust package authority.
- `ofd/render/`: complete OFD-to-SVG drawing authority, including ttf-parser font
  outlines, affine geometry, gradients/textures, clipping, templates, composites,
  annotations and signature stamp images. Native consumers call `render::render`
  with a `ColorHost`; the WASM host uses the versioned synchronous provider import.
- `ofd/validate.rs`: structural traversal, resource references, scoped IDs/types and
  ordered issue aggregation. Annex A XSD remains an explicit libxml2 host binding.
- `ofd/codecs.rs` and `ofd/fax.rs`: bounded BMP/TIFF-to-PNG decoding, orientation,
  bit fields/RLE, LZW/Deflate/PackBits/JPEG and Group-3/4 fax. Historical decoder
  quirks are retained by independent pixel goldens. OFD rejects multi-page TIFF;
  the image editor can decode one selected page while retaining the full source.
- `ofd/strokes.rs`: shared final device-scale stroke minima and SVG attribute
  updates. The existing synchronous zoom/export helpers use the same source
  through the small synchronous module.
- `pdf/`: detached mobile page rotation/deletion/reordering, signature PNG insertion
  and PNG/JPEG-to-PDF creation, built on the pinned upstream Rust PDF object model.
  Page moves materialize inherited geometry/resources before changing parents;
  mutations preserve existing object identity/forms/annotations and sweep unreachable
  objects on save. Failed validation/upload/mutation retains the previous document.
- `lib.rs`: per-document authority and browser/C ABI composition. Each WASM
  instance has independent state. Failure to load Rust is a visible error.

The OFD host uses distribution binary upload extension v1
(`cubeoffice_formats_upload`) after `preparePart`. It uses the standard allocation
and error/output conventions without serializing image/font bytes as JSON. The
base Office browser ABI remains unchanged. Input and returned resource arrays
are owned copies. XML/ZIP originals are never reconstructed for an unchanged save.

Build: `npm run build:kernels`. Checks: `cargo test --locked -p
cubeoffice-formats-core`, `node --test packages/text/tests/*.mjs
packages/epub/tests/*.mjs`, and `node scripts/tests/owned-format-browser.mjs`
after building text/EPUB/OFD. OFD's normal `test:built` includes the original
TypeScript metadata projection fixtures, generated from the pinned source commit
in `packages/ofd/tests/fixtures/rust-package-projection.json` with
`node scripts/generate-ofd-package-fixtures.mjs`. The browser check starts its own bounded Vite
server and exercises Chromium and WebKit; it does not require a device.

Native consumers can use the Rust modules directly. This is not a claim that
all platform UI adapters, Office layout or PDF conversion have migrated; the mandatory
remaining requirements are in `docs/rust-rewrite.md`.

The same stateless `ofd/write.rs` source is compiled through the minimal
`crates/ofd-writer` entry for the public synchronous writer APIs. Its generated
WASM is embedded by `packages/kernels/sync`, compiled on first use and instantiated
per call. It performs no async fetch and has no JavaScript writer fallback; the
full asynchronous text/EPUB/OFD instance remains separate. The pinned build script
generates both entries; production payload checks verify the external kernels and
this exact embedded writer. Native Rust callers use the same writer functions.

Signature interoperability fixtures are generated from the original implementation
at `43022d3584827e6adb89c18f1d7fa5b50ed17b21` by
`node scripts/generate-ofd-signature-fixtures.mjs`. Host and native tests verify ten
original signed/tampered/malformed packages, original versus Rust writer parts,
append protection, opaque namespace attributes, aborted/rejected providers and
strict reply routing. Signing stages operate on a private package snapshot; failed
providers cannot publish a partial archive or mutate the caller's source bytes.

Drawing compatibility is checked against the complete original implementation at
`43022d3584827e6adb89c18f1d7fa5b50ed17b21`, including original archive/font/paint
helpers. Eight full-page goldens compare semantic projections and actual pixels;
86 synthetic BMP/TIFF cases cover both byte orders, compression, palette, alpha,
orientations and malformed inputs. Device-scale fixtures cover 41 scalar geometry
projections and five pages at different scales. Provider errors are structured
replies; host callbacks cannot reenter or close a borrowed kernel instance.

Render assets and temporary decoded parts live in a private render snapshot;
`renderEnd` releases them without modifying original resources or save output.
Host-provided image/font bytes use direct binary upload, with a 128 MiB aggregate
asset budget. This preserves existing rendering APIs and does not replace native
platform views or prove physical-device Pencil performance.

The mobile PDF functions keep their existing async APIs and UI callers. A `pdf`
instance opens source bytes and applies `pageOperation` or `signature`; signature
PNG bytes use the same raw upload extension after `preparePdfImage`. An instance
configured with `imageMime` opens PNG/JPEG bytes as a new PDF. Output replaces
session state only after successful serialization and reopen. Browser viewing,
PDF history in the mobile wrapper and native PDF views remain separate migration
requirements. Tests compare the original helper at the same pinned commit via
PDF.js pixels, page dimensions/order/rotations, form values, annotations and
opaque catalog metadata. An original inherited-page move defect is intentionally
fixed by retaining the source page's geometry/resources.

`Session::image_pages` accepts a bounded batch frame for raster PDF serialization:
4-byte little-endian JSON-header size, UTF-8 `{pages:[{length,mime,width,height}]}`,
then concatenated image bytes. Width/height are PDF points. At most 1000 pages,
a 1 MiB header and 128 MiB total input/output are allowed. One object graph is
written once; it does not append and reparse every prior page. The browser/Node
OFD converters use this same writer. Empty input retains the original writer's
blank A4 page. OS/browser rasterization and PDF.js viewing remain host adapters.
