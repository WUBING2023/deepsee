# 深见 DeepSee

[English](README.md) · [简体中文](README.zh-CN.md)

DeepSeek Harness 的一行安装视觉与模型路由插件。

DeepSee 以标准 DSH bundle 的插件形式安装在 DeepSeek Harness 之上。它不替换 Harness 的 Loop、Goal、Plan 或 Workflow，只补充三件事：视觉读取、模型能力目录、轻量多模型路由。

## 一键安装

直接从 GitHub 一行安装：

```powershell
npx --yes github:WUBING2023/deepsee install
```

这一条命令会下载预构建插件，并调用受支持的官方 Harness CLI，将 DeepSee 安装到 `web` 和 `headless` profile。它不下载 DeepSee 开发工具，不修改 Harness 的 `node_modules`，不会写手工 shim，也不会启动独立伴随服务。

安装器已针对旧电脑和慢网络处理：每个 profile 每次最多等待 15 分钟，并自动重试一次。重复运行同一命令会跳过已经安装当前 DeepSee 版本的 profile，因此可以安全续装。

网络特别慢时，可以关闭 DeepSee 安装器自身的超时限制，同时保留底层包管理器的错误输出：

```powershell
npx --yes github:WUBING2023/deepsee install --timeout-ms 0
```

恢复与定向安装：

```powershell
npx --yes github:WUBING2023/deepsee install --profile headless  # 只安装一个 profile
npx --yes github:WUBING2023/deepsee install --retries 3         # 增加瞬时失败重试次数
npx --yes github:WUBING2023/deepsee install --force             # 强制重装当前版本
```

### ZIP 压缩包兜底安装（不再通过 `npx github:` 下载 DeepSee）

