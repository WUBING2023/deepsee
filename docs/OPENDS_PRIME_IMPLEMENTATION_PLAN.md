# DeepSee Prime 完整实施计划

> [!NOTE]
> 这是早期产品设计与实施记录，保留用于追溯决策，不代表当前使用说明。当前能力边界请以[中文 README](../README.zh-CN.md)和[架构说明](ARCHITECTURE.zh-CN.md)为准。

## 当前实施状态（2026-08-14）

目前已完成可发布 Alpha 的轻量主链路：视觉桥、模型注册表与扫描、用户能力/职位覆盖、DeepSee 侧栏、首次视觉引导、显式 `/workflow`、Prime preset、Plan 执行模式约定，以及 API/Harness 路线到原生 Workflow 子 Agent 的统一路由代理。本机当前发现 2 条 `ready` 路线：DeepSeek 主模型与 Kimi 完整视觉 API。

CLI Runtime 与 MinerU 目前只做安全发现和状态展示，尚未实现统一调用、登录健康检查与一键安装；因此不会参与自动选择。Workflow 卡片的 DeepSee 路由摘要、并发/预算 UI 也留在后续 Alpha。该边界刻意保持产品轻量，并避免把“已安装”误当成“可自动调用”。

## 1. 产品定义

DeepSee Prime 是 DeepSeek Harness 的轻量模型能力与路由插件。它不替代 Harness 的 Loop、Goal、Plan、Subagent 和 Workflow，而是让这些原生能力知道本机有哪些可用模型、各自适合什么工作，并在需要时选择合适的 API、CLI Runtime 或本地 OCR。

产品只坚持两个硬约束：

1. 用户显式禁用的模型永不调用。
2. Prime 启用前必须配置并通过一次验证的视觉读取路线。

其他选择默认采用可解释的软策略：系统给模型填写能力与职位建议，用户可以修改；执行模型与检查模型默认不同，但在资源不足或用户指定时允许相同；是否进入 Workflow 由显式命令、任务复杂度和已批准 Plan 共同决定。

## 2. 核心用户体验

### 2.1 首次进入

安装 DeepSee 后，用户首次打开 Harness Web 时看到一个简短的首次配置卡：

- 选择已有视觉 API；
- 添加新的视觉 API；
- 安装本地 OCR（首个候选为 MinerU）；
- 暂不配置并继续使用原始 Harness，此时 Prime 和自动视觉保持停用。

视觉路线分为两级，界面必须如实标注：

- `full-vision`：能处理场景、物体、图表、截图和文字；
- `ocr-only`：MinerU 等文档/OCR 引擎，只负责提取文字与版面，不承诺识别人物、物体或场景。

只要一条路线完成真实测试，DeepSee Prime 即可启用。API Key 不写入模型注册表或提示词；注册表只保存安全的凭据引用。

### 2.2 DeepSee 侧栏

Harness 左侧栏增加 DeepSee 入口，打开轻量抽屉而不是独立管理后台。抽屉包含：

- 当前主模型；
- 当前视觉读取路线；
- 已发现的 Harness Provider、API 模型、CLI Runtime 和本地 OCR；
- 每个模型的启用开关；
- 模型能力标签与职位描述；
- 最近检测状态；
- “重新扫描”和“测试连接”；
- Prime 自动 Workflow 开关。

模型的默认职位示例：

- Claude Code：代码实现、代码审查；
- Codex：代码实现、仓库操作；
- DeepSeek：主对话、推理、通用执行；
- 豆包：中文写作、改写；
- Kimi Vision：视觉、长文档；
- MinerU：OCR、PDF 版面解析。

这些只是 `inferred` 建议。用户修改后标记为 `user`，后续扫描和版本升级不得覆盖。

### 2.3 显式 Workflow 命令

命令菜单增加：

```text
/workflow [任务]
```

命令的作用是向当前 Agent 提交一条明确的 Workflow 执行请求，使 Harness 原生 `workflow` 工具负责实际运行并继续使用原生 Workflow 卡片展示阶段和子 Agent。

若没有参数，命令提示用户补充任务；若当前模型或 preset 没有 Workflow 工具，则返回清晰错误，不静默退化。

### 2.4 Prime 模式

Prime 是一个基于标准模式的 Agent preset，不另建 Agent 框架。它保留标准模式的工具、权限和会话行为，只增加 DeepSee 路由说明：

- 简单、单线任务继续使用普通 Loop；
- 单个短委派优先使用普通 Subagent；
- 存在两条以上真正独立的工作流、多项交付物或能力角色、实现加独立复核、多模型/多方案对比，或用户显式要求团队执行时，优先选择 Workflow；
- 用户选择 Prime 本身视为允许系统按任务复杂度自动决定是否使用 Workflow；
- 经过用户批准的 Plan 若标记为 `Execution mode: Workflow`，后续实施必须继续使用 Workflow；
- Plan 未标记 Workflow 时，不强行升级为 Workflow。

