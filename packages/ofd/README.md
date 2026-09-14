# @cubexp/ofd

Independent OFD package maintained in `distribution/packages/ofd`, outside the
`als-office` submodule. It provides package editing, parsing, SVG rendering, a Vue
viewer, Office adapters, conversions, signature-provider APIs and XSD validation.
The implementation targets GB/T 33190—2016. See [CONFORMANCE.md](./CONFORMANCE.md)
for the clause mapping, source references, validation evidence and host boundaries.

```sh
npm install @cubexp/ofd
```

The install command applies after publishing. In this workspace:

```sh
npm run build:ofd
npm run test:ofd
npm pack --workspace @cubexp/ofd
```

## Read and convert

```ts
import { readOfdDocument, exportDocument } from "@cubexp/ofd";
const document = await readOfdDocument(file);
const result = await exportDocument(document, "txt", { page: 0 });
for (const { name, blob } of result.files) save(name, blob);
```

```ts
import { convertDocumentNode } from "@cubexp/ofd/node";
const pdf = await convertDocumentNode(file, "ofd", "pdf", { fileName: "invoice.ofd" });
const ofd = await convertDocumentNode(pdfFile, "pdf", "ofd");
```

| Input    | Output                         | Runtime                   |
| -------- | ------------------------------ | ------------------------- |
| OFD      | TXT, DOCX, SVG, HTML, Markdown | Browser or Node           |
| OFD      | PDF, PNG, JPEG                 | Browser canvas or Node    |
| PDF      | OFD                            | Node PDF.js/native canvas |
| PNG/JPEG | OFD                            | Node native canvas        |

Results contain named Blobs. Omit `page` to export all pages; `page` is zero-based
and applies to every output, including TXT/DOCX. `scale` defaults to 1.5 and must
be in (0, 8]; JPEG `quality` is in [0, 1]. DOCX reconstructs text and page breaks.
PDF conversions rasterize pages and do not preserve searchable text or signature
validity. Single-Blob Office conversions require a selected page for multi-file outputs.

## Lossless package access

```ts
import { openOfdPackage, createOfdPackage } from "@cubexp/ofd";
const pkg = await openOfdPackage(file);
console.log(pkg.documents); // Info, outlines, permissions, versions, attachments, extensions.
const attachment = pkg.attachment("attachment-id");
pkg.set("Doc_0/Extensions/data.xml", "<data>updated</data>");
const output = pkg.write();
```

An unchanged package is returned byte-for-byte. Changed packages retain every
untouched part, including unknown extensions and binary resources. Editing a signed
package requires re-signing or explicit `allowInvalidSignatures: true` when writing.
`createOfdPackage(parts)` accepts a map of XML strings and binary parts. Validate
new or edited packages before distribution; low-level editing does not manufacture
missing ID references or resource declarations.

`documentIndex` selects a document body. `version` selects a version ID; otherwise
a version marked `Current` is used when present.

## Rendering and viewer

```vue
<script setup>
import { OfdViewer } from "@cubexp/ofd/vue";
defineProps(["file"]);
</script>
<template><OfdViewer :source="file" file-name="invoice.ofd" /></template>
```

Rendering includes document/page/template resources, nested page blocks and
composites, inherited styles, path/text clipping, object boundaries, visible
annotation appearances, patterns and all four gradient types. BMP and single-page
TIFF resources are normalized to PNG. Embedded OpenType fonts become paths with
selectable text retained; explicit glyph mappings, direction, scale and synthetic
styles are supported. Matching fonts can be supplied through `ReadOptions.fonts`.

ICC profiles use bundled QCMS WebAssembly locally. `paintScale` controls gradient
samples per millimetre (default 192 DPI). `colorConverter` and `decodeImage` allow
alternate color engines and additional image codecs. `intent: "print"` omits
annotations with `Print="false"`.

The Vue viewer provides navigation, zoom, search, outlines, clickable action regions,
exports and browser media controls. It exposes attachment reading and honors read/
export permission declarations by default. `actionHost` can override navigation,
attachments, links and media playback. `preferences`, `permissions` and `action`
events let an application implement its window, print and platform policy. Automatic
external actions require an explicit host; parsing itself never executes actions.

## Signatures

```ts
import { signOfdDocument, verifyOfdSignatures } from "@cubexp/ofd";
const signed = await signOfdDocument(file, {
	signatureMethod: provider.method,
	provider: { name: provider.name },
	signedAt: provider.time,
	sign: (descriptor) => provider.sign(descriptor),
});
const results = await verifyOfdSignatures(signed, {
	verifySignedValue: (context) => provider.verify(context),
});
```

Reference integrity, cryptographic validity and certificate trust are separate
results. Without `verifySignedValue`, signature validity stays `unverified`.
GB/T 33190 delegates SignedValue encoding/security to other specifications;
CMS/SES, certificate chains, revocation and hardware keys belong to the provider.
The Node entry adds `nodeOfdDigest` (including SM3), `rawSignatureVerifier`,
`signOfdDocumentNode` and `verifyOfdSignaturesNode`.

## Validation

```ts
import { validateOfdPackage } from "@cubexp/ofd/validate";
const report = await validateOfdPackage(file);
if (!report.valid) console.log(report.issues);
```

This separate entry uses libxml2 WebAssembly with the bundled Annex-A schema,
then checks referenced files, scoped IDs, reference types and numeric geometry.
It does not substitute for signature verification or visual interoperability tests.
Browser projects using this entry need an ES2022-capable build target; ordinary
parsing and the Vue viewer do not import libxml2.

## Entry points and dependencies

- `.`: reading, conversion, package editing, actions, permissions and signatures.
- `./validate`: XSD and package-structure validation.
- `./node`: native conversion and Node signature helpers.
- `./vue`: `OfdViewer` (optional Vue 3 peer).
- `./office`, `./office-node`, `./office-vue`: optional Office host adapters.

Plain APIs and the standalone viewer do not require the Office packages. Node
conversion uses optional `@napi-rs/canvas`, `@resvg/resvg-js` and `pdfjs-dist`.
Native SVG rendering runs in a cancellable child process. PDF import requires
Node 22.13+; Node 24 LTS is recommended. Install a CJK font such as Noto Sans CJK SC
on headless Linux for documents without embedded fonts. Node entry points must
stay out of browser bundles.

## Budgets and diagnostics

Defaults: 64 MiB input, 128 MiB expanded ZIP, 10,000 entries, 1,000 pages,
100,000 drawing nodes, 128 MiB generated SVG and 40 million pixels per raster.
Graphics nesting and XML inspection also have depth limits. URL viewer sources
are streamed with the byte budget and aborted on changes or unmount. Archive
traversal, duplicate entries and DTD/entity declarations are rejected.

AbortSignal is checked at operation boundaries; synchronous ZIP/XML parsing
cannot be interrupted mid-call. Missing resources, unsupported fonts/seals and
compatibility fallbacks remain visible in `diagnostics`. Successful rendering is
not a claim of formal standard certification; see the conformance record.
