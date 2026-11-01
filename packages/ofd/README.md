# @cubexp/ofd

OFD 包读取、版本选择、目录/权限/动作/附件元数据、部件修改和 `OfdPackage.write()`
现由 `crates/formats-core` 的 Rust 核心提供。现有查看界面保持不变，页面绘制由同一 Rust 核心生成 SVG。
ZIP 资源按需解压，不会仅为查看元数据就展开附件；小资源缓存最多 16 MiB。
未修改时导出原始文件字节；修改时保留所有未触碰部件的字节。原本带签名的文件
继续要求重签或显式 `allowInvalidSignatures`，删除签名索引也不会绕过这项检查。

二进制部件使用随包 WASM 的直接上传接口，不把图片/字体字节转为 JSON 数字数组。
`openOfdPackage()` 只读取一次输入 Blob。Rust 加载失败会显示错误。
`createOfdPackage()`、图片转 OFD、文本转 DOCX 的 XML/ZIP 写出，以及签名索引/描述生成、
引用摘要比对、验证结果聚合也由 Rust 承担。图片/DOCX 写出的公开同步调用约定保持不变；
小型独立 Rust writer 以内嵌 WASM 首次同步初始化，完整文档内核仍按需异步加载。
密码运算与证书信任继续通过原有安全服务回调提供，摘要一致不会自动表示签名可信。
页面 SVG、OpenType 字形轮廓、渐变/纹理、裁剪/模板/注释、BMP/TIFF 解码、
结构引用校验和最终设备线宽也已迁入 Rust。ICC 通过原来的 QCMS/自定义色彩服务绑定，
Annex A XSD 通过原来的 libxml2 绑定执行；栅格页面写成 PDF 也由 Rust 一次性完成，
不再调用 JS PDF 写入器；操作系统像素输出、PDF 输入栅格化和应用原生界面
仍是后续迁移项。独立的迁移前实现用于元数据、签名、XML 部件及像素对照；生产代码
不调用该参考实现。

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
external actions require `allowAutomaticExternalActions`; parsing itself never executes actions.

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

The `./office-vue` adapter follows the shared Office theme:
`setUiEditorTheme("panel")` from `@yaochn/als-office-editor-ui/vue` updates mounted
viewers without reloading the document. The desktop signature dock follows the
same theme. Standalone `OfdViewer` consumers can pass `editorTheme="panel"`
without installing the Office UI adapter.

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
