# 模型能力初始化

DeepSee 使用 [Models.dev](https://models.dev/) 作为跨供应商的默认模型能力目录。它是 MIT 许可的开源数据库，提供公开 JSON，并把模型的输入/输出模态、推理、工具调用、上下文和简短能力说明整理成统一结构。Models.dev 也是 OpenCode 使用的模型数据库。

## 为什么选择它

没有一个厂商官网能覆盖所有供应商。厂商文档最权威，但格式互不相同；排行榜衡量相对表现，却不能可靠回答一个模型是否接受图片输入、是否输出图片或是否支持工具调用。Models.dev 更适合做自动初始化，厂商资料则适合核对有争议的具体模型。

DeepSee 的信息优先级如下：

1. 用户在模型矩阵中的修正；
2. Harness Runtime 实际返回的模态信息；
3. Models.dev 的结构化默认值；
4. 对当前模型发出的一条短能力画像请求；
5. 模型名称与 Harness 描述中的保守推断。

这意味着第三方目录不会打开一个不可运行的 Runtime，也不会覆盖用户决定。

## 能力不会混为一谈

| 目录信息 | DeepSee 标签 | 用途 |
| --- | --- | --- |
| 图片输入 + 文本输出 | `vision` | 识图、视觉问答、文档理解 |
| 图片输出 | `image-generation` | 生图或图像编辑；不会自动成为识图模型 |
| 音频/视频输入 | `audio-input` / `video-input` | 理解对应媒体 |
| 音频/视频输出 | `audio-generation` / `video-generation` | 生成对应媒体 |
| `reasoning` / `tool_call` | `reasoning` / `tools` | 推理与 Agent 工具调用 |
| PDF 输入或 OCR 描述 | `document` / `ocr` | 文档读取与文字提取 |

## 更新、缓存与隐私

- 第一次同步 Harness 模型时，DeepSee 尝试读取 `https://models.dev/models.json`，超时或离线时继续使用现有信息。
- 成功结果缓存在 DeepSee 状态目录中，七天内不重复下载；旧缓存也可离线使用。
- 请求只下载公开目录，不发送本机模型列表、供应商配置、凭据引用或 API Key。
- 能力表是初始化建议，不是性能保证。模型是否可打开仍取决于 Harness/CLI 启动验证。

## 其他参考源

- [OpenRouter Models API](https://openrouter.ai/docs/guides/overview/models)：覆盖大量商业与开源模型，明确列出输入/输出模态和支持参数，适合交叉核对。
- [LiteLLM model registry schema](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.schema.json)：字段覆盖很广，包含视觉、推理、工具、OCR、音视频和生成类型。
- [Hugging Face Model Cards](https://huggingface.co/docs/hub/model-cards)：适合查开源模型的 `pipeline_tag`、用途、限制和评测，但不适合完整覆盖闭源 API 模型。
- Artificial Analysis、LM Arena 等排行榜适合观察质量、速度或偏好，不作为模态初始化的事实来源。
