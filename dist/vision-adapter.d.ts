import type { Context } from "@deepseek-ai/cordis";
import { LlmAdapter, type GenerateOptions, type LlmModelInfo, type LlmProviderInfo, type LlmResolvedModelInfo, type LlmRuntime, type StreamChunk, type UserMessage } from "@deepseek-ai/dsh-llm";
import { type VisionBridgeConfig } from "./vision.js";
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
type DelegatingRuntime = Pick<LlmRuntime, "listModels" | "resolveModelInfo" | "providerRetryPolicy" | "stream">;
/**
 * A first-class Harness model route that advertises image input while keeping
 * DeepSeek as the answering model. Images are converted to an untrusted visual
 * observation by the configured external model before the request is delegated.
 */
export declare class VisionBridgeAdapter extends LlmAdapter {
    private readonly ctx;
    private readonly runtime;
    private readonly config;
    private readonly describer?;
    private readonly resolveSelection?;
    private readonly cache;
    constructor(ctx: Pick<Context, "llm">, runtime: DelegatingRuntime, config: VisionAdapterConfig, describer?: VisionDescriber | undefined, resolveSelection?: VisionSelectionResolver | undefined);
    providerInfo(provider: string): LlmProviderInfo;
    providerRetryPolicy(_provider: string): import("@deepseek-ai/dsh-llm").ResolvedRetryPolicy;
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
}
export {};
