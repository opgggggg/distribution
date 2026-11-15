# PSD AI agent 可操作性审计

日期：2026-09-20。范围：PSD 命令 API、Vue 暴露接口、artifact 适配器、原生去背景调用及 UI 语义。初轮审计后，已完成下述修复。原始发现保留在后文作为修复前证据。UI 判断结合上一轮真实交互走查与当前代码；本轮实际执行 API 测试与两个最小复现，未验证外部 MCP/桌面 agent 的完整连接链路。

修复状态（2026-09-20）：五项均已落实。

- 混合读写批次采用同步事务边界：失败恢复文档、revision、历史和 ID 分配；成功只通知一次、撤销一次。view.reveal 独立执行，避免失败批次留下 UI 副作用。
- `background.remove` 接入 Vue 原生服务；公开可用性及未接服务原因。服务结果应用前重查 revision、权限和只读状态。
- `resource.create/write/read/release` 提供会话内二进制句柄；单块 48 KiB、总量 64 MiB、最多 64 个资源；`mask.fromResource` 应用上传蒙版。
- `document.preview` 返回有界 PNG 资源，`document.export` 返回 PNG/PSD 资源；headless artifact 也支持 PNG。Vue 接受真实宿主保存回执，桌面接入原生保存对话框和带文件指纹冲突检查的原子写入。导出不会冒充保存成功，取消保存返回 persisted:false。
- requestId / operationId 去重并保留 pending/completed/failed 状态，`request.get` 查询结果；Vue 与 artifact 写命令要求 baseRevision。直接创建低层 API 的宿主可选择 requireRevision:true，保留已有低层调用兼容性。

验证：原有 179 项测试通过，新增 11 项 agent 工作流测试通过；桌面前端生产构建通过；原生服务实测完成 1200×1200 TIFF 分块解码和 512×512 前景蒙版。保存回执与字节重开使用测试宿主验证，未通过真实系统保存对话框写入用户文件；本轮未重新打包原生应用。

边界：去背景仍依赖可用原生服务；预览输入区域/PNG 导出最多 1600 万像素，预览输出最长边最多 2048；请求账本每会话最多 256 个，满后拒绝新 ID 而不静默丢弃旧去重信息。会话结束后资源和请求记录失效。

## 已有基础

- 默认无宿主保存/reveal 处理器时，实测 manifest 公开 67 条命令；有按需签名及 JSON Schema、稳定 manifest hash。
- 图层 ID、画布坐标约定、分页查询、结构化错误、created/affected/deleted IDs、revision 和 noop 都已存在。
- 支持只读过滤、可选 permission、可选 baseRevision、变更订阅；连续写操作在一次 session.apply 中执行。
- Vue 暴露 executeCommands/getCommandManifest，格式贡献适配到共享 artifact surface。不能据此认定外部 agent 已经获得传输入口。
- UI 图层树有 tree/treeitem、selected/expanded、data-layer-id；按钮有操作名称。上轮已实测对话框焦点、Esc 和面板入口。

## P1：读写混合批次失败会留下部分修改

位置：`packages/psd/src/ai.ts:615`、`:640`。

实测序列：layer.rename(existing, "PARTIAL") → context.get → layer.delete(missing)。返回 InvalidArgument，但 revision 已为 1，图层名称已变成 PARTIAL。

原因：遇到读命令先 flushWrites，后续异常没有回滚整批。现有“batch is atomic”测试只覆盖连续写操作，没有覆盖读写交错。agent 收到失败后重试可能重复修改，且错误没有 committedRevision/已完成命令列表。

建议：在隔离状态上执行整批并统一提交；或者明确提供非原子模式，返回已提交范围和版本。验收覆盖写→读→失败、写→失败读、订阅/撤销历史一致性。

## P1：去背景未接入命令能力

位置：`packages/psd/src/vue/PsdBackgroundDialog.vue:49`；`packages/psd/src/ai.ts:59`；`packages/psd/src/vue/use-psd-editor.ts:656`。

去背景通过弹窗直接调用 imageServices.foregroundMask，然后 mask.set。AI host adapter 没有该服务，manifest 没有对应去背景命令；context capabilities 仅含 write/text/paint，无法预先判断原生服务是否可用。

建议：增加接受 layerId 的去背景命令及运行时能力/不可用原因；异步执行返回可查询状态与最终蒙版结果，保留 revision 校验。agent 不应为了调用已有原生服务而操作模态弹窗。

## P2：蒙版二进制与命令预算冲突

位置：`packages/psd/src/ai-manifest.ts:62`、`:632`。

mask.set 要求内联 dataBase64，整个请求上限 256 KiB。实测 512×512 单通道蒙版请求 349605 字节，被 LimitExceeded 拒绝。UI 直接调用 editor.apply 不受该 AI 请求限额影响，因此 UI 能做不代表命令能做。

建议：保留命令预算，增加有生命周期的二进制资源句柄或分块上传；mask.set 引用资源 ID。避免让 agent 在上下文里搬运像素。

## P2：缺少统一的视觉验收和输出链路

位置：`packages/psd/src/artifact-plugin.ts:94`；`packages/psd/src/ai.ts:335`；`packages/psd/src/vue/use-psd-editor.ts:656`。

命令层有图层属性和像素取样，但没有缩略图/区域渲染命令。headless artifact 导出明确只允许 PSD；Vue 有 exportFile，但属于另一接口。Vue 创建 AI API 时没有传 persist，所以该 API 不公开 document.save；宿主仍可通过自身保存接口完成保存，不能据此说桌面不能保存。

影响：agent 做完抠图、滤镜或蒙版后，不能单靠同一命令接口完成“查看效果→导出 PNG→确认持久化”。复合 pixel.sample 还会全图合成，频繁采样大画布成本较高。

建议：增加受尺寸/区域预算约束的预览资源、导出资源和明确的保存回执；连接宿主保存契约。提供一条编辑→预览→导出→重新打开验证的端到端测试。

## P2：写请求重试语义不完整

位置：`packages/psd/src/ai.ts:86`、`:595`。

baseRevision 是可选的，写请求没有 requestId 去重。连接丢失后重试 layer.duplicate/滤镜可能重复执行；传旧 revision 能拒绝重复写，但不能取得原请求结果。保存的 revision 幂等门限不等于所有写操作幂等。

建议：自动化桥接默认要求写前版本，增加 requestId/result 查询，明确 pending/completed/failed 状态及失败是否已提交。

## 验证与优先级

- 本轮运行 `node packages/psd/tests/ai-surface.mjs`：30/30 通过。
- 额外实测确认混合批次部分提交、512×512 蒙版超预算；仅操作合成内存文档。
- 先修批次事务，再接去背景/资源句柄，随后补预览、导出与保存闭环、重试协议。
- UI 操作可作为补充。画布像素本身不会通过 DOM 提供主体语义，精细刷涂仍需视觉定位；现有图层 ID 和坐标命令应成为主要自动化路径。