Prime 的判断保持提示词层面的平衡软策略，不增加复杂分类器。对比与复核在存在两个合适路线时使用不同模型，由主模型汇总分歧；视觉就绪状态只约束图片任务，不关闭纯文本、代码、研究或文档 Workflow。禁用模型仍由 DeepSee 在调用边界校验。

### 2.5 Plan 到 Workflow

Plan 模式仍采用 Harness 原生的对话修改和用户批准流程。Prime 提示模型在计划顶部给出：

```text
Execution mode: Loop | Subagent | Workflow
```

当模式为 Workflow 时，计划中的工作项还应带有简单角色需求，例如 `coding`、`writing`、`vision`、`review`。计划批准后，模型查询 DeepSee 模型注册表，为每个子 Agent 选择路线，并调用原生 Workflow 工具。

首版不实现运行中 Workflow 的任意图编辑。用户在运行中改变方向时，取消当前 Workflow，保留已经返回的结果，再由 Agent 根据新要求启动剩余工作。这比实现持久化 DAG 控制器更轻、更符合当前 Harness 的前台 Workflow 语义。

## 3. 模型注册表

### 3.1 数据源

安装和手动重新扫描时读取：

1. Harness 当前已配置的 Provider 与模型；
2. DeepSee 添加的 API；
3. `PATH` 和常见安装位置中的受支持 CLI；
4. DeepSee 安装的 OCR Runtime；
5. 用户的能力与职位覆盖。

扫描只检测程序和公开配置，不读取其他产品的登录 Token、浏览器凭据或私有会话。

### 3.2 最小数据结构

```json
{
  "version": 1,
  "routes": [
    {
      "id": "kimi-api:kimi-k3",
      "source": "api",
      "provider": "kimi",
      "model": "kimi-k3",
      "runtimeProvider": "opends-bridge",
      "runtimeModel": "kimi-k3",
      "enabled": true,
      "status": "ready",
      "capabilities": ["text", "vision", "long-context"],
      "roles": ["vision", "document"],
      "description": "适合图片和长文档理解",
      "descriptionSource": "inferred",
      "visionLevel": "full-vision",
      "credentialRef": "env:OPENDS_BRIDGE_API_KEY",
      "lastCheckedAt": "2026-08-14T00:00:00.000Z"
    }
  ],
  "preferences": {
    "primaryRouteId": "deepseek-official:deepseek-v4-flash",
    "visionRouteId": "kimi-api:kimi-k3",
    "reviewPolicy": "prefer-different",
    "primeAutoWorkflow": true
  }
}
```

状态文件保存于 DeepSee 本地数据目录并加入忽略列表。给模型的不是整份 JSON，而是一个精简查询工具：

- `opends_list_models`：按能力或职位筛选；
- `opends_get_model`：读取一条路线的用户修正说明。

这样避免每轮把完整注册表塞入系统提示词。

### 3.3 能力可信度

能力来源分为：

- `declared`：Provider 明确声明；
- `verified`：DeepSee 已实际测试；
- `inferred`：根据产品和模型名给出的默认建议；
- `user`：用户覆盖。

视觉路线必须为 `verified`；普通职位允许使用 `inferred` 或 `user`。

## 4. Runtime 发现与调用

### 4.1 首批 Runtime

- Harness 内已有模型；
- OpenAI-compatible API；
- Anthropic API；
- Claude Code CLI；
- Codex CLI；
- Kimi CLI；
- Ollama；
- MinerU。

每个 CLI 使用独立 Adapter，统一输出为 DeepSee 子 Agent 结果。检测到 CLI 不等于自动获得权限：DeepSee 只报告 `installed`，实际完成一次无敏感内容的健康检查后才标记 `ready`。

### 4.2 订阅边界

DeepSee 不提取订阅产品的凭据。CLI 只有在厂商提供稳定的非交互模式、当前用户已经登录、且调用方式允许自动化时才启用。厂商订阅不等同于 API 配额，UI 必须分别标注 `CLI subscription` 与 `API`。

## 5. 模型选择策略

DeepSee 根据任务需要过滤禁用和不可用路线，然后参考能力、职位说明与用户偏好给出候选。首版采用简单排序，不做复杂评分模型：

1. 满足必需能力；
2. 用户指定；
3. 用户职位覆盖；
4. 已验证能力；
5. 默认职位建议；
6. 当前可用状态。

执行与检查默认采用不同路线，但这是 `prefer-different`，不是绝对限制。只有用户将其设为 `require-different` 时才作为硬策略；没有第二条合适路线时应请求用户选择，而不是无限循环。

## 6. Harness 集成点

