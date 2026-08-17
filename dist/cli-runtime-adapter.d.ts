import type { Context } from "@deepseek-ai/cordis";
import { LlmAdapter, type ContentBlock, type GenerateOptions, type LlmModelInfo, type LlmProviderInfo, type LlmResolvedModelInfo, type StreamChunk } from "@deepseek-ai/dsh-llm";
import type { ModelRegistryFile, ModelRoute } from "./model-registry.js";
export declare function cliRuntimeProviderId(routeId: string): string;
export declare function cliBasePrompt(options: GenerateOptions): string;
export declare function cliTaskPrompt(options: GenerateOptions, route: ModelRoute): ContentBlock[];
export declare class CliRuntimeAdapter extends LlmAdapter {
    private readonly ctx;
    private readonly getRegistry;
    constructor(ctx: Pick<Context, "agents" | "subagents">, getRegistry: () => ModelRegistryFile);
    private routes;
    private route;
    providerInfo(provider: string): LlmProviderInfo;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
export declare function installCliRuntimeAdapters(ctx: Context, getRegistry: () => ModelRegistryFile): string[];
