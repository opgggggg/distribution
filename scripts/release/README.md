# CubeOffice 四平台发布脚本

Bash 入口统一编排 macOS ARM64、Windows x64、Linux x86_64 和 Android 的构建、签名、校验和网站发布。Windows 原生操作由 PowerShell 执行；JSON、哈希、SSH 发布和签名校验使用随仓库提供的 Python/Node 辅助脚本。无需额外 Python 包。

## 使用

发起一次发布只需要写一个文件：`releases/v<version>.md`，内容是核对过的中英文发布说明。

```bash
cat > releases/v1.4.6.md <<'EOF'
# CubeOffice 1.4.6

## 中文

- 用户能看到的改动。

## English

- What the user can see.
EOF

bash scripts/release-cubeoffice.sh --dry-run
```

版本号取自文件名（取最高的一个），Android 构建号由版本号推导（1.4.6 → 1004006），
发布说明取自文件正文，三者都不用再敲一遍。`releases/` 下的内部复盘文档
（`1.4.5-huawei.md` 这类）不叫 `v<version>.md`，因此不会被当成发布输入。

版本号仍必须高于线上版本，Android 构建号必须递增，脚本会在 `prepare` 阶段核对。
`--version`、`--android-code`、`--notes` 保留为例外情况下的覆盖项，配置文件默认自动读取
`~/cubexp.com/release.conf`，也可用 `--config FILE` 指定其他文件。机器的一次性工具、SDK、签名和构建环境配置见下方「构建环境」。这些准备就绪后，确认计划并去掉 `--dry-run` 即执行完整发布，不再交互询问。`--dry-run` 不执行配置文件、不联网、不创建目录、不提交、不上传。脚本不会重新发布已存在的 1.4.0，也没有覆盖已有版本的开关。

配置示例见 [config.example.sh](config.example.sh)。配置文件是**可信 Bash 代码**，应放在仓库外，权限设为 `0600`；只保存密钥、密码文件的路径。未指定的配置使用发布机器现有路径。输出默认保存在 `~/cubexp.com/releases/<version>/automation/`，可用 `--work-dir` 指定其他位置。

也可以分步执行：

```bash
bash scripts/release-cubeoffice.sh prepare
bash scripts/release-cubeoffice.sh build
bash scripts/release-cubeoffice.sh stage
bash scripts/release-cubeoffice.sh publish
bash scripts/release-cubeoffice.sh verify
```

如使用了自定义配置或工作目录，后续每一步都传入相同参数。`verify` 只读取线上状态，不上传或修改服务器文件。

## AI 的入口与代码落地

AI 根据线上版本和已核实的代码变化确定新版本（用户已指定时直接使用），先写 `releases/v<version>.md`，然后运行脚本。发布说明与版本不再作为额外参数重复传入。

脚本实现必须先提交并按团队流程进入 `origin/main`，因为发布源码始终从远端 main 创建；调用工作区的未提交脚本改动不会自动进入产物。发布过程中创建的版本提交和线上清单也不自动 push/merge，需按用户要求单独落地。机器配置放在仓库外，仅需配置一次；换机器后要重新检查。

## 源码与续跑

- `prepare` 拉取 distribution 的 `origin/main`，创建独立的 `codex/release-<version>` 工作树，再拉取 als-office 的 `origin/master`。若 distribution 固定的上游提交领先于 master，则保留它；若落后，则更新到 master；若分叉，则停止并要求先解决集成。当前工作区的未提交修改保留在原处，不会混入发布。
- 工作树建自 `origin/main`，因此还没提交的 `releases/v<version>.md` 不在其中；`prepare` 会把它复制进工作树并随发布提交一起提交，所以「写文件」这一个动作就足以发起发布。
- 更新桌面和 Android 版本、网站中英文文案、下载地址及翻译资源缓存标识；同步锁文件、检查配置后创建本地构建提交。脚本不 push、不合并分支。
- 四个平台消费同一个提交和子模块提交。字体只在编排主机下载，按上游锁文件逐项校验后随源码包发送；Windows/Linux 不必连接字体服务器。远程构建使用 `git archive` 导出的源码包，并核对完整源码包 SHA-256。
- 每个平台成功后保存包含源码身份和输出哈希的 `receipt.json`。同一工作目录重新执行会复用通过校验的平台产物；失败平台可重新构建。构建或校验失败时不会进入发布步骤。
- `prepare` 保存版本、说明和源码检查点；安装、字体下载、共享库编译或格式化失败后，修复环境并用相同命令续跑。上游一经选定就固定，重试不重新拉取。若提交已完成但打包源码时中断，会恢复该提交。版本、说明或已固定源码改变时停止；旧脚本留下的无检查点现场仍需手工检查。
- 发布断线后，用同一个目录重跑 `publish`。只接受内容完全一致的已上传文件；线上元数据被其他部署修改时会停止。两个更新源均采用同目录临时文件加原子替换，切换前必须通过所有下载的公网检查。
- `report.json` 保存本次源码身份、文件哈希、下载链接和校验范围；`stage/` 保存网站和更新源。构建源码保持不变，发布元数据可在完成后单独审阅、提交。

