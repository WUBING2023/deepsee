# 参与 DeepSee 开发

[English](CONTRIBUTING.md) · [返回 README](README.zh-CN.md)

DeepSee 是一个克制的小型集成项目，有一条重要规则：一条路线必须在真实 Harness 中能够执行，界面才可以把它标为可用。欢迎保持这种真实性、并让插件继续轻量的贡献。

## 开发环境

需要：

- Node.js 24 或更高版本
- pnpm 11 或更高版本
- DeepSeek Harness `0.1.0-rc.6`，这是当前实测集成版本

```powershell
git clone https://github.com/WUBING2023/deepsee.git
cd deepsee
pnpm install
pnpm run typecheck
pnpm test
pnpm run build:plugin
```

把开发构建安装到隔离的本地 profile 并打开 Web 界面：

```powershell
pnpm run install:plugin
pnpm run start:web
```

这些开发命令使用仓库内的 `.dsh` 目录，不需要覆盖正常的用户安装。

## 找到正确的修改位置

| 修改内容 | 首选入口 |
| --- | --- |
| Host 工具、提示、Workflow、Prime | `src/index.ts` |
| 模型结构与查询 | `src/model-registry.ts` |
| Harness/API 路由映射 | `src/subagent-router.ts` |
| 视觉与 OCR | `src/vision.ts`、`src/vision-adapter.ts`、`src/ocr.ts` |
| Runtime 发现与健康检查 | `scripts/runtime-discovery.mjs`、`scripts/runtime-health.mjs` |
| 侧栏界面 | `host/client.js` |
| 同源接口 | `host/admin-server.mjs` |
| 安装与 ZIP 恢复 | `scripts/install-plugin.mjs`、`scripts/folder-install.mjs` |
| MinerU 安装 | `scripts/mineru-install-strategies.mjs`、`scripts/install-mineru-worker.mjs` |
| 升级协议 | `scripts/update-policy.mjs`、`scripts/update-manager.mjs`、`scripts/update-worker.mjs` |

增加 provider 或修改状态边界前，请先阅读[架构说明](docs/ARCHITECTURE.zh-CN.md)。

## 验证要求

开发中先运行最小相关测试，提交 PR 前再运行完整检查：

```powershell
pnpm run typecheck
pnpm test
pnpm run build:plugin
```

修改安装、升级、Runtime 扫描或 provider 路由时，还应验证两个 profile：

```powershell
pnpm run install:plugin
pnpm run start:web
pnpm run start:headless
```

新增 Runtime 适配器不能只有成功测试，还应覆盖命令缺失、未登录、不支持的模型、路线关闭与适配器失败，让每种失败都明确且安全。

## 项目约定

- 优先使用 Harness 原生的 provider、设置、子 Agent 与 Workflow，不建设平行基础设施。
- 不把“只能发现”的 Runtime 标成可执行。
- 不通过浏览器接口暴露原始密钥、凭据引用或可执行路径。
- 可变状态统一放在 `$DSH_HOME/deepsee`，不写入包目录。
- 除非同时提供经过测试的迁移，否则保留 `opends-*` / `OPENDS_*` 兼容标识。
- `host/codex-provider.js` 由 `pnpm run build:plugin` 生成；应修改它的源文件再构建，不要只改生成文件。
- 面向用户的文字应保持短小，运维细节放进对应指南，不继续膨胀 README。

## Pull Request

一个清晰、聚焦的 PR 应说明：

1. 用户实际遇到的问题；
2. 选择的行为与兼容性影响；
3. 在 Web 和/或 Headless 中如何验证；
4. 是否增加状态、环境变量、网络来源或密钥边界；
5. 可见 UI 修改的截图，并移除私人模型与账号信息。

不要把 API Key 或订阅 Token 放进 commit、fixture、日志、截图或 issue。

## 许可证

提交贡献即表示同意按仓库的 [MIT License](LICENSE) 授权。
