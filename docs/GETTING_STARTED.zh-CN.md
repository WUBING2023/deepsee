# DeepSee 快速上手

[English](GETTING_STARTED.md) · [返回 README](../README.zh-CN.md)

这份指南从空白环境开始，带你完成一次真实的识图对话。大多数用户只需要看完前三节。

## 开始前准备

- 安装 [Node.js 24 或更高版本](https://nodejs.org/)。
- 首次安装时保持网络可用。
- 在 DeepSeek Harness 中准备至少一个负责主对话的文本模型。
- 视觉读取需要一个多模态 API 模型，或者足够安装一个本地 OCR 的磁盘空间。

不需要另装 DeepSee 服务。如果电脑上没有 `dsh`，安装器会使用当前 DeepSee 版本实测过的精确 Harness Runtime。

## 1. 安装并启动

在 PowerShell 或终端中运行：

```powershell
npx --yes github:WUBING2023/deepsee install
npx --yes github:WUBING2023/deepsee doctor
npx --yes github:WUBING2023/deepsee web
```

打开 [http://127.0.0.1:3080/](http://127.0.0.1:3080/)。

安装器会把同一个标准 bundle 安装到 Harness 的 `web` 与 `headless` profile。每个 profile 每次最多等待 15 分钟，并自动重试一次。重复执行同一命令是安全的：已经安装当前版本的 profile 会被跳过。

网络特别慢时，可以关闭 DeepSee 自身的超时，同时保留底层包管理器的输出：

```powershell
npx --yes github:WUBING2023/deepsee install --timeout-ms 0
```

其他恢复选项：

```powershell
npx --yes github:WUBING2023/deepsee install --retries 3
npx --yes github:WUBING2023/deepsee install --profile headless
npx --yes github:WUBING2023/deepsee install --force
```

## 2. 配置第一个视觉读取器

1. 在 Harness 中打开 **设置 → 模型**。
2. 添加或选择日常 DeepSeek 对话使用的供应商与模型。
3. 再添加至少一个声明支持图片输入的模型，或者准备使用本地 OCR。
4. 打开侧栏中的 **DeepSee** 面板。
5. 在 **视觉读取** 中选择 **模型** 并指定多模态模型，或选择 **OCR**、指定引擎并点击安装。

DeepSee 只读取 Harness 的供应商元数据与凭据引用。它不会在自己的配置中显示、复制或保存原始 API Key。

### 方案 A：多模态模型

适合照片、截图、图表，以及需要语义理解的视觉问题。只有 Harness 适配器明确确认支持图片输入的模型，才会进入视觉模型列表。

### 方案 B：本地 OCR

| 引擎 | 更适合 | 体量 |
| --- | --- | --- |
| MinerU | 复杂 PDF、论文、表格、公式和版面恢复 | 重型 |
| PaddleOCR | 中英文及多语言图片、扫描件、通用 PDF | 中型 |
| RapidOCR | 截图、票据、简单图片和低资源 CPU | 轻型 |

选择引擎并点击 **安装** 后，界面会显示阶段进度条和一行简短对比。DeepSee 会按需尝试：

1. 已经可用的对应 OCR 命令；
2. 电脑上已有的 `uv`；
3. Python + 隔离的 `venv`；
4. 下载并校验 SHA-256 的便携 UV，只保存在 DeepSee 内部；
5. 最后使用项目官方源码 ZIP 作为包安装兜底。

安装完成后，同一按钮会变为 **卸载**，只删除该引擎由 DeepSee 管理的虚拟环境、缓存、已下载模型和引导文件。若 OCR 来自系统其他位置，界面会标记为系统安装，DeepSee 不会删除它。

三个引擎默认都可以使用 CPU。PaddleOCR 在 Windows 上会自动避开非 ASCII 模型缓存路径；如果手动把 `OPENDS_OCR_HOME` 指向含中文的目录，安装会明确拒绝并提示移除该覆盖。Python 依赖和模型文件仍需要联网；源码 ZIP 并不是完整离线模型包。

## 3. 做一次真实验证

### 视觉路线

1. 新建 Harness 对话。
2. 上传一张较小的截图或照片。
3. 输入：`描述这张图片，并逐行列出其中能看到的文字。`

成功时，对话会标明实际使用的视觉读取器，并把观察结果交回基模继续回答。如果 Harness 仍提示当前模型没有视觉能力，请查看[视觉错误排查](TROUBLESHOOTING.zh-CN.md#harness-仍提示当前模型没有视觉能力)。

### Workflow 路线

至少打开两条可执行模型路线后，可以尝试：

```text
/workflow 检查这个小项目：让一个 Agent 阅读实现，另一个 Agent 检查风险，最后汇总结论。
```

Harness 应显示一个可见的 Workflow。DeepSee 会把模型目录交给主模型选择，但不会让普通的一步任务强行进入复杂编排。

## 桌面端与 CLI 扫描

DeepSee 启动时会扫描 Codex Desktop、Claude Desktop、Codex/Claude Code CLI、Kimi CLI、OpenCode 与 Ollama。被扫描到，不等于一定可以执行。

- Codex Desktop 可以提供其内置 App Server；Claude Desktop 可以直接打开，但自动执行仍需要验证通过的 Claude Code CLI。
- Codex 与 Claude Code 只有在命令、登录状态、模型选择和适配器都通过验证后才能打开。
- Kimi CLI、OpenCode 与 Ollama 目前以发现为主；没有稳定 Harness 子 Agent 适配器时不会进入可执行路线。
- 未登录或验证失败的 CLI 会保持关闭，避免 Workflow 运行到中途才报错。

安装 CLI 或重新登录后，请重启 Harness，让 DeepSee 再做一次验证。

## 压缩包兜底安装

如果 `npx github:` 多次超时，请改用这条路线。

1. 用浏览器下载 [deepsee-main.zip](https://github.com/WUBING2023/deepsee/archive/refs/heads/main.zip)。
2. 解压，在 `deepsee-main` 文件夹中打开 PowerShell。
3. 依次运行：

```powershell
node .\scripts\cli.mjs install --from-folder --timeout-ms 0
node .\scripts\cli.mjs doctor
node .\scripts\cli.mjs web
```

这条路线直接使用 ZIP 中的预构建文件，不执行 `pnpm install`，也不编译源码。安装前，DeepSee 会把插件复制到 `$DSH_HOME\deepsee\packages\<版本>`，所以成功后可以删除下载的 ZIP 与解压目录。

以后启动 Harness 可以使用：

```powershell
dsh --profile web
# 如果 dsh 不在 PATH 中：
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 --profile web
```

## 升级与卸载

打开 DeepSee 面板时会低频检查版本，默认最多每六小时一次。发现新版后点击 **升级**；检查可以自动进行，安装一定需要用户确认。面板显示 **重启生效** 后再重启 Harness。

卸载插件并保留模型偏好、路由与 MinerU 状态：

```powershell
npx --yes github:WUBING2023/deepsee uninstall
```

用户状态会保留在 `$DSH_HOME/deepsee`。只有在确实需要完全重置时，才手动删除这个目录。

## 继续阅读

- [架构与扩展点](ARCHITECTURE.zh-CN.md)
- [排障指南](TROUBLESHOOTING.zh-CN.md)
- [参与开发](../CONTRIBUTING.zh-CN.md)