## 构建环境

- 编排主机：Apple Silicon macOS，Bash 3.2+、Node 20+、npm、Python 3.7+、Git、SSH、Docker CLI，以及 macOS 开发工具。使用 Homebrew Rust 时会从本次进程 PATH 中移除 `~/.cargo/bin`，避免旧 rustup 覆盖它；不会修改系统配置。
- Android：完整 JDK 21+，必须包含 `javac` 和 `jlink`；Android SDK 35、Build Tools 35；现有 APK 签名证书。发布前会下载上一版 APK、核对其 feed 哈希并比较签名证书。
- Windows：可通过 SSH 访问的现有 UTM 主机，Node、Rust/MSVC x64 工具链、Strawberry Perl（用于 OpenSSL）和 updater 密钥。脚本自动创建构建根目录，通过 vswhere 或已知安装路径定位 MSVC，并检查 Perl。旧构建机没有外网路由，靠宿主机上的 CONNECT 代理（`~/cubexp.com/windows-connect-proxy.py`，监听 `192.168.64.1:8898`）访问 registry；**发布前先把它跑起来**，否则 Windows 预检会以 `ECONNREFUSED` 失败。可直连 npm 的新机器将 `WINDOWS_PROXY=''`，无需代理。脚本在需要时启动配置的 VM，但不自动关机。默认要求至少 4 GB 空间；不足时停止，不删除或压缩其他工作目录。网络代理须提前运行，只为构建进程设置 npm 代理。
- Linux：现有 `colima-rosetta` 的 `cubeoffice-linux-rosetta` 容器，已安装 Cargo、Linux 依赖、FUSE，以及按[发布技能](../../.agents/skills/cubeoffice-release/references/release-process.md)修正过的 linuxdeploy 工具。容器需配置可读的 `OFFICE_UPDATER_SIGNING_PRIVATE_KEY` 和显式的 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`。脚本使用 `bash -c` 保留 Cargo 路径，以独立目录和受锁保护的缓存构建。脚本会启动已配置的现有容器；配置 `LINUX_COLIMA_PROFILE` 后也会按需启动该既有 Colima profile。不会删除或重建容器。
- 服务器：SSH 密钥可访问站点目录，具有 Python 3.6+、文件写入权限，HTTPS 下载支持字节范围请求。只修改明确列出的版本文件和网站文件，保留旧版本及回滚备份。

macOS 构建完成后必须通过生产前端启动回归：安装 Google Chrome，或设置 `PLAYWRIGHT_CHROMIUM_EXECUTABLE` 指向现有 Chromium。检查生产入口正常挂载且无未捕获错误，失败时停止发布。

自动检查包括生产前端启动、原生包身份、架构、CLI、Android 签名连续性、三个桌面更新签名、服务回归、哈希与实际 Android feed 校验器。浏览器交互回归和真机 GUI 测试仍需按变更范围另行执行；脚本报告不会声称这些已完成。现有 macOS ad-hoc 签名/未公证、Windows 无 Authenticode 证书的限制不变。

## 测试脚本本身

桌面构建入口统一处理 CubeOffice 品牌：Vite 转换前端文案并在产物含旧品牌时失败，
原生源码在编译期间应用发行仓库的品牌替换，正常结束或构建失败后恢复原文。
AI 连接配置的历史识别标记保持兼容。并发构建会拒绝共享源码；若进程被强制终止，
先确认其 Cargo 子进程已停止，再检查 `profiles/cubeoffice/desktop/generated/native-branding.json`
中的原文并恢复，不能直接删除该恢复记录后继续构建。

三个桌面平台在产物生成后都会启动 CLI 的隔离 MCP 握手，检查服务名、使用说明和
工具描述。该检查不读取用户 AI 配置、不打开文档。品牌回归测试还覆盖真实上游文案、
直接发行和华为渠道、嵌套构建、失败恢复及连接配置兼容性。

```bash
npm run test:desktop-branding
bash -n scripts/release-cubeoffice.sh scripts/release/linux.sh
python3 -m unittest discover -s scripts/release/tests -v
```

测试使用临时目录、临时服务器文件树和临时生成的签名样本，不构建或发布新版本，也不需要生产 SSH 访问。
