# PSD 大画布、效果质量与桌面服务验收

参考：Compositor `a19db90`。本报告区分实现、实测与已知差异，不能据此宣称全部功能或所有像素等价。

## 大画布

- 超过 200 万像素的文档按可见区域绘制，256×256 分块、64 MiB LRU 合成缓存，单帧约 8 ms 后让出主线程。单个复杂分块仍可能超过该时间，并非后台工作线程。
- 缓存依赖使用 WeakMap 身份编号，不额外持有旧版整图像素缓冲。图层移动预览复用分块合成，组、剪贴、蒙版、调整层和坐标相关颗粒保持与整图合成一致；局部移动保留未受影响分块。
- 缩略图直接采样至 36×28；信息面板/吸管只合成单个像素，避免指针移动触发整图合成。设备像素取整消除了 125% 缩放接缝。
- Apple silicon 本机 Node 实测，4096×4096 单图层、1024×1024 可见区域：首次 12.34 ms，缓存命中 0.060 ms，最慢分块 1.69 ms；缓存 4 MiB，整图 RGBA 合成为 64 MiB。此数字是合成微基准，不是浏览器帧率或总进程内存。
- 浏览器 1280×720、DPR=2，4096×4096 双图层：100% 后备画布 1900×862，125% 为 1903×865。移动、撤销恢复原坐标、缩放、滚动平移及接缝修复已操作验证，控制台无错误。
- 原始图层、历史和保存/导出仍需要完整像素数据；巨大滤镜、全图选区及缩放/旋转预览仍有进一步优化空间。本轮解决的是浏览、平移、缩放、普通图层移动及辅助取样的额外整图合成开销。

复现：`npm run test:performance -w @cubexp/psd`。常规测试包含分块/整图逐字节一致、LRU 预算和移动覆盖区失效回归。

## 效果对照

`tests/quality-compare.mjs` 编译带 MIT 授权的 Compositor 原版 C 算法和 macOS CoreGraphics/CoreImage 对照器。64×64 RGB 色阶与两种透明度（不透明；0/64/128/255 交错）共 44 组，以预乘 RGBA8 比较全部通道。原始数据见 [JSON](psd-quality-results.json)。

本轮修正颗粒哈希与粗细噪声、噪点坐标随机分布、渐变映射亮度权重、透明边缘高斯核和运动模糊的高斯线核。测试范围内六种效果的最大误差不超过 1/255。高斯大半径采用三次盒滤近似，尚未包括在原生像素对照中。

常规混合多为完全一致或至多 1 色阶误差；非可分离混合的半透明边缘存在量化误差，门限为最大 8、平均 0.6。其他已对齐项门限为最大 2、平均 0.4，超过即测试失败。

柔光、颜色减淡、颜色加深是明确保留的差异：当前合成沿用现有 W3C/PSD 风格通道公式；Compositor 柔光经过 CoreGraphics，减淡/加深经过启用默认工作色彩空间的 CoreImage。直接切换全局混合语义会改变既有 PSD，因此这三项列为 `known-semantic-difference`，不伪装成误差门限通过。曲线、色阶、曝光等未纳入本次 44 组原生质量对照，仍由已有功能回归覆盖。

