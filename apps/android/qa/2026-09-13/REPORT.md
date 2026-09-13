# 安卓缩略图、播放手势与截图开销回归

2026-09-13；修改保留在工作区，未发布安装包。

## 修复

- 播放时通过 `slideViewMode` 属性进入单页模式。原先依赖移动端未挂载的“普通视图”按钮，实际一直处于全部幻灯片视图，因此滑动处理提前退出。保留移动导航返回概览，兼容编辑器内部点击选页。
- 新建文档不再因为没有 source Blob 而跳过缩略图。复用已保存封面；保存文档字节不再等待截图，截图安排在空闲时间。
- 已损坏的图片不再阻塞整页封面；截图以占位图替代无法载入的图片。首张 PPT 幻灯片隐藏时寻找可见页；持续布局变化到达等待上限时仍尝试捕获已可用页面。
- Word 网页布局的封面在复制 DOM 前裁掉范围外的段落和表格行，避免复制全文后才裁剪。缩略图就绪检测的几何读取延后到布局安静时执行。

## 验证

环境：macOS Chrome 152，移动视口 412×915 / 915×412，触控和 DPR 3。滑动使用 Chromium 原生 touch 事件注入，不直接调用翻页函数。

- `preview-playback.cjs`：DOCX 封面持久化和重载显示、PPTX 封面、左右滑动、第一页边界、退出播放、新建 DOCX、损坏图片、长文档裁剪、首张幻灯片隐藏。
- `workspace.cjs`：五种编辑格式工具、导航、模板失败重试与导入、旧 DOC/PPT、CSV、图片、手机横竖屏、平板、暗色及减少动态效果通过。
- `vue-tsc -p apps/harmony/tsconfig.json --noEmit` 通过；`npm run build:web:android -w @yaochn/als-office-harmony` 通过。
- Android 生产 Web 资源另以 file URL、文件间访问和模拟 Android 桥接运行：PPTX 封面存在，播放进入 single 视图，触控左滑切到第二页。
- 主仓库及 als-office 子模块 `git diff --check` 通过。共享渲染修改位于子模块，需与宿主修改一起保留。

相同的 1500 段合成 Word 网页布局，封面捕获对比：修改前约 1183 ms / 4500 次段落样式读取；修改后约 312 ms / 21 次。此数字仅衡量该截图样例，不能外推为整机速度提升。

## 后续实际模拟器复测

按用户要求启动 CubeOffice_API35，并安装本工作区 assembleDebug 生成的 1.4.2 APK。Android 15、WebView 124.0.6367.219、1080×2400 / 420dpi（DPR 2.625），host GPU、2048MB 内存。首次自动软件 GPU 启动失败，改用 host GPU 后正常；没有清空模拟器原有应用数据。

- 使用新的“本次验证-文字.docx”和“本次验证-演示.pptx”，等待各自缩略图记录写入，避免误匹配历史同名文件。两份文件封面均真实显示，见 emulator-thumbnails.png。
- 已运行应用中，Word 页面约 542 ms 出现、封面约 1366 ms 完成；PPT 控件约 422 ms 出现、封面约 1377 ms 完成。这些不是冷启动指标。
- 使用 adb 原生 input swipe 检查左右翻页；横屏播放、返回竖屏和返回首页通过，没有页面异常。
- 四次 Word 上下滚动：106 个 requestAnimationFrame 间隔，P95 约 17 ms，未出现超过 100 ms 的间隔。
- 六次 PPT 左右翻页：183 个间隔，P95 约 17 ms，但有一次约 300 ms 的停顿。翻页功能正常，性能仍不能认定为全部解决；该采样也不等于 Android 合成器实际呈现帧率。
- 模拟器保持运行，停留在两份验证文档的筛选列表，可直接继续体验。

详见 device.log 和 smoothness.log。仍未发布，未在厂商真机或大型真实文档上复测；桌面全量检查留给 CI。

运行新增回归：

```sh
ANDROID_PREVIEW_URL='http://127.0.0.1:5173/?platform=android' \
PLAYWRIGHT_MODULE_PATH=/path/to/playwright \
node apps/android/tests/preview-playback.cjs
```
