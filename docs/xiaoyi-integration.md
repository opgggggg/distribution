# 小艺接入调研（已核实修订版）

> 本文修订自 2026-09-12 的调研交接稿。
> 所有结论已对照华为官方文档逐条核实，来源见文末。核实日期：2026-09-12。
> 仍标注 ⚠️ 的条目表示本次未能验证。

---

## 0. 相对原稿的关键修正

| 原稿结论                                             | 核实结果                                                                                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 意图名称不允许自定义，只支持预置垂域意图             | **已过时**。从 **API 20** 起，装饰器方式支持标准意图**和自定义意图**。官方 FAQ 有明确问答。                                          |
| 需邮件联系华为申请配置意图名称                       | 改为**平台自助流程**：在小艺开放平台注册意图集 → 添加自定义意图 → 配真机测试用户组，全程自己点，不需要邮件申请。                     |
| （隐含）小艺召回需要先上架                           | **不成立**。官方明确：功能正式上架应用市场**前**即可在真机上做端到端自验证。测试和上架是两件事，见 §7。                              |
| 调试入口在 DevEco Studio 的 Run/Debug Configurations | **错误**。调试工具在**真机**上：设置 → 系统 → 开发者选项 → 意图框架调试。要求 API ≥ 20，仅手机。                                     |
| 申请材料含"测试华为账号 UID"                         | 官方 FAQ 说这里的华为账号 uid 指**开发者账号**，不是测试用户账号。测试用户另需是**项目团队成员**。                                   |
| 四条路线                                             | 实际是**五条**。遗漏了 API 26 起的 **ArkTS 脚本应用 Skill**（`SKILL.md` + 入口脚本），这条最贴近"我们只提供工具、小艺当大脑"的目标。 |
| ——                                                   | 新增硬约束：**意图框架仅对企业开发者开放**，个人开发者在 AGC「开放能力管理」里根本搜不到。                                           |

---

## 1. 目标（不变）

让用户在小艺里用自然语言操作 CubeOffice。我们自己的 app 不接入 LLM，小艺当"大脑"，我们只提供可被调用的"工具"。

---

## 2. 硬前提（已核实）

- **仅企业开发者**。个人开发者无法申请和注册意图能力。
- **必须真机**。官方明确：「本 Kit 暂不支持模拟器」。原稿这条判断正确。
- 设备：Phone、Tablet、PC/2in1。
- 系统：HarmonyOS 5.0 及以上（自定义意图需 API 20 / HarmonyOS 6.0，见下）。
- 地区：**仅中国境内**（港澳台除外）。
- 系统入口只有三个：小艺对话、小艺搜索、小艺建议。

### 版本门槛（决定可行性，重点）

| 能力                     | 最低 API   | 对应系统                   | 本仓现状            |
| ------------------------ | ---------- | -------------------------- | ------------------- |
| 配置文件开发意图         | API 11     | HarmonyOS 5.x              | ✅                  |
| **装饰器 + 自定义意图**  | **API 20** | **HarmonyOS 6.0**          | ✅ 已抬到 6.1.1(24) |
| 意图框架调试工具（真机） | API 20     | HarmonyOS 6.0              | ✅ 设备为 API 24    |
| ArkTS 脚本应用 Skill     | API 26.0.0 | HarmonyOS 7（开发者 Beta） | ❌ 暂不可商用       |

`apps/harmony/build-profile.json5` 原为 `targetSdkVersion: "5.1.0(18)"` / `compatibleSdkVersion: "5.0.5(17)"`，
已改为 **`6.1.1(24)`**（本机唯一安装的 SDK，也与测试设备一致）。

> ⚠️ **待定的产品决策**：`compatibleSdkVersion` 抬到 24 意味着**最低支持系统变成 HarmonyOS 6.1.1**，
> 5.x 用户将无法安装。当前改动在调研分支上用于打通链路，合入主线前必须决定：
> 是整体放弃 5.x，还是把意图能力拆成只面向 6.x 的单独产物。

---

## 3. 五条接入路线

