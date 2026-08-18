import { LlmAdapter, } from "@deepseek-ai/dsh-llm";
import { countImages, describeImages, rewriteWithVisualContext, visionCacheKey, VisionDescriptionCache, } from "./vision.js";
function visualName(name) {
    return name + " \u00b7 \u6df1\u89c1";
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
    resolveSelection;
    cache;
    constructor(ctx, runtime, config, describer, resolveSelection) {
        super();
        this.ctx = ctx;
        this.runtime = runtime;
        this.config = config;
        this.describer = describer;
        this.resolveSelection = resolveSelection;
        if (config.route === config.primaryProvider) {
            throw new Error("DeepSee vision route must differ from its primary provider");
        }
        this.cache = new VisionDescriptionCache(config.cacheEntries);
    }
    providerInfo(provider) {
        return {
            id: provider,
            name: "DeepSeek \u6df1\u89c1",
        };
    }
    providerRetryPolicy(_provider) {
        return this.runtime.providerRetryPolicy(this.config.primaryProvider);
    }
    async listModels(provider) {
        const selected = this.resolveSelection ? await this.resolveSelection() : { config: this.config, describer: this.describer };
        const models = await this.runtime.listModels(selected.config.primaryProvider);
        return models.map((model) => ({
            ...model,
            provider,
            name: visualName(model.name),
            description: "\u7531\u6df1\u89c1\u8c03\u7528 " + selected.config.model + " \u8bc6\u56fe\uff0c\u518d\u7531\u5f53\u524d\u4e3b\u6a21\u578b\u7ee7\u7eed\u56de\u7b54",
            inputModalities: ["text", "image"],
        }));
    }
    async resolveModel(provider, model, signal) {
        const selected = this.resolveSelection ? await this.resolveSelection() : { config: this.config, describer: this.describer };
        const resolved = await this.runtime.resolveModelInfo(selected.config.primaryProvider, model, signal);
        return {
            ...resolved,
            provider,
            name: visualName(resolved.name),
            description: "\u7531\u6df1\u89c1\u8c03\u7528 " + selected.config.model + " \u8bc6\u56fe\uff0c\u518d\u7531\u5f53\u524d\u4e3b\u6a21\u578b\u7ee7\u7eed\u56de\u7b54",
            inputModalities: ["text", "image"],
        };
    }
    async *stream(options) {
        const selected = this.resolveSelection ? await this.resolveSelection() : { config: this.config, describer: this.describer };
        const config = selected.config;
        const messages = [];
        for (const message of options.messages) {
            if (message.role !== "user" || countImages(message.content) === 0) {
                messages.push(message);
                continue;
            }
            const userMessage = message;
            const cacheKey = visionCacheKey(userMessage, config);
            const description = await this.cache.getOrCreate(cacheKey, () => selected.describer
                ? selected.describer(userMessage, options.signal)
                : describeImages(this.ctx, userMessage, config, options.signal, options.sessionId));
            messages.push(rewriteWithVisualContext(userMessage, description, config));
        }
        yield* this.runtime.stream({
            ...options,
            provider: config.primaryProvider,
            messages,
        });
    }
}
