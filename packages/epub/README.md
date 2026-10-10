# @cubexp/epub

独立的 EPUB 阅读包：解析 EPUB 2/3（OPF、nav/NCX 目录、封面、字体混淆），用 CSS 分栏在 iframe 中分页渲染，
并提供桌面与移动端两套布局的 Vue 阅读器。只读格式，导出即原文件。

```sh
npm run build:epub
npm run test:epub
```

## 阅读体验

交互参考 Apple Books、Kindle、微信读书、Google Play 图书等主流阅读器的共同做法：

- **翻页**：点左/右侧约 28% 区域翻页，点中间呼出菜单；手机上可左右滑动（跟手），桌面支持方向键、PgUp/PgDn、空格、滚轮。
  RTL 图书自动交换方向。
- **进度**：页脚显示「第 x / y 页 · 本章剩余 n 页 · 百分比」；进度条拖动时预览章节名，跳转后出现「返回」按钮。
- **目录 / 书签 / 笔记**：桌面为可固定侧栏，手机为底部抽屉。选中文字可用 4 种颜色划线、下划线、写想法、复制或搜索。
- **全文搜索**：按章节分组，显示上下文，点击定位并高亮命中。
- **注释弹窗**：`epub:type="noteref"` 的脚注就地弹出，不打断阅读。
- **外观**：跟随系统 / 白色 / 纸张 / 护眼 / 深色 / 纯黑；字号 12–36；原版 / 宋体 / 黑体 / 楷体；行距、页边距；
  翻页或滚动；宽屏自动双栏；两端对齐、保留原书样式、翻页动画开关。
- **固定版式**（`rendition:layout: pre-paginated`）：按 viewport 缩放整页，横屏宽窗口显示跨页。

阅读位置、书签和笔记按书保存在 `localStorage`（`cubexp.epub.book.v1:*`），外观偏好全局保存（`cubexp.epub.preferences.v1`）。

## 使用

```ts
import { openEpub, searchBook } from "@cubexp/epub";

const book = await openEpub(file);
console.log(book.metadata.title, book.toc, book.spine.length);
for await (const hit of searchBook(book, "桃花"))
	console.log(hit.index, hit.before, hit.match, hit.after);
```

```vue
<script setup>
import { EpubReader } from "@cubexp/epub/vue";
import "@cubexp/epub/style.css";
defineProps(["file"]);
</script>

<template>
	<EpubReader :source="file" locale="zh-CN" />
</template>
```

`@cubexp/epub/office-vue` 导出 `EPUB_VUE_FORMAT_CONTRIBUTION`，供 CubeOffice 桌面与移动宿主注册格式；
`@cubexp/epub/host` 的 `handleEpubBack` 让移动宿主的系统返回手势先关闭阅读器里的面板；
`@cubexp/epub/thumbnail` 为最近文档生成封面缩略图。

## 安全与限制

- 图书里的脚本、`on*` 事件属性和 `javascript:` 链接在渲染前移除；样式表内联为 `<style>`，图片和字体使用 `blob:` URL，
  兼容宿主 `style-src 'self' 'unsafe-inline'` 的 CSP。
- 划线渲染依赖 CSS Custom Highlight API（Chromium 105+、Safari 17.2+）；更旧的 WebView 仍会保存并列出笔记，但页面上不显示高亮。
- 不支持 DRM 加密的图书；竖排（`writing-mode: vertical-rl`）图书按横向分页显示。