| 路线                                | 执行位置       | 拉起端侧 UI | 用本地登录态/数据 | 能力自由度                                | 需自带 AI | 最低 API     |
| ----------------------------------- | -------------- | ----------- | ----------------- | ----------------------------------------- | --------- | ------------ |
| **MCP 插件**                        | 我们的云端服务 | ✗           | ✗                 | 自定义 tool schema                        | 否 ✅     | 无（纯云侧） |
| **意图框架 · 配置文件**             | 端侧 app       | ✓           | ✓                 | 低，参数需与系统入口协商                  | 否 ✅     | 11           |
| **意图框架 · 装饰器（自定义意图）** | 端侧 app       | ✓           | ✓                 | **高，自带 llmDescription + JSON Schema** | 否 ✅     | **20**       |
| **ArkTS 脚本应用 Skill**            | 端侧 app       | ✓           | ✓                 | 高，SKILL.md 声明式契约                   | 否 ✅     | 26           |
| **A2A Agent**                       | 自建 Agent     | —           | —                 | 高                                        | **是** ❌ | —            |

CLI 路线确实不存在，原稿判断正确。

---

## 4. 核心发现：自定义意图已开放（原 §5.2 的答案）

官方 FAQ 原文问答：

> Q：小艺意图框架只支持 Schema 中预定义的意图嘛，是否可以在对应垂域下自定义一个意图？
> A：从 API version 20 开始，支持通过装饰器开发标准意图以及自定义意图。

自定义意图的写法就是一份"给大模型看的工具描述"，和 MCP tool schema 形态几乎一致：

```ts
@InsightIntentLink({
  intentName: 'PurchaseMovieTickets',   // 动词+名词，大驼峰，≤64 字符
  domain: 'PurchaseTickets',
  intentVersion: '1.0.1',
  displayName: '购买电影票',
  llmDescription: '用于在线购买电影票……在用户明确表达购票需求，且已提供所有必要信息时使用。如果信息不全或者用户只是查询电影信息，不应调用此工具。',
  uri: 'decorator://ability.entry/main',
  parameters: {
    'type': 'object',
    'properties': { /* 每个参数都要写 description */ },
    'required': ['cinema', 'film', 'time']
  },
  paramMappings: [ /* 参数名 → deepLink query 名 */ ]
})
```

官方对 `llmDescription` 的要求，和写 MCP tool 描述是同一套工程学：

- **准确全面**：覆盖意图的全部功能，不遗漏。
- **边界性**：写清楚**什么情况下不要调用**（这是降低误触发的关键，官方明确要求）。
- **独立性**：一个意图只做一件事，可拆解的功能必须拆成多个意图。
- 建议在描述里写使用示例。

装饰器种类（比原稿列的更全）：`@InsightIntentLink`、`@InsightIntentPage`、`@InsightIntentEntry`、`@InsightIntentFunctionMethod`、`@InsightIntentForm`。

**这印证了原稿 §6.1 的判断**：不接 AI 不等于工作量小，主要成本就在写这套描述和契约上。

---

## 5. 遗漏的第五条路线：ArkTS 脚本应用 Skill（API 26+）

从 API 26.0.0 起，Ability Kit 支持把应用内能力以 Skill 形式开放给系统智能体调用。形态是：

```
entry/
├── skills/
│   └── example-org-music-assistant/    # Skill 名，需与 SKILL.md 的 name 一致
│       ├── scripts/MusicSkill.ets      # 薄适配层：解析入参 → 调既有业务 → 回包
│       └── SKILL.md                    # 声明式契约
└── src/main/module.json5               # 通过 skillProfiles 注册
```

`SKILL.md` 由三段构成：YAML front matter（name / description）→ 触发场景（典型话术 + **不调用的情况**）→ 每项能力的执行参数 JSON Schema 和执行返回值 JSON Schema。系统智能体**仅依赖这份声明**完成"意图—能力"匹配，并把返回值转成自然语言回复。

官方定位是"在不改造既有业务实现的前提下，以薄封装把应用能力开放给系统智能体"——这正好是本项目想要的形态：`als-office` 引擎不动，只加一层适配。

