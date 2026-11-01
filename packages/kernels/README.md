# @cubexp/kernels

The shared Rust WASM host used by CubeOffice's text, EPUB, OFD and mobile PDF
implementations. Its distribution includes `dist/formats-kernel.wasm`; it does
not fetch executable code from an external service or select a JS fallback.

```ts
import { loadFormatsKernel, FormatsKernel } from "@cubexp/kernels";
await loadFormatsKernel();
const document = new FormatsKernel("text");
document.open(new TextEncoder().encode("hello"));
document.request({ op: "set", text: "changed" });
const bytes = document.save();
document.close();
```

The text/EPUB/OFD packages provide the normal application-facing APIs; the raw
commands are owned by `crates/formats-core`. One instance represents one
document. Loading is asynchronous and cached; subsequent operations are
synchronous and return owned copies. Call `close()` when retaining a document
is no longer necessary. Standard browser ABI v1 allocation/output rules are
preserved. OFD's separately versioned binary upload extension transfers raw
parts without JSON/base64 expansion.

Build in the distribution workspace with `npm run build:kernels`, using the
pinned Rust 1.88.0 toolchain and wasm32-unknown-unknown target. Native consumers
use the same Rust library modules. See
[`crates/formats-core/README.md`](../../crates/formats-core/README.md) for owners,
limits, checks and the remaining renderer/platform migration boundaries.

`@cubexp/kernels/sync` retains the existing synchronous image-OFD/DOCX writer
contracts, including a cold first call. Its small stateless Rust module is embedded
in the generated JS, compiled once on demand and instantiated per write. This
avoids introducing an asynchronous API or a JavaScript fallback. Input images cross
as one bounded binary frame; XML and ZIP are produced by the same Rust source used
by native consumers. The pinned build script regenerates `writer-generated.ts`;
this generated file must not be edited or committed. `packages/ofd` exposes the
normal public writer API. Final device-scale OFD SVG updates and their geometry
helpers use the same synchronous module to preserve the viewer/export contracts.
The main asynchronous document module stays lazy.

OFD drawing uses the `cubeoffice_ofd_host_v1.color` import when a color provider is
registered with `setColorProvider`. It receives small color/profile-path metadata;
profile bytes are prefetched before entering Rust. Host exceptions become structured
error replies. Calling a kernel method or `close()` from inside a provider is
rejected, and the instance remains usable after a provider error. Native Rust
callers implement `ofd::render::ColorHost` directly.

`renderBegin` snapshots the package; `setPart(path, bytes, true)` uploads temporary
render parts and `setRenderAsset(key, bytes)` uploads fonts. `renderEnd` releases
temporary state. Binary destinations are consumed atomically by the v1 upload
extension, so a failed preparation cannot target a previously prepared part.

`THIRD_PARTY_LICENSES.txt` is regenerated from the locked Rust dependency closure,
including original copyright/license text and versioned source-archive links.
The package includes it; the shared delivery plugin emits the same bytes into
all four production payloads. Asset checks reject missing or stale notices.

Mobile PDF helpers create a `FormatsKernel('pdf')`, open bytes, then request
`pageOperation` or upload a PNG through `setPdfImage` before `signature`. Saves
return detached owned PDF bytes; errors never replace valid session state.
`imageMime` in the constructor options selects PNG/JPEG-to-PDF creation. These
commands preserve the existing application's async helper and revision/history
contract; they do not replace the PDF viewer or native platform UI.

`writePdfImages(pages)` packages PNG/JPEG raster pages in one Rust serialization
pass. Each page specifies raw bytes and page width/height in PDF points. The
binary frame is bounded to 128 MiB and 1000 pages; there is no image-byte JSON
expansion or per-page reopen loop. OFD's browser and Node exporters use this API.
