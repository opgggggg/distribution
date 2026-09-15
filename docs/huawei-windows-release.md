# 华为应用市场（Windows）发布渠道

> 本文对照华为官方文档逐条核实，来源见文末。核实日期：2026-09-15。
> 标注 ⚠️ 的条目是本仓库当前**尚未满足**的规范项，上架前需要评估。

---

## 1. 渠道定位

CubeOffice 桌面版目前只有「直通下载」一个 Windows 渠道：用户从 cubexp.com 下载
NSIS 安装包，应用自己通过 Tauri updater 检查更新。

华为应用市场（Windows）是第二个渠道：分发和升级都由市场负责，因此**市场渠道包不带
自更新**。两套升级通道同时存在会互相覆盖同一份安装，鸿蒙版也是同样的处理——只走
AppGallery 升级，不做网站包回退。

|                                    | 直通下载                                         | 华为应用市场                |
| ---------------------------------- | ------------------------------------------------ | --------------------------- |
| 构建 profile                       | `cubeoffice`                                     | `cubeoffice-huawei`         |
| 自更新                             | 开启（`https://cubexp.com/updates/latest.json`） | 关闭，由市场升级            |
| updater 产物与签名                 | 需要 `OFFICE_UPDATER_SIGNING_PRIVATE_KEY`        | 不产出，不需要密钥          |
| 应用内「自动检查更新」设置项       | 显示                                             | 隐藏（`autoUpdate: false`） |
| productName / identifier / version | `CubeOffice` / `com.cubexp.office` / `1.4.2`     | **完全相同**                |

身份三项必须一致：AGC 用注册表里的 DisplayName 认应用，而 NSIS 的 DisplayName 就是
`productName`；版本号与应用内 Version 不一致会导致用户更新异常。

## 2. 构建

```sh
npm run desktop:build:win-x64:huawei
```

在 Windows 构建机上执行，产物是 NSIS 的 `.exe`（华为只接受 EXE，没有 MSI/MSIX 通道，
而且官方推荐的安装框架正是 NSIS）。

只想检查合并后的 Tauri 配置：

```sh
npm run desktop:config:huawei
```

渠道也可以用 `--channel huawei` 或 `CUBEOFFICE_CHANNEL=huawei` 显式选择，`direct`
是默认渠道。配置断言：`node --test scripts/tests/desktop-huawei-channel.test.mjs`。

## 3. 前置条件

- **只有中国大陆实名认证的企业开发者**能在 AGC 看到 Windows 相关菜单；个人开发者
  没有这个页签。
- 应用包名未被已上架应用占用。
- 软件包 ≤4GB 可直接上传，超过则只能填下载地址。

## 4. 在 AGC 建应用

AGC →「APP与元服务」→ **Windows** 页签 →「新建发布」：

| 参数        | 填写               | 说明                                                                                     |
| ----------- | ------------------ | ---------------------------------------------------------------------------------------- |
| 软件包类型  | `EXE(Windows应用)` |                                                                                          |
| 支持设备    | `PC`               |                                                                                          |
| 应用名称    | `CubeOffice`       | 必须与软件包内名称一致。桌面包里是 `CubeOffice`，**不是**鸿蒙/安卓用的 `CubeOffice 文档` |
| DisplayName | `CubeOffice`       | NSIS 写入卸载注册表的 DisplayName，首版发布后不可改，所有版本必须沿用                    |
| 应用分类    | 普通应用           | 设置后不可改；Windows 应用只能选到二级分类                                               |
| 默认语言    | 简体中文           |                                                                                          |

## 5. 版本信息

- **版本**：`1.4.2`（2~4 段点分制）。改版本时同步 `profiles/cubeoffice/desktop/catalog.mjs`
  的 `tauriConfig.version`，两边必须一致。
- **软件包**：`npm run desktop:build:win-x64:huawei` 的产物。
- **发布国家或地区**：Windows 应用目前只支持中国大陆。
- **付费情况**：固定免费，只能配「应用内资费」。

### 安装 / 卸载参数

AGC 的「安装/卸载参数」每格上限 64 字符。本渠道的 NSIS 安装包支持：

| 用途                   | 参数                                                                   |
| ---------------------- | ---------------------------------------------------------------------- |
| 静默安装               | `/S`                                                                   |
| 被动安装（只显示进度） | `/P`                                                                   |
| 不创建快捷方式         | `/NS`                                                                  |
| 安装后启动             | `/R`                                                                   |
| 加入开机启动项         | `/AUTOSTART`（本渠道新增；不传就不写启动项）                           |
| 指定安装目录           | `/D=<绝对路径>`，NSIS 内置参数，**必须是命令行最后一个参数且不加引号** |
| 静默卸载               | `"<安装目录>\uninstall.exe" /S`                                        |

静默卸载若要等待其结束，再加 NSIS 的 `_?=<安装目录>`（阻止卸载器复制到临时目录后立即返回）。

## 6. 安装器行为（自定义 NSIS 模板）

本渠道用自己的 NSIS 模板：`profiles/cubeoffice/desktop/nsis/installer.nsi`，它是
Tauri `tauri-cli-v2.11.4` 自带模板的拷贝，改动都带 `CubeOffice:` 注释标记。直通渠道
不使用这个模板，仍然是 Tauri 默认安装器。