**但 API 26 = HarmonyOS 7 开发者 Beta，现在不能商用。** 当作 6～12 个月后的目标形态，近期按 §4 的自定义意图做，两者的契约设计（能力拆分、参数 schema、错误分支、suggestion 文案）可以复用。

---

## 6. 本仓改造现状（已迁移）

原先仓库里有一套**配置文件形态**的半成品：`insight_intent.json` 声明 `JumpFunctionPage` / `ToolsDomain`，
配 `InsightIntentExecutorImpl.ets`，用一个 `pageId` 枚举承载 7 个场景。

这套东西有两个致命问题，所以已整体迁移掉：

1. **配置文件方式给不了大模型描述。** 官方明说「配置文件范式仅提供基础执行能力，参数格式需开发者与系统入口协商」——
   要靠和华为对齐参数，而不是靠小艺自己理解。
2. **一个意图带 7 个枚举，对大模型是一个语义模糊的工具**，违反官方的意图独立性原则。

现状：`entry/src/main/ets/insightintents/` 下按装饰器方案重写为三个意图，每个一个文件、`export default`：

| 意图                    | 参数                                                 | 对应原 pageId |
| ----------------------- | ---------------------------------------------------- | ------------- |
| `CreateDocument`        | `documentType`（docx/pptx/xlsx/vsdx/markdown，必填） | `new-*` 五个  |
| `OpenWorkspace`         | 无                                                   | `home`        |
| `ViewAssistantActivity` | 无                                                   | `activity`    |

每个意图都写了完整的 `llmDescription`（含"以下情况不要调用"的边界说明）、`keywords`、
参数 JSON Schema（带 enum 和逐值说明）。三者共用 `WorkspaceLauncher.ets` 落到同一个 ArkWeb 宿主页，
**`AppStorage['harmonyIntent']` 的契约保持不变，`Index.ets` 和整个 Web 层无需改动**。

`domain` 仍沿用 `ToolsDomain` —— 官方 FAQ：「功能一步达场景的 domain 固定为 `ToolsDomain`」。

构建与验证结果见 §7.5。

---

## 7. 测试与上架：上架**不是**测试的前置条件

这一节推翻了本文早先的判断。官方《装饰器接入方式自测试方案》原文：

> 从 6.0.0(20) 开始，Intents Kit 向开发者提供意图调用调试能力。开发者完成代码开发之后，**功能正式上架应用市场前，可以**在设备上面进行自验证。

所以 **上架前就能跑通完整的端到端测试**：真机 + 小艺语音 → 拉起应用页面 + 传参。整个流程是**自助的**，在小艺开放平台上自己点，不需要邮件申请意图名称。

### 7.1 两层测试，都在手机上

|              | 本地意图调试工具                                 | 小艺端到端自测试                          |
| ------------ | ------------------------------------------------ | ----------------------------------------- |
| 测什么       | 意图是否注册成功、参数解析、执行结果、前后台模式 | 小艺能否听懂话术并命中我们的意图          |
| 入口         | 设置 → 系统 → 开发者选项 → **意图框架调试**      | 长按电源键 / 语音唤起小艺，说测试语料     |
| 前置条件     | 装好 app，API ≥ 20，**仅手机**                   | 需先在小艺开放平台注册意图 + 配测试用户组 |
| 需要华为审批 | 否                                               | 否（自助配置，但需企业账号）              |
| 需要应用上架 | 否                                               | **否**                                    |

先用左边一列把端侧逻辑跑对，再用右边一列验证召回率，顺序不要颠倒。

### 7.2 小艺端到端自测试的完整步骤

1. 华为开发者联盟 → **管理中心 > 生态服务 > 智慧服务 > 小艺开放平台** → 「立即体验」→ 项目管理页。
2. **资源库 → 意图框架 → 注册意图**，新增意图集：
    - 意图注册协议类型：选「意图标准协议」
    - 意图集（插件）名称：需唯一
    - 分类：按自定义意图选对应垂域