- **Loop**：继续由 Harness 驱动；DeepSee 只补充视觉与可选模型咨询。
- **Goal**：在阶段性完成或最终完成前，Prime 可建议使用不同 Reviewer；不在每一步重复检查。
- **Plan**：使用原生 Plan 对话与批准；Prime 增加执行模式和角色需求说明。
- **Workflow**：继续使用原生 `workflow` 工具与 UI 卡片；Prime worker 使用统一 DeepSee Subagent Provider，把注册表 route id 映射为 Harness provider/model，再把完整子 Agent 生命周期交回原生 `spawn`。
- **命令**：DeepSee 注册全局 `/workflow`，让它出现在现有命令菜单。
- **Preset**：安装器创建用户级 `prime` preset，不修改 Harness 安装目录。
- **Web UI**：通过现有 slot 系统增加侧栏入口、首次配置卡和视觉/路由状态提示。

## 7. 实施阶段

### Phase A：可见入口与注册表骨架

- 注册 `/workflow [任务]`；
- 增加模型注册表类型、读写、默认能力和用户覆盖合并；
- 扫描 Harness 配置及首批 CLI 的安装状态；
- 增加 `opends_list_models` 工具；
- 更新诊断命令显示发现结果，不显示凭据。

验收：命令菜单出现 Workflow；注册表能稳定重建；用户覆盖不会被扫描覆盖。

### Phase B：Prime preset

- 安装器创建 `prime/preset.yml` 和基于标准模式的 `agent.cordis.yml`；
- 加入轻量自动 Workflow 判断；
- Plan 输出 `Execution mode`；
- Workflow Plan 批准后继续使用 Workflow；
- 模式选择器出现“Prime 模式”。

验收：单线简单任务不启动 Workflow；显式 `/workflow` 必须启动请求；两条以上独立工作流、多模型对比和 Workflow Plan 会调用原生 Workflow，并在存在两个合适路线时使用不同模型完成执行/复核或对比。

### Phase C：DeepSee 侧栏与首次配置

- 注册侧栏 DeepSee 按钮和抽屉；
- 展示模型、能力、职位和启用状态；
- 支持修改说明、能力标签、职位和默认模型；
- 首次进入检测视觉路线；
- 通过 Harness 安全服务或 DeepSee 本地服务提交 API 配置，不将 Key 放入浏览器持久化；
- 配置完成后执行一次最小视觉测试。

验收：未配置时 Prime 明确停用；配置后无需修改 YAML；刷新页面仍保留设置。

### Phase D：Runtime 与 OCR

- 实现 Claude Code、Codex、Kimi、Ollama Adapter；
- 增加安装/登录/健康状态；
- 提供 MinerU 的显式下载安装流程；
- 区分 OCR-only 与 full-vision；
- 添加卸载和更新检查。

验收：扫描不读取秘密；未登录 Runtime 不被自动调用；OCR 不被错误宣传为场景视觉。

### Phase E：多模型 Workflow 路由

- 注册统一的 DeepSee Subagent Provider；**已完成**
- Workflow 子 Agent 使用注册表 route id；**已完成（API/Harness 路线）**
- 按角色选择模型并记录实际路线；**候选选择已完成，卡片摘要待完成**
- Workflow 卡片旁增加 DeepSee 路由摘要；
- 增加并发、超时和调用次数上限。

验收：同一 Workflow 可以使用不同模型；禁用模型永不被选择；失败时只使用已启用的合适候选回退。

## 8. 测试与发布标准

### 自动测试

- 注册表迁移、合并和用户覆盖；
- CLI 检测与未登录状态；
- 模型筛选与禁用规则；
- `/workflow` 参数和消息构造；
- Prime Workflow 判断样例；
- OCR-only 与 full-vision 的能力隔离；
- API Key 不出现在日志、注册表、命令结果和前端状态中。

### 本地集成验收

1. 全新配置启动 3080，出现视觉配置提示；
2. 配置 Kimi 后完成真实图片识别；
3. 命令菜单可见 `/workflow`；
4. Prime 简单问题使用普通 Loop；
5. Prime 多工作流任务显示 Harness 原生 Workflow 卡片；
6. Workflow Plan 经对话修改、批准后仍以 Workflow 执行；
7. 修改模型职位后，下一次候选查询使用用户描述；
8. 禁用某模型后，它不再出现在可调用候选中；
9. 未登录 CLI 只显示已安装，不参与自动选择；
10. 官方 3081 基线不受影响。

## 9. 明确不做

- 不重写 Harness Agent Loop；
- 不建立独立 Goal 数据库；
- 不做可视化 DAG 编辑器；
- 不实现运行中任意修改 Workflow 图；
- 不抓取其他 CLI 的登录 Token；
- 不把所有调用都升级为双模型检查；
- 不用模型自动生成的任意 JavaScript 代替安全边界；
- 不把 MinerU 宣传成通用视觉模型。

## 10. 完成定义

DeepSee Prime 完成时，用户能够在一个轻量侧栏中看到和修正本机可用模型；首次配置一条真实可用的视觉路线；选择主模型；通过显式命令或 Prime 自动判断启动 Harness 原生 Workflow；让 Workflow 按模型注册表为子 Agent 选择合适路线，同时保留标准模式、官方 Harness 和现有视觉桥的行为。