如果 GitHub 一行安装超时，请用浏览器下载 [deepsee-main.zip](https://github.com/WUBING2023/deepsee/archive/refs/heads/main.zip) 并解压。进入解压后的 `deepsee-main` 文件夹，在 PowerShell 中依次运行：

```powershell
node .\scripts\cli.mjs install --from-folder --timeout-ms 0
node .\scripts\cli.mjs doctor
node .\scripts\cli.mjs web
```

这条路线直接使用 ZIP 内已经构建好的文件，不需要执行 `pnpm install`，也不需要源码构建。安装前，DeepSee 会先把插件复制到 `$DSH_HOME\deepsee\packages\<版本>`，所以安装完成后可以删除下载的 ZIP 和解压目录，不会影响插件。电脑上已有 `dsh` 命令时会优先复用；没有时，安装器只会下载锁定版本的官方 Harness CLI。

删除解压目录后，可用下面的命令启动 Harness：

```powershell
dsh --profile web
# 如果 dsh 不在 PATH 中：
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 --profile web
```

安装后按原生方式启动 Harness：

```powershell
npx --yes github:WUBING2023/deepsee web
```

从本仓库开发安装：

```powershell
pnpm install
pnpm run install:plugin
pnpm run start:web
```

默认 Web 地址是 [http://127.0.0.1:3080/](http://127.0.0.1:3080/)。

卸载并保留模型目录、首选项和 MinerU 状态：

```powershell
npx --yes github:WUBING2023/deepsee uninstall
```

## 安装后发生什么

- 标准 bundle 清单 `cordis.patch.yml` 加载 DeepSee Host、Web 客户端和可选 Codex provider。
- 插件启动时扫描已安装的 Claude Code、Codex、Kimi CLI、OpenCode 和 Ollama；只有通过版本、登录与 Harness 适配验证的路线才能打开。
- Web 直接使用 Harness 同源路由 `/api/deepsee` 读写模型状态。没有 3091 端口、Bearer 管理 Token 或第二个 Node 进程。
- 可变状态保存在 `$DSH_HOME/deepsee`，不写进 npm 包目录；升级和卸载不会删除用户配置。
- DeepSee 自动生成 `$DSH_HOME/.agent-presets/prime`。Preset 目录由 Harness 实时发现，无需修改官方 preset。
- API Key 仍由 Harness 原生“设置 → 模型”与凭据存储管理。DeepSee 只同步供应商、模型 ID、输入模态和能力描述，不读取或复制 Key。
- 旧 alpha 的 `OPENDS_BRIDGE_*` 配置可自动迁移到 Harness 的 `llm-pi-ai` 供应商元数据；只保存 Key 的引用，不把 Key 写入 `settings.yaml`。

## 已实现能力

### 视觉读取

在 DeepSee 首选项中选择：

- **模型**：从 Harness 当前已配置且确认支持图片输入的模型中选择。
- **OCR**：按需安装 MinerU，用于文档文字与版面读取。

图片会先交给所选视觉路线，DeepSeek 再根据识图结果继续回答。界面会提示当前由其他模型识图，不会再把纯文本 DeepSeek 模型显示为最终的视觉执行者。

### 模型目录

侧栏的“深见”面板只保留四列：打开、模型、来源、能力。

- 模型和来源来自 Harness 或启动扫描，不能手工伪造。
- 能力由模型短请求自动生成，用户可双击修正。
- CLI 未安装、未登录或缺少适配器时，路线保持关闭。
- Codex CLI 与 Claude Code 可以选择其已验证的模型档位。
- “添加模型”直接进入 Harness 原生模型设置，复用已经保存的供应商凭据和模型列表。

### Workflow 与 Prime

- `/workflow <任务>` 显式请求 Harness 原生可见 Workflow。
- Prime 对简单任务继续使用普通 Loop；只有多条独立工作流、跨能力角色，或已批准且标记为 Workflow 的 Plan 才进入 Workflow。
- Workflow worker 使用 `opends` provider，把 DeepSee route id 映射为真实 Harness provider/model。
- Harness/API 模型通过原生 `spawn` 子 Agent 执行；Codex 与 Claude Code 通过各自验证过的 CLI provider 执行。
- 模型目录工具 `opends_list_models` 让主模型按视觉、编码、写作、推理或审查能力选择路线。

## Web 与 Headless

同一个标准包支持两种 Harness profile：

```powershell
dsh web
dsh --profile headless "只回答 OK"
```

Headless 没有 WebServer 服务，DeepSee 会跳过同源管理路由，但 Runtime 扫描、视觉路由、模型目录、CLI provider 与 Workflow 策略仍可加载。Web profile 才会挂载 `/api/deepsee` 与侧栏界面。

## 常用命令

```powershell
npx --yes github:WUBING2023/deepsee install    # 一键安装 Web + Headless
npx --yes github:WUBING2023/deepsee uninstall  # 卸载并保留用户状态
npx --yes github:WUBING2023/deepsee doctor     # 检查 bundle、Runtime 与配置
npx --yes github:WUBING2023/deepsee web        # 启动官方 DSH Web profile

pnpm run typecheck           # 开发：类型检查
pnpm test                    # 开发：完整回归
pnpm run build:plugin        # 开发：构建 Host 与可选 Codex provider
pnpm run pack:release        # 构建并生成可发布 tarball
```

兼容期内，内部设置 namespace、工具名和部分状态文件仍使用 `opends-*` / `OPENDS_*`，以便旧安装无损迁移；公开产品、GitHub 仓库、作用域包和命令统一为 DeepSee / `WUBING2023/deepsee` / `@wubing2023/deepsee` / `deepsee`。

## 关键文件

- `cordis.patch.yml`：标准 DSH bundle 层
- `src/index.ts`：Host 插件、视觉桥、模型目录、Workflow 与 Prime 策略
- `host/admin-server.mjs`：挂载到 Harness WebServer 的同源配置路由
- `host/client.js`：DeepSee 侧栏、模型矩阵、视觉/OCR 首选项
- `host/codex-provider.js`：构建时生成的可选择模型 Codex provider
- `scripts/install-plugin.mjs`：Web + Headless 一键安装
- `scripts/folder-install.mjs`：将解压的 ZIP 持久化后执行兜底安装
- `scripts/runtime-discovery.mjs`：启动扫描、旧状态迁移与注册表生成
- `scripts/prime-preset.mjs`：基于当前 Harness 标准 preset 生成 Prime
- `scripts/uninstall-plugin.mjs`：标准卸载并保留 `$DSH_HOME/deepsee`

## 当前兼容边界

当前版本面向 DeepSeek Harness `0.1.0-rc.6`。Codex 与 Claude Code 有可执行子 Agent 适配；Kimi CLI、OpenCode 和 Ollama 在没有稳定 Harness 子 Agent 适配器时只显示验证状态，不会被伪装成可执行路线。视觉 API、普通 API 模型和供应商凭据应优先在 Harness 原生模型页配置。

## 许可证

[MIT](LICENSE) © 2026 WUBING2023