3. 编辑意图集基本信息：关联 APP、支持的设备类型（手机/平板/PC）、版本号（正整数）、图标（72×72、png/jpg、方角不透明）。
4. **意图页签 → 添加 → 选「自定义意图」**，填意图信息，再展开新增自定义意图的输入参数和输出参数，保存。
5. （可选但强烈建议）**新增/批量导入「意图使用样本」**，官方说明用途是"提升模型对意图识别的准确率"。这是我们能直接影响召回率的唯一抓手，别跳过。
6. **测试页签 → 编辑用户组 → 新增用户组 → 管理用户 → 邀请用户**（邮箱或手机号；**测试用户须为该项目团队下的成员**）。
7. 回测试页签选中该用户组保存，点「**开始测试准备**」。

联调验证的四个前提，缺一不可：

1. 调试设备系统版本 **HarmonyOS 6.0.0(20) 及以上**。
2. 设备上登录**已加入真机测试用户组**的华为账号。
3. **小艺 App 升级到应用市场最新版**。
4. 长按电源键或语音唤起小艺，输入测试语料。

> ⚠️ 该页开头写"可以在 HarmonyOS 5 及以上的设备上面进行自验证"，但下文联调验证步骤又明确要求 6.0.0(20) 及以上。文档自相矛盾，**按 6.0.0(20) 准备设备**，别赌 5.x。

### 7.3 真正需要审批的是上架，不是测试

以下几条来自 FAQ，属于**正式上架阶段**的流程，不影响自测试：

- 报 `1000101101: The application has not been registered with the InsightIntent`，原因是没做调试白名单申请环节——即上面 §7.2 第 6~7 步的真机测试用户组。
- 自定义意图**必须通过测试后**才能发布到应用市场，否则只能"发布测试"。
- 应用需先正式上架应用市场，才能做意图标准协议上架；上架后还要完成意图框架注册，否则云侧意图显示空白。
- 审核通过后仍有**灰度测试**阶段，灰度完成前设备切不到"真机模式"。
- 「意图框架调试」开关偶发失灵，关掉再开，中间等半分钟；开关打开后要跑一次应用、等约 1 分钟，小艺建议里才会出现测试条目。

结论修正：原稿"申请流程比写代码慢"的担忧，**对测试阶段不成立，对上架阶段成立**。可以先把技术方案完整验证完，再去走上架。

### 7.4 其他实测约束

- 意图共享 `shareIntent` 每次最多 **50KB**，条数不限；重复调用会覆盖。
- 多个应用接入同一意图时，系统按优先级 + 匹配度排序择一调用。
- 当前意图**只支持拉起页面**，不同业务场景靠传参自行区分。

---

## 7.5 动手验证记录（2026-09-12，真机 + 本地构建）

以下全部为实测结果，不是文档推断。

### 环境

- 设备：**SGT-AL10**，`OpenHarmony-6.1.1.120`，**API 24**，软件版本 `6.1.0.135`。
- 设备 UDID：`F39E1E33D24CB5CCAFE158B719CD94034486F7054DC4CBA6916A2411306883E4`
- 本地 SDK：DevEco 自带 **HarmonyOS 6.1.1(24)**，hvigor 6.24.4。
- 设备和 SDK 都**远高于** API 20 门槛，§2 的版本担忧不成立。

### 坑 1：hdc 看不到设备 ≠ 设备没连

系统里有一个 **root 身份、8 月 23 日启动**的 hdc server 常驻在 `127.0.0.1:8710`，已经僵死，`list targets` 只返回一条过期的 `127.0.0.1:5555 Offline` 记录。普通用户 `hdc kill -r` 杀不掉它。

绕过办法是换端口起一个自己的 server：

```bash
export HDC_SERVER_PORT=18710
hdc -l0 start
hdc list targets -v
```

### 坑 2：装饰器方案**仍然需要** insight_intent.json

这与"装饰器方案不需要配置文件"的直觉相反。官方原文：

> 开发者新增意图执行文件，若该执行文件未被其他文件导入，需要通过 insight_intent.json 文件的 `insightIntentsSrcEntry` 字段配置意图执行文件路径，**使其参与编译**。

文件名路径都和旧方案一样（`resources/base/profile/insight_intent.json`），但**内容结构完全不同**：旧方案写 `insightIntents` 意图定义数组，新方案只写 `insightIntentsSrcEntry` 源文件路径列表，意图定义由编译器从装饰器里抽取。