| 效果/混合    | Alpha  | 平均绝对误差 | 最大误差 | 状态         |
| ------------ | ------ | -----------: | -------: | ------------ |
| grain        | 不透明 |            0 |        0 | 门限通过     |
| lens         | 不透明 |       0.0037 |        1 | 门限通过     |
| noise        | 不透明 |            0 |        0 | 门限通过     |
| gradient-map | 不透明 |            0 |        0 | 门限通过     |
| normal       | 不透明 |            0 |        0 | 门限通过     |
| multiply     | 不透明 |            0 |        0 | 门限通过     |
| screen       | 不透明 |            0 |        0 | 门限通过     |
| overlay      | 不透明 |            0 |        0 | 门限通过     |
| darken       | 不透明 |            0 |        0 | 门限通过     |
| lighten      | 不透明 |            0 |        0 | 门限通过     |
| color-dodge  | 不透明 |      26.9929 |      124 | 已知语义差异 |
| color-burn   | 不透明 |      23.6492 |      237 | 已知语义差异 |
| soft-light   | 不透明 |       3.0861 |       15 | 已知语义差异 |
| hard-light   | 不透明 |       0.0046 |        1 | 门限通过     |
| difference   | 不透明 |            0 |        0 | 门限通过     |
| exclusion    | 不透明 |            0 |        0 | 门限通过     |
| hue          | 不透明 |       0.0447 |        3 | 门限通过     |
| saturation   | 不透明 |       0.0397 |        3 | 门限通过     |
| color        | 不透明 |       0.0112 |        1 | 门限通过     |
| luminosity   | 不透明 |        0.011 |        1 | 门限通过     |
| gaussian     | 不透明 |       0.2399 |        2 | 门限通过     |
| motion       | 不透明 |       0.0712 |        1 | 门限通过     |
| grain        | 交错   |       0.0978 |        1 | 门限通过     |
| lens         | 交错   |       0.1266 |        1 | 门限通过     |
| noise        | 交错   |       0.0931 |        1 | 门限通过     |
| gradient-map | 交错   |       0.0787 |        1 | 门限通过     |
| normal       | 交错   |       0.1794 |        1 | 门限通过     |
| multiply     | 交错   |       0.2283 |        1 | 门限通过     |
| screen       | 交错   |       0.1806 |        1 | 门限通过     |
| overlay      | 交错   |       0.1719 |        2 | 门限通过     |
| darken       | 交错   |       0.1489 |        1 | 门限通过     |
| lighten      | 交错   |        0.176 |        1 | 门限通过     |
| color-dodge  | 交错   |       9.6857 |      124 | 已知语义差异 |
| color-burn   | 交错   |       8.2552 |      237 | 已知语义差异 |
| soft-light   | 交错   |       1.1133 |       15 | 已知语义差异 |
| hard-light   | 交错   |       0.1834 |        1 | 门限通过     |
| difference   | 交错   |       0.1158 |        1 | 门限通过     |
| exclusion    | 交错   |       0.1435 |        1 | 门限通过     |
| hue          | 交错   |       0.1647 |        4 | 门限通过     |
| saturation   | 交错   |       0.1656 |        7 | 门限通过     |
| color        | 交错   |       0.1608 |        3 | 门限通过     |
| luminosity   | 交错   |       0.1992 |        3 | 门限通过     |
| gaussian     | 交错   |       0.1741 |        1 | 门限通过     |
| motion       | 交错   |       0.1677 |        1 | 门限通过     |

复现（macOS + Xcode 命令行工具 + Python 3）：`npm run test:quality -w @cubexp/psd`。参考代码在 `packages/psd/tests/reference/compositor`，附原版许可证。

## 桌面原生服务

CubeOffice 配置已注册 PSD 文档、文件关联及编辑器组件。桌面贡献通过 Tauri `profile_service_upload` 上传二进制，再由 OFD profile service 启动随包携带的 `cubeoffice-psd-images`；PNG 按 1 MiB 分块读回，完成后释放结果，不依赖 Vite HTTP 中间件。

macOS 构建准备脚本自动编译、按目标架构暂存 Swift helper，并作为 Tauri external binary 随应用打包。支持 ImageIO 解码和 Vision 主体分割/GuidedMatte 精修，要求 macOS 14+。Windows/Linux 保留可替换服务接口，尚无对应分割后端。

服务限制：输入 48 MiB、helper 像素限制 80 MP、结果 64 MiB、最多 4 个未释放结果、子进程 90 秒超时；输入继承既有可信上传目录校验。结果读取只接受服务创建的 ID；启动清理旧结果，成功与错误路径均删除输入。

实际启动 Rust 服务验证：1200×1200 TIFF 经 5 个 PNG 分块读回；NASA 公共 astronaut HEIC 经 Vision 返回 512×512 蒙版；释放后不可读取、上传文件清理均通过。`npm run test:native-desktop -w @cubexp/psd` 可复现，需先准备桌面 helper；本地 HEIC 样本存在时额外验证分割。

完整 CubeOffice `.app` 已构建，包内包含 PSD helper 和 profile service。本地构建使用上游 lockfile 的 updater JS 2.10.1，与 Rust 2.10.1 对齐；共享 node_modules 中 2.11.0 会触发原有版本检查。此构建未签名、未发布。

桌面界面验收：为避免影响已运行的 CubeOffice，另建 `com.cubexp.office.psd-test` 隔离应用。实际通过原生文件对话框打开 PSD；用公共 astronaut 图像验证随包 Vision 服务预览、Advanced edge refinement、Apply mask，图层显示 `Layer mask · Enabled`；单步撤销恢复 `None` 且文档回到已保存状态。测试没有修改源文件。

最终检查：179 项核心/接口/往返/分块回归、TypeScript/Vue 类型检查、桌面 renderer 构建、Rust 检查、Swift 编译、真实 IPC 集成与完整 macOS app 打包通过。测试构建未签名、未发布，Windows/Linux 尚未进行本机构建验证。
