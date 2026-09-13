# 整 App 性能优化

本轮针对整个应用的后台开销、启动资源和页面切换。已构建并安装工作区 debug APK，未发布。

## 根因与修改

共享编辑器适配器在 Vue 组件挂载时寻找运行时事件接口。实际运行时异步加载，挂载时接口尚未出现，适配器便退回每 100ms 轮询，并在加载完成后仍一直轮询。已经返回首页的编辑器也会不断读取文档快照和 AI 上下文。CPU profile 显示文档深复制和 PPT 命令 schema 构造占用主线程，伴随垃圾回收。

现在运行时接口就绪后立即停止轮询、使用事件通知，并在关闭时解绑事件。版本号读取先检查所有 API 的轻量 getter，再回退到快照，避免已经有轻量接口却仍复制整个文档。保留加载期间的状态追踪和编辑后自动保存。

安卓样式改为随格式代码分块加载。首页初始 CSS 从约 718 KiB 降为 328 KiB，样式规则从 4604 条降为 2046 条。设置页组件延迟到首次进入时挂载，随后保留，保证表单与滚动位置不丢失。

## 实际 Android 对比

环境：CubeOffice_API35，Android 15，WebView 124，host GPU，2048 MB。3 份相同 DOCX + 2 份相同 PPTX 保持打开，回到首页；均使用模拟器上的真实 WebView，CDP Performance 计数器测量。

| 指标                               |    修改前 |             最终包 |
| ---------------------------------- | --------: | -----------------: |
| 3 秒空闲期 ScriptDuration          |  766.7 ms | 0 ms（采样精度内） |
| 3 秒空闲期 TaskDuration            |  781.8 ms |             1.1 ms |
| 首页/设置切换 12 次 ScriptDuration |  577.1 ms |            21.4 ms |
| 首页/设置切换 12 次 TaskDuration   | 1457.5 ms |           638.2 ms |

这些是主线程执行时间，不是整段操作的墙钟耗时，也不代表所有设备速度提升的固定比例。最终堆内存约 98 MiB，保留五个编辑器及其撤销状态，没有靠丢弃文档内容降低 CPU。

进程重启采样中，最终包一次 DOMContentLoaded 为约 468 ms、自动化可操作检查约 1128 ms。旧包单次 DOMContentLoaded 约 5169 ms，但系统负载和缓存不是严格受控变量，不据此宣称冷启动提升倍数。

原始数据见 global-before.log、global-after.log、global-startup.json。持续编辑、极大文档、低端真机和长时间累积很多文档的内存压力仍需专项评估。

## 回归

- 新增 `apps/android/tests/performance.cjs`：五文档后台空闲预算（3 秒内脚本耗时 <150ms）、首页/设置切换、页面异常检查；最终包通过。
- 共享 `format-contribution.mjs` 单测通过：异步 API 就绪后停止轮询、版本 getter 优先于文档复制、后续编辑事件、取消订阅。
- `apps/android/tests/emulator.cjs` 在最终 APK 上通过：导航、设置滚动恢复、搜索、Word 输入/格式/撤销重做/草稿、表格公式、PPT、流程图、Markdown 编辑/阅读/重开、PDF 导入/搜索。见 global-emulator.log。
- editor-ui 包构建、移动 Web 类型检查和生产构建、Android assembleDebug、两仓库 diff whitespace 检查通过。
- 额外尝试 `artifact-workspace.mjs`，因其引用的构建文件 `dist/vue/components/UiArtifactWorkspace.vue2.js` 不存在而未能运行；本轮未改动该组件或修整这项无关构建文件名问题。共享适配器定向单测及真实安卓工作流已覆盖本次修改。
- 未执行桌面全仓质量/覆盖率门禁，留给 CI；共享代码位于 als-office 子模块，交付时必须与宿主改动一同保留。

运行性能回归前启动模拟器、安装 debug 包并将应用重新启动到首页（保留数据，确保没有已经挂载的编辑器）：

```sh
ANDROID_SERIAL=emulator-5556 \
PLAYWRIGHT_MODULE_PATH=/path/to/playwright \
node apps/android/tests/performance.cjs
```