| 规范要求                              | 模板的做法                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------------- |
| 安装首界面提供安装盘选项，默认选 D 盘 | 跳过欢迎页，目录页成为首页；默认目录取「第一块非系统固定磁盘」（通常是 D:），可用空间需 ≥2GB |
| 只有一个系统盘时只能装在该盘          | 扫不到符合条件的磁盘就退回 Tauri 默认目录（`%LOCALAPPDATA%\CubeOffice`）                     |
| 桌面快捷方式复选框，默认勾选          | 目录页上的复选框，默认勾选；完成页不再重复提供                                               |
| 开机自启复选框，默认不勾选            | 目录页上的复选框，默认不勾选；勾选才写 `HKCU\...\Run`，卸载时删除                            |
| 安装完成界面提供立即启动按钮          | Tauri 完成页自带，保留                                                                       |
| 提供静默安装 / 指定目录 / 静默卸载    | `/S`、`/D=`、`uninstall.exe /S`（见上一节）                                                  |

磁盘扫描只认 `DRIVE_FIXED`，光驱、U 盘和网络盘会被跳过。

MUI 的目录页本来没有空位放这两个复选框，模板在页面显示时做了一次重排：介绍文字收掉
用不到的高度，「安装目录」分组上移，空出的一条带子放复选框，下方的所需/可用空间标签
保持原位。所有位置按窗口 DPI 缩放，并以目录输入框的实际位置为基准，而不是写死坐标。

升级 Tauri 版本时，重新下载对应 tag 的 `installer.nsi`，把标记块逐条搬过去，不要在
现有拷贝上原地改。`scripts/tests/desktop-huawei-channel.test.mjs` 会检查这些标记块还在。

### 已验证的安装器行为

在 Windows 11 专业版虚拟机（只有 C: 一块固定盘，D:/E: 是光驱）上，用本渠道构建出的
安装包实测，2026-09-16：

| 场景                             | 结果                                                           |
| -------------------------------- | -------------------------------------------------------------- |
| 存在数据盘时首次安装             | 默认装到数据盘根目录下的 `CubeOffice`，光驱盘符被正确跳过      |
| 只有系统盘时首次安装             | 退回 `%LOCALAPPDATA%\CubeOffice`，符合「只有一个系统盘」的例外 |
| 升级（已记住上次目录）           | 沿用上次安装目录，不会因为默认值而搬家                         |
| `/S /D=<目录>`                   | 按指定目录安装                                                 |
| 图形安装：勾选开机自启后走完向导 | 写入 `Run` 项；桌面快捷方式按默认勾选状态创建                  |
| `/S /AUTOSTART`                  | 写入 `Run` 项                                                  |
| `/S /NS`                         | 不创建桌面快捷方式                                             |
| 静默卸载 `uninstall.exe /S`      | 安装目录、卸载注册表项、桌面快捷方式、`Run` 项全部清除         |

注册表卸载项为 `HKCU\...\Uninstall\CubeOffice`，`DisplayName` 为 `CubeOffice`，
`DisplayVersion` 与包版本一致——这三项就是 AGC 校验用的身份。

卸载后仍保留 `HKCU\Software\cubexp\CubeOffice`（上次安装目录），这是 Tauri 模板的
既有行为：只有在卸载时勾选「删除应用数据」才会清掉，用于下次安装时沿用目录。

## 7. 上架材料

| 材料                        | 现状                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 隐私政策网址                | `https://cubexp.com/privacy`（`website/privacy.html`，应用内已引用）                                                     |
| 隐私权利网址（选填）        | 同上页面的数据删除章节，必要时单独拆一节                                                                                 |
| 隐私标签                    | 需按业务场景勾数据项：反馈与日志上报（`/api/v1/feedback`、`/api/v1/logs`）会带匿名客户端 ID                              |
| AI 功能声明                 | 应用本身不内置 LLM，按「不涉及」填写；若后续接入需改为「涉及」并补算法备案等材料                                         |
| 内容分级                    | 填调查问卷                                                                                                               |
| 电子版权证书 / 应用版权证书 | 软著对普通应用是**非必选资质**（只有游戏强制），但建议提供以免权属争议时被卡；主体名称须与开发者账号一致，否则要补授权书 |
| 联系方式                    | 审核驳回通知发到这里                                                                                                     |

审核时长 1~3 个工作日，支持「审核通过立即上架」或指定时间上架（也可提前手动发布）。

## 8. ⚠️ 剩余差距

第 6 节已经覆盖安装器侧的要求，还没解决的是应用侧的两条：

1. **运行数据默认放 D 盘**。字体缓存、日志、离线缓存现在都在 `%APPDATA%`（C 盘），
   也没有「数据路径更改后原数据自动搬迁」的入口。安装器改不了这个——数据目录由应用
   自己通过 Tauri 的 `appDataDir` / `appCacheDir` 决定，要改得走 `als-office` 上游。
2. **常驻进程资源上限**（`process time < 1%`、`working set < 30MB`）。需要实测
   `cubeoffice-ofd-service` sidecar 空闲时是否常驻，以及主程序退出后子进程是否随之退出。

另外两条与合规无关但要决定：

- **Windows 安装包目前没有代码签名证书**（见根 README 的签名清单）。华为文档没把它列
  为硬性要求，但会过安全审查，且用户侧 SmartScreen 会拦未签名安装包。
- **渠道统计**。鸿蒙版的更新接口有 channel 概念，桌面端没有；如果要把市场渠道的
  DAU 单独计出来，需要服务端配合。

---

## 来源

- [创建Windows应用 - AppGallery Connect](https://developer.huawei.com/consumer/cn/doc/app/agc-help-createwindows-0000001945392301)
- [发布应用（Windows） - AppGallery Connect](https://developer.huawei.com/consumer/cn/doc/app/agc-help-pcapp-0000001146516651)
- [Windows应用建议规范 - AppGallery Connect](https://developer.huawei.com/consumer/cn/doc/app/agc-help-pc-practice-0000001203950281)
- [应用资质审核要求 - 华为应用市场审核政策](https://developer.huawei.com/consumer/cn/doc/app/80301)
- [Windows Installer - Tauri v2](https://v2.tauri.app/distribute/windows-installer/)
