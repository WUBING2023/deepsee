import type { Context } from "@deepseek-ai/cordis";
import {
  LlmAdapter,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type LlmRuntime,
  type StreamChunk,
  type UserMessage,
} from "@deepseek-ai/dsh-llm";
import {
  countImages,
  describeImages,
  rewriteWithVisualContext,
  visionCacheKey,
  VisionDescriptionCache,
  type VisionBridgeConfig,
} from "./vision.js";

export interface VisionAdapterConfig extends VisionBridgeConfig {
  route: string;
  primaryProvider: string;
  cacheEntries: number;
}

export type VisionDescriber = (message: UserMessage, signal?: AbortSignal) => Promise<string>;

export interface VisionAdapterSelection {
  config: VisionAdapterConfig;
  describer?: VisionDescriber;
}

export type VisionSelectionResolver = () => VisionAdapterSelection | Promise<VisionAdapterSelection>;

type DelegatingRuntime = Pick<
  LlmRuntime,
  "listModels" | "resolveModelInfo" | "providerRetryPolicy" | "stream"
>;

function visualName(name: string): string {
  return name + " \u00b7 \u6df1\u89c1";
}

/**
 * A first-class Harness model route that advertises image input while keeping
 * DeepSeek as the answering model. Images are converted to an untrusted visual
 * observation by the configured external model before the request is delegated.
 */
export class VisionBridgeAdapter extends LlmAdapter {
  private readonly cache: VisionDescriptionCache;

  constructor(
    private readonly ctx: Pick<Context, "llm">,
    private readonly runtime: DelegatingRuntime,
    private readonly config: VisionAdapterConfig,
    private readonly describer?: VisionDescriber,
    private readonly resolveSelection?: VisionSelectionResolver,
  ) {
    super();
    if (config.route === config.primaryProvider) {
      throw new Error("DeepSee vision route must differ from its primary provider");
    }
    this.cache = new VisionDescriptionCache(config.cacheEntries);
  }

  providerInfo(provider: string): LlmProviderInfo {
    return {
      id: provider,
      name: "DeepSeek \u6df1\u89c1",
    };
  }

  providerRetryPolicy(_provider: string) {
    return this.runtime.providerRetryPolicy(this.config.primaryProvider);
  }

  async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const selected = this.resolveSelection ? await this.resolveSelection() : { config: this.config, describer: this.describer };
    const models = await this.runtime.listModels(selected.config.primaryProvider);
    return models.map((model) => ({
      ...model,
      provider,
      name: visualName(model.name),
      description: "\u7531\u6df1\u89c1\u8c03\u7528 " + selected.config.model + " \u8bc6\u56fe\uff0cDeepSeek \u5c06\u6839\u636e\u8bc6\u56fe\u7ed3\u679c\u7ee7\u7eed\u56de\u7b54",
      inputModalities: ["text", "image"],
    }));
  }

  async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    const selected = this.resolveSelection ? await this.resolveSelection() : { config: this.config, describer: this.describer };
    const resolved = await this.runtime.resolveModelInfo(selected.config.primaryProvider, model, signal);
    return {
      ...resolved,
      provider,
      name: visualName(resolved.name),
      description: "\u7531\u6df1\u89c1\u8c03\u7528 " + selected.config.model + " \u8bc6\u56fe\uff0cDeepSeek \u5c06\u6839\u636e\u8bc6\u56fe\u7ed3\u679c\u7ee7\u7eed\u56de\u7b54",
      inputModalities: ["text", "image"],
    };
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const selected = this.resolveSelection ? await this.resolveSelection() : { config: this.config, describer: this.describer };
    const config = selected.config;
    const messages = [];
    for (const message of options.messages) {
      if (message.role !== "user" || countImages(message.content) === 0) {
        messages.push(message);
        continue;
      }

      const userMessage = message as UserMessage;
      const cacheKey = visionCacheKey(userMessage, config);
      const description = await this.cache.getOrCreate(
        cacheKey,
        () => selected.describer
          ? selected.describer(userMessage, options.signal)
          : describeImages(this.ctx as Context, userMessage, config, options.signal, options.sessionId),
      );
      messages.push(rewriteWithVisualContext(userMessage, description, config));
    }

    yield* this.runtime.stream({
      ...options,
      provider: config.primaryProvider,
      messages,
    });
  }
}