漏了这一步的现象很隐蔽：**构建照样 BUILD SUCCESSFUL，但意图文件根本没被编译**，HAP 里没有任何意图配置。必须解包 HAP 确认，不能只看构建是否成功。

### 坑 3：装饰器参数必须是编译期常量

意图编译器会报 `10110000 Decorator parameters must be compile-time constants`。这意味着：

- **不能**把 `domain`、`intentVersion` 抽成共享常量再引用，每个文件都得重复写字面量。
- **不能**用 `'...' + '...'` 拼接长 `llmDescription`，必须写成一整条字符串字面量。

这条对代码组织影响不小：意图描述往往很长，却没法折行拼接。

### 坑 4：ArkTS 严格模式

`arkts-no-untyped-obj-literals` —— 返回 `IntentResult<T>` 时不能直接写嵌套对象字面量构造 `T`，必须 `new` 出来再赋值。

### 已验证通过的部分

`entry/src/main/ets/insightintents/` 下三个意图（`CreateDocument` / `OpenWorkspace` / `ViewAssistantActivity`）构建成功，且确认编译器已将其抽取进 HAP 的 `resources/base/profile/insight_intent.json`，生成的 `extractInsightIntents` 数组包含完整的 `llmDescription`、`parameters` JSON Schema（含 enum）、`bundleName`、`abilityName`。端侧定义这一层是通的。

### 当前卡点：签名

`~/cubexp.com/harmony/` 里的 provisioning profile 是 `"type": "release"` + `"app-distribution-type": "app_gallery"`，面向应用市场分发，**不能用于 hdc 侧载调试**。未签名 HAP 实测安装失败：

```
error: failed to install bundle.
code:9568320
error: no signature file.
```

要装到真机上做意图调试，需要一份 **debug 类型**的 provisioning profile，且必须包含上面那个设备 UDID。这份 profile 只能通过 DevEco Studio 的自动签名（登录华为开发者账号，Project Structure → Signing Configs → Automatically generate signature）或在 AGC 上手工创建。**这一步需要华为开发者账号登录，无法在命令行完成。**

### 坑 5：hdc 报 Offline/unknown 的真正原因是密钥文件属主错了（本次最耗时）

症状：`hdc list targets -v` 显示 `Offline unknown`，偶尔闪一下 `Connected`，随即 `-t <key> shell` 立即返回
`E001005 Device not found or connected`。换线、换口、重启 server、重启 DevEco 全部无效。

根因：`~/.harmony/hdckey` 和 `hdckey.pub` 的**属主是 root、权限 600**，当前用户读不了，
认证握手因此永远完不成。这两个文件是一个以 root 身份跑起来的 hdc server 创建的。

```bash
ls -la ~/.harmony/          # 属主若是 root 即中招
mv ~/.harmony ~/.harmony.bak   # ~ 属于你，可直接重命名整个目录，不需要 sudo
hdc kill -r                  # 重启后会以当前用户重新生成密钥
```

重命名后重插设备，手机上**必然**重新弹「是否信任此设备」（旧密钥作废），点「始终信任」即恢复正常。

华为官方 FAQ《DevEco Studio无法识别到连接的真机可能是哪些原因》的"场景二"列了这一条，
但排在最后，很容易被前面的"换USB线"带偏——本次就在换线上浪费了大量时间。

### 坑 6：hvigor 的 SignHap 读不了明文口令

在 `build-profile.json5` 的 `signingConfigs` 里写明文口令，构建会失败：

```
Error Code: 00308018 Unknown Error
  at HapSignCommandBuilder.getKeyStorePwd (common-sign-command-builder.js)
```

它只认 DevEco 加密后的口令格式。命令行环境下的绕法是**跳过 hvigor 的签名任务**，
先 `assembleHap` 产出未签名包，再直接调 SDK 自带的 `hap-sign-tool.jar`：

