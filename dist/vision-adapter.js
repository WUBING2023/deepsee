import { LlmAdapter, } from "@deepseek-ai/dsh-llm";
import { countImages, describeImages, rewriteWithVisualContext, visionCacheKey, VisionDescriptionCache, } from "./vision.js";
function visualName(name, visionModel) {
    return name + " + " + visionModel + " \u89c6\u89c9";
}
/**
 * A first-class Harness model route that advertises image input while keeping
 * DeepSeek as the answering model. Images are converted to an untrusted visual
 * observation by the configured external model before the request is delegated.
 */
export class VisionBridgeAdapter extends LlmAdapter {
    ctx;
    runtime;
    config;
    describer;
    cache;
    constructor(ctx, runtime, config, describer) {
        super();
        this.ctx = ctx;
        this.runtime = runtime;
        this.config = config;
        this.describer = describer;
        if (config.route === config.primaryProvider) {
            throw new Error("DeepSee vision route must differ from its primary provider");
        }
        this.cache = new VisionDescriptionCache(config.cacheEntries);
    }
    providerInfo(provider) {
        return {
            id: provider,
            name: "DeepSee \u89c6\u89c9\u6865\uff08DeepSeek + " + this.config.model + "\uff09",
        };
    }
    providerRetryPolicy(_provider) {
        return this.runtime.providerRetryPolicy(this.config.primaryProvider);
    }
    async listModels(provider) {
        const models = await this.runtime.listModels(this.config.primaryProvider);
        return models.map((model) => ({
            ...model,
            provider,
            name: visualName(model.name, this.config.model),
            description: "\u56fe\u7247\u7531 " + this.config.model + " \u8bc6\u522b\uff0c\u6587\u5b57\u4efb\u52a1\u4ecd\u7531 DeepSeek \u5b8c\u6210",
            inputModalities: ["text", "image"],
        }));
    }
    async resolveModel(provider, model, signal) {
        const resolved = await this.runtime.resolveModelInfo(this.config.primaryProvider, model, signal);
        return {
            ...resolved,
            provider,
            name: visualName(resolved.name, this.config.model),
            description: "\u56fe\u7247\u7531 " + this.config.model + " \u8bc6\u522b\uff0c\u6587\u5b57\u4efb\u52a1\u4ecd\u7531 DeepSeek \u5b8c\u6210",
            inputModalities: ["text", "image"],
        };
    }
    async *stream(options) {
        const messages = [];
        for (const message of options.messages) {
            if (message.role !== "user" || countImages(message.content) === 0) {
                messages.push(message);
                continue;
            }
            const userMessage = message;
            const cacheKey = visionCacheKey(userMessage, this.config);
            const description = await this.cache.getOrCreate(cacheKey, () => this.describer
                ? this.describer(userMessage, options.signal)
                : describeImages(this.ctx, userMessage, this.config, options.signal));
            messages.push(rewriteWithVisualContext(userMessage, description, this.config));
        }
        yield* this.runtime.stream({
            ...options,
            provider: this.config.primaryProvider,
            messages,
        });
    }
}
