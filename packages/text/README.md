# @cubexp/text

独立的文本文件查看与编辑包，使用 highlight.js 的 common 语言集提供语法高亮，
CodeMirror 提供编辑、行号、折叠、撤销/重做、查找替换、括号匹配、自动缩进和补全。
核心 API 可在浏览器和 Node.js 中使用；Vue 组件通过独立入口按需加载。

```sh
npm run build:text
npm run test:text
```

```ts
import { readTextDocument, highlightText } from "@cubexp/text";

const document = await readTextDocument(file, { encoding: "utf-8" });
console.log(document.text, document.language, document.lineCount);
const { html } = highlightText("const answer = 42;", { language: "javascript" });
```

```vue
<script setup>
import { TextViewer } from "@cubexp/text/vue";
import "@cubexp/text/style.css";
import "highlight.js/styles/github.css";
defineProps(["file"]);
</script>

<template>
	<TextViewer :source="file" :wrap="true" @error="console.error" />
</template>
```

`source` 支持 `File`、`Blob`、`ArrayBuffer`、`Uint8Array` 和原始文本字符串。
字符串始终作为内容处理，不会请求 URL。远程文件请由宿主 fetch 后传入 Blob。
File 自动使用文件名；其他来源可传 `fileName`，用于识别语言。
可通过 `language` 指定 highlight.js 语言或别名，`plaintext` 禁用高亮；未知文件类型或
不在 common 语言集内的语言回退为纯文本。不会执行文件中的 HTML 或脚本。

默认使用严格 UTF-8 解码，自动识别 UTF-8/UTF-16 BOM；`encoding` 支持 TextDecoder
编码名称（例如 `gb18030`）。解码失败或字节输入含 NUL 时报告错误，不静默替换乱码。
默认最大输入为 8 MiB（`maxBytes`），超过 200,000 个 UTF-16 码元时保留完整文本并跳过
高亮（`maxHighlightLength`）。核心读取 API 支持 `signal`，在异步读取边界检查取消；
同步解码和高亮不能中途取消。组件忽略过期读取结果。

Vue props 与读取选项一致（不含 `signal`），另支持 `wrap` 控制换行。
`loaded` 事件返回 `TextDocument`，`error` 事件返回错误，组件 ref 的 `getDocument()`
返回当前文档。CSS 布局与高亮主题需显式导入，可替换为 highlight.js 的其他主题。

构建后，使用 Vite 服务仓库根目录并打开 `/packages/text/tests/viewer.html`，
可通过文件选择器查看本地文件、切换编码及自动换行。

CubeOffice 桌面 profile 已注册 `TEXT_VUE_FORMAT_CONTRIBUTION`，支持在打开菜单、拖放和
系统“打开方式”中查看 TXT、LOG、JAVA、JS/TS、JSON/XML、HTML/CSS、Python、C/C++、
Go、Rust、Shell、YAML/TOML/INI 等文本文件。完整扩展名清单为 `TEXT_EXTENSIONS`。
Markdown、CSV 等现有原生格式保留原来的查看器。文本可编辑，不会执行源码。
系统文件关联随新构建的应用安装生效，不会自动更改系统默认应用。

`./office` 提供 `TEXT_ARTIFACT_PLUGIN`；`./office-vue` 提供 Vue 注册项。
这两个入口使用可选的 Office core/UI peer dependencies，字符串遵循 Office 的 URL 语义。
`./formats` 可单独读取格式清单，不加载 Vue 或 highlight.js。
`tests/HelloCubeOffice.java` 是可在桌面应用中打开的高亮示例。

## 编辑与保存

`@cubexp/text/vue` 另导出 `TextEditor`，接收 `source`、`fileName`、`encoding`、
`readonly`、`wrap` 和 `lineNumbers`。`TextViewer` 保持只读，不加载编辑会话。
编辑器通过 `change`、`status`、`loaded`、`error` 事件报告状态；`save` / `save-as`
事件分别对应 Ctrl/Cmd+S、Ctrl/Cmd+Shift+S，由宿主持久化。
组件 ref 提供 `getText`、`getRevision`、`isDirty`、`subscribe`、`exportFile`、
`saveFile({ deliver })`、`undo`、`redo`、`find`、`goToLine`、`foldAll`、`unfoldAll`、`focus`。

CubeOffice Ribbon 的 Home 页提供打开、保存、另存为、撤销/重做和查找替换；
View 页提供折叠/展开、行号与自动换行。保存走桌面统一文件流程，保存成功才更新
干净基线；取消、失败及保存期间的新编辑均不会错误地清除未保存状态。

未修改文件导出原始字节。编辑后保留 UTF-8/UTF-16 编码及 BOM，换行采用原文件
第一个换行符的风格（混合换行会统一）；其他编码仍可读取，但修改后的保存会报错，
需要先转为 UTF-8。语法解析器按扩展名懒加载；结构折叠依赖对应语言的解析器。
超过高亮阈值的内容继续可以编辑，但跳过 highlight.js 着色。

## 缩略图

```ts
import { generateTextThumbnail, renderTextThumbnail } from "@cubexp/text/thumbnail";
const jpegDataUrl = await generateTextThumbnail(file, { width: 480, height: 360 });
const preview = renderTextThumbnail("public class Example {}", { fileName: "Example.java" });
```

浏览器 API 返回 JPEG data URL，支持文件名、语言、尺寸和 JPEG 质量参数。
`generateTextThumbnail` 另支持 `encoding`、`maxBytes` 和 `signal`。
缩略图显示文件名、语言、行号和高亮的开头若干行，空文件也有预览；
仅处理有界的内容片段，不包含 Ribbon、光标、选区，也不受滚动或折叠影响。
CubeOffice 已接入现有最近文件预览缓存，打开文本文件后可在首页卡片中查看。

## 超大文件

- 文本编辑器默认完整编辑预算为 **8 MiB**（核心 `createTextBuffer` API 可通过 `maxBytes` 显式调整，例如 32 MiB）。使用持久化文本树保存编辑状态，键入时不再复制整份文件；保存以 256 Ki 字符为单位分块编码并让出事件循环。显式调用 `getText()` 或订阅返回全文的 `change` 事件仍会生成全文字符串。
- 超过预算自动打开**只读分块浏览器**，默认每次读取 128 KiB，支持上一段、下一段和按文件百分比跳转。行号、查找和折叠只作用于当前片段；片段可能从一行中间开始。不会把当前片段作为原文件保存或导出。
- CubeOffice 对用户选中的大文本文件使用原生 seek/read，不先将整份文件传入 WebView。显示真实文件大小；若检测到磁盘文件大小或修改时间变化，则要求重新打开。
- 分页支持 UTF-8、UTF-16 LE/BE（自动识别 BOM），边界按完整 Unicode 字符对齐。其他编码请先转为 UTF-8。
- 超过 200,000 字符跳过全文高亮；超过 1,000,000 字符跳过语言解析。只读 `TextViewer` 超过 1 MiB 使用分页展示。
- 缩略图最多读取开头 96 KiB，不再为了预览读取全文。桌面首页继续沿用宿主的预览缓存策略。

```ts
import { RangeTextBlob, readTextPage } from "@cubexp/text/large-file";
// readRange 由宿主实现，只返回 [start, end) 范围的字节。
const file = new RangeTextBlob(readRange, fileSize);
const page = await readTextPage(file, byteOffset, { signal });
console.log(page.start, page.end, page.text);
```

已用 5 GiB 虚拟范围源验证随机读取和有界内存访问，并验证 12 MiB 文件编辑/保存。
这不代表所有设备都能完整编辑 GB 级文件；GB 级文件使用上述只读分页模式。