```bash
java -jar $SDK/toolchains/lib/hap-sign-tool.jar sign-app \
  -keyAlias "<alias>" -signAlg "SHA256withECDSA" -mode "localSign" \
  -appCertFile "<debug.cer>" -profileFile "<debug-profile.p7b>" \
  -inFile "entry-default-unsigned.hap" -keystoreFile "<debug.p12>" \
  -outFile "entry-default-signed.hap" -keyPwd "<pwd>" -keystorePwd "<pwd>" -signCode "1"
```

好处是 `build-profile.json5` 里不留任何凭据，可以安全提交。

### 坑 7：安装报 9568276 "install already exist"

设备上已有同包名的**发布签名**版本时，调试签名包不能覆盖安装，必须先卸载：

```bash
hdc shell bm uninstall -n com.cubexp.office
hdc shell bm install -p /data/local/tmp/xxx.hap
```

注意 `bm dump -n <bundle>` 此时可能因权限返回"failed to get information"，
**查不到不等于没装**，别被误导。（另：`bm get` 只支持 `-h`/`-u`，列包要用 `bm dump -a`。）

### 调试证书/设备/Profile 的自助配置（实操路径）

1. 本地生成 EC 密钥对和 CSR（HarmonyOS 要求 secp256r1 + SHA256withECDSA）：
   `keytool -genkeypair -keyalg EC -groupname secp256r1 -sigalg SHA256withECDSA -storetype PKCS12 ...`
   再 `keytool -certreq ... -file x.csr`
2. AGC → 证书、APP ID和Profile → **证书** → 新增证书 → 类型选「调试证书」→ 上传 CSR → 下载 `.cer`
3. → **设备** → 添加设备 → 名称/类型/UDID（`hdc shell bm get -u` 取 UDID，64 位）
4. → **Profile** → 添加 → 选应用 → 类型「调试」→ 选刚建的证书 → 勾选设备 → 下载 `.p7b`
5. 校验 p7b：`strings x.p7b` 里应含 `"type":"debug"`、正确的 bundle-name、以及设备 UDID

调试证书每个账号有数量上限（通常 2 张），别反复新建。

### 最终验证结果

调试版已装上真机并确认：`appProvisionType: debug`、`debug: True`、v1.4.2、`EntryAbility` 正常拉起。
三个自定义意图（`CreateDocument` / `OpenWorkspace` / `ViewAssistantActivity`）已随包注册。
端侧链路打通，剩下的是在手机「开发者选项 → 意图框架调试」里逐个执行验证参数解析与页面拉起。

---

## 8. 针对 CubeOffice 的选型判断

先看一个硬事实：**目前开放的智慧分发特性里，没有一条适合文档编辑类应用。**

- 「办公软件」垂域只开放了一个特性：企业动态信息推荐（事件推荐，依赖"查看关注企业更新"意图）。
- 「工具」垂域只有常用打卡推荐、常用扫码推荐。
- 「技能调用-对话」这一特性类型，**目前只在银行（发起还款）和旅游（搜索旅游攻略）两个垂域开放**。

所以预置目录这条路走不通，**自定义意图是唯一出路**，这也让 §4 的发现从"锦上添花"变成"必要条件"。

建议的主次：

**主线：意图框架 · 装饰器自定义意图（功能一步达）。**
理由是 CubeOffice 的核心操作天然强依赖端侧——文档在本地、编辑器在本地、编辑态在本地。"新建一份 Word 并打开"这类操作只能在端侧发生，MCP 做不到。仓库里已有的 `JumpFunctionPage` 就是这条路的雏形，把它从配置文件形态迁到装饰器形态，加上 `llmDescription`，是最短路径。

**副线（可选）：MCP 插件。**
只有当后端有成熟的、与端侧状态无关的能力（比如云端文档列表查询、模板库检索）时才值得做。看仓库结构，`services/cubeoffice-api` 目前只有 feedback 和 platforms 两个模块，**后端还不足以支撑一个有意义的 MCP Server**。建议暂缓。

**A2A / OpenClaw：不适用。** A2A 需要自带 Agent 和 AI，与"不接 LLM"的约束直接冲突。OpenClaw 模式是让用户把自己的私有 OpenClaw 智能体接到小艺 App（需要用户自行部署、加白名单），是面向个人用户的玩法，不是应用分发渠道。

---

## 9. 下一步（按依赖顺序）

