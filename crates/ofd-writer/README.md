# Synchronous OFD compatibility module

The existing image-OFD, text-DOCX and final device-scale SVG helpers are synchronous,
including their first call. This small stateless WASM entry compiles the same Rust
`ofd/write.rs` and `ofd/strokes.rs` used by native consumers; it does not fetch the
full asynchronous document kernel or fall back to JavaScript implementations.

`packages/kernels/sync` lazily compiles the embedded module once and creates an
independent instance per call. Images use one bounded binary input frame. Output
uses Office browser ABI v1 owned-byte conventions. Failed frames do not replace a
previous valid output. The base ABI and public OFD APIs stay unchanged.

Build and notices: `npm run build:kernels` (Rust 1.88.0, locked dependencies).
Acceptance: `cargo test --locked -p cubeoffice-ofd-writer`, OFD writer fixtures and
`packages/ofd/tests/rust-strokes.mjs`, then Chromium/WebKit and production asset
hash checks. Generated WASM/base64 is never edited or committed.
