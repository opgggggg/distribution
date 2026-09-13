# @cubexp/ofd

Independent OFD package maintained in `distribution/packages/ofd`, outside the
`als-office` submodule. Includes a bounded ZIP/XML parser, SVG page model, Vue
viewer, readonly Office adapters and browser/Node conversion APIs. No LibreOffice,
ODF implementation, remote conversion service or absolute checkout dependency is
required.

```sh
npm install @cubexp/ofd
```

The install command applies after publishing. For local development in distribution:

```sh
npm run build:ofd
npm run test:ofd
npm pack --workspace @cubexp/ofd
```

## API

```ts
import { readOfdDocument, exportDocument, writeImageOfd } from "@cubexp/ofd";
const document = await readOfdDocument(file);
const result = await exportDocument(document, "txt");
for (const { name, blob } of result.files) save(name, blob);
```

```ts
import { convertDocumentNode } from "@cubexp/ofd/node";
const pdf = await convertDocumentNode(file, "ofd", "pdf", { fileName: "invoice.ofd" });
const ofd = await convertDocumentNode(pdfFile, "pdf", "ofd");
```

```vue
<script setup>
import { OfdViewer } from "@cubexp/ofd/vue";
defineProps(["file"]);
</script>
<template><OfdViewer :source="file" file-name="invoice.ofd" /></template>
```

- `.`: `readOfdDocument`, `exportDocument`, `convertDocument`, `writeImageOfd`,
  and associated types.
- `./node`: `convertDocumentNode`.
- `./vue`: `OfdViewer`.
- `./office`: `OFD_ARTIFACT_PLUGIN`, `OFD_ARTIFACT_CONVERTERS`.
- `./office-node`: `createOfdNodeConverters`.
- `./office-vue`: `OFD_VUE_FORMAT_CONTRIBUTION`.

The viewer provides page navigation, zoom, selectable text, search, export and
compatibility diagnostics. Hosts may register `OFD_VUE_FORMAT_CONTRIBUTION` with
their Office UI registry. The three `office*` entry points use optional `@yaochn/als-office-editor-core`
and `@yaochn/als-office-editor-ui` peer dependencies. Plain parsing, conversion
and `OfdViewer` do not load or require those packages. Vue is an optional peer
dependency for `./vue`. Native image/PDF conversion uses
optional `@napi-rs/canvas` and `pdfjs-dist`. Node modules stay behind `./node` and
must not be imported into browser bundles.

## Conversion support

| Input      | Output              | Runtime                              |
| ---------- | ------------------- | ------------------------------------ |
| OFD        | TXT, DOCX           | Browser or Node                      |
| OFD        | PDF, PNG, JPEG      | Browser canvas or Node native canvas |
| Parsed OFD | SVG, HTML, Markdown | Browser or Node                      |
| PDF        | OFD                 | Node PDF.js/native canvas            |
| PNG/JPEG   | OFD                 | Node native canvas                   |

Results contain one named Blob per output. Omit `page` to export all pages; pass a
zero-based index to select one. Single-Blob artifact registry conversions reject
multi-file results unless `options.page` is supplied. `scale` defaults to 1.5 and
must be in (0, 8]; JPEG `quality` is in [0, 1].

## Fidelity and limits

Supports Unicode text and glyph advances, embedded fonts, paths, raster images,
templates and raster images extracted from SES seals. Compound resources, complex
clipping, custom glyph mapping, annotations and some seal types remain incomplete.
OFD → DOCX reconstructs text and page breaks without source graphics or exact
placement. OFD → PDF and PDF → OFD use raster pages without searchable text.
Displaying a seal is not signature verification; conversions do not preserve
signature validity. Inspect returned `diagnostics`.

Defaults: 64 MiB source, 128 MiB expanded ZIP, 10,000 entries, 1,000 pages and
40 million pixels per raster page. Archive traversal, duplicate entries and
DTD/entity declarations are rejected. AbortSignal is checked at operation
boundaries; synchronous ZIP/XML parsing cannot be interrupted mid-call.

Tests cover OFD parsing, Chinese text, resources, page dimensions, readonly
sessions, invalid archives, size budgets, cancellation, PDF/PNG/JPEG output,
PDF/image → OFD and MIME/extension aliases. `tests/viewer.html` is a Vite smoke
page for the Vue viewer. Build before serving it.
