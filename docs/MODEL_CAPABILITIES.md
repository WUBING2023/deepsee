# Model capability initialization

DeepSee uses [Models.dev](https://models.dev/) as its cross-provider default capability catalog. The MIT-licensed open-source database exposes public JSON and normalizes input/output modalities, reasoning, tool calling, context limits, and short capability descriptions. It is also the model database used by OpenCode.

## Why this source

No provider documentation covers every vendor. Provider docs are the most authoritative source for their own models, but their formats differ. Leaderboards measure relative performance and cannot reliably answer whether a model accepts images, produces images, or supports tool calls. Models.dev is therefore a practical initialization source, while provider documentation remains the reference for disputed model-specific facts.

DeepSee applies evidence in this order:

1. user corrections in the model matrix;
2. modality metadata returned by the active Harness runtime;
3. structured Models.dev defaults;
4. one short self-profile request to the selected model;
5. conservative inference from the model ID and Harness description.

A third-party catalog can neither enable an unusable runtime nor overwrite a user decision.

## Capabilities stay distinct

| Catalog evidence | DeepSee tag | Meaning |
| --- | --- | --- |
| image input + text output | `vision` | image understanding, visual QA, document understanding |
| image output | `image-generation` | generation or editing; it does not automatically become a visual reader |
| audio/video input | `audio-input` / `video-input` | understanding that medium |
| audio/video output | `audio-generation` / `video-generation` | generating that medium |
| `reasoning` / `tool_call` | `reasoning` / `tools` | reasoning and agent tool use |
| PDF input or OCR description | `document` / `ocr` | document reading and text extraction |

## Refresh, cache, and privacy

- During the first Harness model sync, DeepSee attempts to read `https://models.dev/models.json`; timeout or offline failure never blocks startup.
- A successful result is cached in the DeepSee state directory and is reused for seven days. Stale data remains available offline.
- The request only downloads a public catalog. It sends no local model list, provider configuration, credential reference, or API key.
- Capability metadata is initialization guidance, not a performance guarantee. Harness/CLI startup verification still decides whether a route can be enabled.

## Other useful references

- [OpenRouter Models API](https://openrouter.ai/docs/guides/overview/models) covers many commercial and open models with explicit input/output modalities and supported parameters.
- [LiteLLM model registry schema](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.schema.json) has broad flags for vision, reasoning, tools, OCR, media inputs, and generation modes.
- [Hugging Face Model Cards](https://huggingface.co/docs/hub/model-cards) are valuable for open-model `pipeline_tag`, intended use, limitations, and evaluations, but do not comprehensively cover closed API models.
- Artificial Analysis and LM Arena are useful performance or preference leaderboards, not factual modality initialization sources.
