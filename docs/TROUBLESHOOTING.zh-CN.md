# DeepSee 排障指南

[English](TROUBLESHOOTING.md) · [返回 README](../README.zh-CN.md)

先运行一条不会修改配置的诊断命令：

```powershell
npx --yes github:WUBING2023/deepsee doctor
```

它会显示实际使用的 `DSH_HOME`、Web 与 Headless 的插件状态，以及本地前置条件，不会打印密钥。当前 Alpha 的部分诊断名称仍保留旧的 `Bridge` / `OPENDS_*` 字样；这是兼容信息，不代表已经在 Harness 中保存的 API Key 还要再填一次。

## 安装出现超时

典型错误：

```text
Error: spawnSync ... node.exe ETIMEDOUT
```

这通常表示嵌套的 Harness 包下载超过安装器时限，在旧电脑或较慢的 registry 网络上更常见，并不一定是 Node.js 损坏。

先尝试可续跑的安装：

```powershell
npx --yes github:WUBING2023/deepsee install --timeout-ms 0 --retries 3
```

已经完成的 profile 会被跳过。如果连 `npx github:` 本身都无法完成，请使用[压缩包兜底安装](GETTING_STARTED.zh-CN.md#压缩包兜底安装)，直接绕过这一步下载。

## 侧栏没有 DeepSee

1. 运行 `deepsee doctor`，确认 Web profile 显示 `installed`。
2. 停止并重新启动 Harness Web 进程。安装 bundle 不会让已经运行的进程热加载插件。
3. 确认浏览器中的 Harness 与安装器使用同一个 `DSH_HOME`。
4. 确认启动的是 Web，而不是 Headless。
5. 如果 profile 清单过期，运行：

```powershell
npx --yes github:WUBING2023/deepsee install --force
npx --yes github:WUBING2023/deepsee web
```

DeepSee 面板依赖 `/api/deepsee`；Headless 有意不提供这条 Web 接口。

如果“本地窗口”和重新打开的 `127.0.0.1:3080` 能看到同一批对话、但模型凭据或 DeepSee 首选项不同，通常是启动命令使用了两套 `DSH_HOME`。标准 `deepsee web` 与 `pnpm start:web` 现在都使用共享 Harness 主目录；只有明确运行 `pnpm start:web:isolated` 才会使用项目内隔离目录。先停止旧的 3080 进程，再从同一 Windows 用户重新启动标准 Web 命令。不要复制 API Key 到第二套目录。

## 3080 端口打不开

在 Windows 中检查默认端口是否已被其他进程占用：

```powershell
Get-NetTCPConnection -LocalPort 3080 -ErrorAction SilentlyContinue
```

关闭遗留的 Harness 进程，或者使用已经存在的正确实例。DeepSee 不会启动独立服务，也不使用 `3091` 端口。

## Harness 仍提示当前模型没有视觉能力

逐项确认：

1. DeepSee 首选项中已经选择视觉读取器。
2. 使用 **模型** 时，被选中的 Harness 模型明确声明图片输入，并处于 `ready`。
3. 使用 **OCR** 时，当前选择的 MinerU、PaddleOCR 或 RapidOCR 状态为 `ready`。
4. 路线已经打开，Harness 中的供应商凭据仍有效。
5. 修改模型或插件后已经重启 Harness。

切换读取器后，请新建对话并重新添加图片。DeepSee 必须先收到附件，才能生成带真实来源的视觉观察结果。

如果供应商声称模型支持多模态，但 Harness 适配器没有声明图片输入，DeepSee 会把它排除在视觉列表之外。此时应修正供应商元数据或选择已经确认的视觉模型，不要强制使用纯文本路线。

## CLI 已安装但没有被识别

在启动 Harness 的同一终端环境中直接检查命令：

```powershell
codex --version
claude --version
```

再确认 CLI 自己的登录状态，然后重启 Harness。常见原因包括：

- CLI 目录不在 Harness 继承到的 `PATH` 中；
- Harness 启动后才安装 CLI；
- 命令装在另一个 Windows 用户或 Shell 配置中；
- CLI 尚未登录；
- 模型列表获取失败；
- DeepSee 可以发现它，但暂时没有稳定的执行适配器。

Kimi CLI、OpenCode 与 Ollama 可能只显示为“已发现”。这是当前能力边界，不是开关失效。

## Codex 或 Claude 可见但不能打开

DeepSee 不会只凭命令名称就认为路线可用。先在终端中交互运行一次对应 CLI，完成登录，确认它能回答一个最小请求，再重启 Harness。如果仍被关闭，请查看模型矩阵中的状态提示，并在同一环境运行 `deepsee doctor`。

不要把订阅 Token 写进 DeepSee 文件。Codex 与 Claude Code 应继续使用各自官方支持的登录方式。

## 本地 OCR 安装失败

界面会保留最终状态，完整安装输出位于：

```text
$DSH_HOME/deepsee/.opends-tools/mineru/install.stdout.log
$DSH_HOME/deepsee/.opends-tools/mineru/install.stderr.log
$DSH_HOME/deepsee/.opends-tools/ocr/<paddleocr|rapidocr>/install.stdout.log
$DSH_HOME/deepsee/.opends-tools/ocr/<paddleocr|rapidocr>/install.stderr.log
```

重点检查：

- Windows Python 应为 3.10–3.12；Linux/macOS 支持 3.10–3.13。
- 即使走源码 ZIP，包依赖和模型文件仍需联网。
- 杀毒软件或公司策略可能拦截便携 UV。
- 当前地区可能无法连接某个 PyPI 或模型源。
- 隔离环境与模型文件需要足够磁盘空间。
- Windows 上不要把 `OPENDS_OCR_HOME` 指向含中文或其他非 ASCII 字符的 PaddleOCR 模型路径；删除该覆盖后，DeepSee 会自动选择兼容目录。

高级部署可以使用 `.env.example` 中的 `OPENDS_MINERU_*` 或 `OPENDS_OCR_*` 修改包源、镜像、模型源与超时。普通用户应先在界面重试，再考虑修改这些设置。

OCR 首次运行还需要加载检测与识别模型，低配 CPU 上可能等待数十秒到两分钟。它只提取文字与基础版面，不理解人物、物体、场景、图表语义或视觉关系；这类问题应切换到已验证的视觉模型。失败后可直接展开界面中的 **查看安装诊断**，无需先寻找日志文件。

## 升级失败或提示需要手动升级

升级日志位于：

```text
$DSH_HOME/deepsee/.opends-update/update.stdout.log
$DSH_HOME/deepsee/.opends-update/update.stderr.log
```

升级失败不会让当前 Harness 进程立即不可用。可以在面板中重试；已经验证完成的 profile 会被跳过，只继续未完成部分。

**需要手动升级** 表示新版声明了当前更新器不能安全处理的协议或最低版本。请使用最新的一行安装或 ZIP 兜底，不要手工修改 profile 文件。

## 不直接删除状态的完整重置

卸载会有意保留 `$DSH_HOME/deepsee`。需要完整诊断重置时，先停止 Harness，把这个目录改名为 `deepsee.backup`，再重新安装。改名比删除更安全，也方便找回模型偏好与日志。

## 提交有效的问题报告

在 [GitHub Issues](https://github.com/WUBING2023/deepsee/issues) 中提供：

- 操作系统与 Node.js 版本；
- DeepSee 与 Harness 版本；
- 出错的是 Web 还是 Headless；
- 相关的 `doctor` 行；
- 最小复现步骤；
- 已脱敏的日志片段。

发布日志前，请删除 API Key、Bearer Token、凭据引用、本机用户名和私人文件内容。