1. **确认企业开发者资质**，并在 AGC「开放能力管理」中确认能搜到 Intents Kit。这是所有后续工作的前提，做不成后面全白做。
2. **把 HarmonyOS 工程的 targetSdkVersion 抬到 6.0.0(20)**，验证现有构建和 WebView 宿主不回归。
3. 拿一台 HarmonyOS 6.0 真机，**开启「设置 → 系统 → 开发者选项 → 意图框架调试」**，先用现有的 `JumpFunctionPage` 跑通"查看设备上所有意图 → 配置参数 → 执行意图"，确认端侧链路和 `inputParams` 写法。
4. **设计意图清单**。参照 §4 的边界性/独立性原则拆分，别做成一个 `JumpFunctionPage` 带 7 个枚举的大杂烩——那对大模型是一个语义模糊的工具。拆成 `CreateDocument`、`OpenRecentDocument`、`ExportToPdf` 这样一意图一功能。写操作（新建/导出）按原稿 §6.2 的判断，必须落到端侧 UI 让用户确认。
5. 把意图从配置文件形态**迁到装饰器形态**，补 `llmDescription` 和参数 JSON Schema。
6. 按 §7.2 在小艺开放平台**注册意图集 + 配真机测试用户组**，导入意图使用样本，点「开始测试准备」，用小艺语音做端到端联调。这一步**不需要先上架**，可以和 4、5 并行准备。
7. 端到端跑通、召回率满意之后，再走上架流程（先上架应用市场 → 意图标准协议上架 → 意图框架注册 → 等灰度）。
8. 等 1～7 跑通后再评估 MCP 副线。

---

## 10. 仍未核实 ⚠️

- 「功能一步达场景方案」本身是否也要求 API 20，还是 API 11 即可。
- 本仓 `insight_intent.json` 的 `inputParams` 嵌套写法是否合规（只能真机实测）。
- MCP 插件路线的具体注册流程与 OAuth 身份映射设计（本次未重新核实，沿用原稿）。
- Skill / Agent / MCP 插件在小艺开放平台的上架审核规范细节。
- 「办公软件」垂域后续是否会开放文档类的技能调用特性。

---

## 11. 参考

官方文档（均为 2026 年内更新）：

- [意图框架概述](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/insight-intent-overview) — 两种开发方式与 API 门槛（2026-03-09）
- [Intents Kit 简介](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/intents-introduction) — 约束与限制、企业开发者、不支持模拟器（2026-08-29）
- [自定义意图相关信息定义规范](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/intents-skill-all-rec-specification) — 命名/描述/参数规范与完整示例（2026-06-27）
- [使用配置文件开发意图](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/insight-intent-config-development) — `insight_intent.json` 字段说明（2026-09-09）
- [调试意图](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/insight-intent-debug) — 真机调试开关与执行结果对照表（2026-09-09）
- [基于 ArkTS 脚本的应用 Skill 开发指导](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/arkts-skill-development-guide) — API 26 新路线（2026-09-09）
- [智慧分发特性](https://developer.huawei.com/consumer/cn/doc/service/intents-ai-distribution-characteristic-0000001901922213) — 各垂域已开放特性全表（2026-07-27）
- [意图框架接入流程问题（FAQ）](https://developer.huawei.com/consumer/cn/doc/harmonyos-faqs/faqs-intents-kit-5) — 自定义意图开放、白名单、灰度、ToolsDomain（2026-07-30）
- [自定义意图如何上架（FAQ）](https://developer.huawei.com/consumer/cn/doc/harmonyos-faqs/faqs-intents-kit-4) — 测试通过后方可发布（2026-06-26）
- [装饰器接入方式自测试方案](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/intents-skill-all-rec-dp-self-validation-decorator) — **上架前真机自验证的完整步骤**，§7 的主要依据（2026-07-28）
- [配置文件接入方式自测试方案](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/intents-skill-all-rec-dp-self-validation-con) — 配置文件路线对应的自测试流程
- [小艺开放平台](https://developer.huawei.com/consumer/cn/doc/service/harmonyos-service-0000001238266717) — Agent 与 Skill 生态统一开放平台
