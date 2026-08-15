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

type DelegatingRuntime = Pick<
  LlmRuntime,
  "listModels" | "resolveModelInfo" | "providerRetryPolicy" | "stream"
>;

function visualName(name: string, visionModel: string): string {
  return name + " + " + visionModel + " \u89c6\u89c9";
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
      name: "DeepSee \u89c6\u89c9\u6865\uff08DeepSeek + " + this.config.model + "\uff09",
    };
  }

  providerRetryPolicy(_provider: string) {
    return this.runtime.providerRetryPolicy(this.config.primaryProvider);
  }

  async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    const models = await this.runtime.listModels(this.config.primaryProvider);
    return models.map((model) => ({
      ...model,
      provider,
      name: visualName(model.name, this.config.model),
      description: "\u56fe\u7247\u7531 " + this.config.model + " \u8bc6\u522b\uff0c\u6587\u5b57\u4efb\u52a1\u4ecd\u7531 DeepSeek \u5b8c\u6210",
      inputModalities: ["text", "image"],
    }));
  }

  async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    const resolved = await this.runtime.resolveModelInfo(this.config.primaryProvider, model, signal);
    return {
      ...resolved,
      provider,
      name: visualName(resolved.name, this.config.model),
      description: "\u56fe\u7247\u7531 " + this.config.model + " \u8bc6\u522b\uff0c\u6587\u5b57\u4efb\u52a1\u4ecd\u7531 DeepSeek \u5b8c\u6210",
      inputModalities: ["text", "image"],
    };
  }

  async *stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    const messages = [];
    for (const message of options.messages) {
      if (message.role !== "user" || countImages(message.content) === 0) {
        messages.push(message);
        continue;
      }

      const userMessage = message as UserMessage;
      const cacheKey = visionCacheKey(userMessage, this.config);
      const description = await this.cache.getOrCreate(
        cacheKey,
        () => this.describer
          ? this.describer(userMessage, options.signal)
          : describeImages(this.ctx as Context, userMessage, this.config, options.signal),
      );
      messages.push(rewriteWithVisualContext(userMessage, description, this.config));
    }

    yield* this.runtime.stream({
      ...options,
      provider: this.config.primaryProvider,
      messages,
    });
  }
}
