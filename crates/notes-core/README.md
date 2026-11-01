# CubeOffice notes Rust core

Portable notes authority for native hosts and the current WebView adapters. Owns
document validation, atomic page/document transactions, readonly/revision checks,
200-step/32 MiB history, detached save snapshots, `.cubenote` v1 ZIP/history and
guarded XOPP XML/gzip interchange. Existing photo/background transforms, masking
tape footprints, path erasures, brush versions/seeds/settings and scenes survive
roundtrips. Brush validation metadata is checked against the existing registry by
the cross-language parity test.

Also implements all 10 current/legacy built-in brushes, SVG scenes and an optional
native CPU renderer. Typed coalesced input, velocity pressure, immutable render
snapshots, retained base pixels and cropped ink previews power the separate iOS QA
surface. Complete native editor interactions and platform shells remain open in
[the rewrite ledger](../../docs/rust-rewrite.md).

## Build and checks

From the distribution root:

```sh
rustup toolchain install 1.88.0 --profile minimal --target wasm32-unknown-unknown
npm run build:notes
npm run test:notes
npm run test:notes:native
rustup target add --toolchain 1.88.0 aarch64-apple-ios aarch64-apple-ios-sim
npm run build:notes:ios-native
```

`build:notes` compiles the locked Cargo sources, validates the WASM artifact and
copies it beside the TypeScript adapter. Each WebView payload build verifies that
the packaged bytes match the built kernel. Generated WASM and `target/` are ignored;
the packaged npm `dist/` includes the binary. Native artifacts can be built with
`cargo build --locked -p cubeoffice-notes-core --lib --release --target <target>`
using a Rust compiler with that target installed. iOS requires the Apple SDK.
Use `cargo fmt -p cubeoffice-notes-core`; do not recursively format upstream.

With the notes viewer on 5178, `node packages/notes/tests/rust-render-parity.cjs`
compares exported PNG pixels before/after Rust save/reopen and undo in Chromium
and WebKit. `save-performance.cjs` covers drawing during background serialization,
cancellation, revision isolation and redo; browser timing is not iPad ink latency.

## Native API

`include/cubeoffice_notes.h` exposes one opaque document handle per open notebook.
Serialize calls for each live handle. Request/open replies are UTF-8 JSON; save
replies are package bytes. Copy output before making another call. Return `0`
indicates success; request/codec errors return `1` with a JSON error reply.

Successful projections use `wireVersion: 1`: `document.pages` and frame pages contain
IDs; `pagePool` supplies new immutable pages and `photos` supplies new raster strings.
Page image sources reference `@wire-photo:<id>`. Retain entries listed by `keepPages`
and `keepPhotos`; reconstruct external document values before exposing them to the
host. Only this transport envelope uses references: saved files contain ordinary
document/photo data. `initSave` returns status without a projection. Reinitializing
or opening a document starts a new pool. The TypeScript runtime implements this
contract and preserves shared page/image identities.

With `native-renderer`, `cube_surface_input` receives C `InputSample` batches directly.
Capture a `cube_surface_frame` on the input thread; its independent frame may render
on a worker using `cube_surface_render_layers`. Copy the full base pixels only when
`NativeLayerInfo.base_changed` is true; other output is a cropped transparent ink
patch positioned by the returned pixel rectangle. A zero-size patch clears live ink.
Pixels are premultiplied RGBA8. Font bytes are supplied explicitly by the OS adapter;
the renderer blocks external resource loads and bounds surfaces/embedded rasters.
Native surface save acknowledgment requires both `documentEpoch` and `revision`
from the captured document's state. A delayed save from another open document is ignored.

`cube_notes_snapshot` captures immutable Arc-backed state on the document thread.
Its independently owned snapshot may be encoded on a background thread using
`cube_notes_snapshot_save`, while live transactions continue. Destroy it exactly
once with `cube_notes_snapshot_free`. Acknowledge only the revision captured for
the successful save; a later edit must stay dirty.

WASM uses upstream's common browser ABI version 1 (`office_open/request/save` and
owned output bytes), one instance per document. Host projections preserve immutable
stroke identities for the existing paint cache. Saving runs the same Rust codec in
a Web Worker; hosts without Workers run the same Rust code without changing authority.

## Compatibility boundaries

- `.cubenote` v1 and its optional v1 history are retained. Unknown current-document
  metadata is preserved; historical frames follow the existing title/page schema.
- XOPP rejects unsupported images, tape, path masks and brushes instead of dropping
  their appearance. Legacy JS plugins materialize custom pressure widths in the host
  adapter; a native custom renderer must provide those widths for XOPP export.
- Existing synchronous TS codecs/history remain compatibility APIs and test oracles.
  The default Vue and headless Office sessions use Rust, with no silent JS kernel fallback.
