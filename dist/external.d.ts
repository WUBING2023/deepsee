import { type LlmRuntime } from "@deepseek-ai/dsh-llm";
export interface ExternalCallConfig {
    provider: string;
    model: string;
    maxTokens: number;
}
export interface ExternalCallContext {
    llm: LlmRuntime;
}
export declare function requestExternalText(ctx: ExternalCallContext, config: ExternalCallConfig, prompt: string, signal?: AbortSignal): Promise<string>;
