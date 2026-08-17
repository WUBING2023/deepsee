import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ModelRegistryFile } from "./model-registry.js";
export declare function runModelRoute(ctx: Pick<Context, "subagents">, registry: ModelRegistryFile, input: {
    route: string;
    prompt: string;
    model?: string;
}, parent: Agent, signal: AbortSignal, inheritedGlobalMemory?: string): Promise<{
    route: string;
    model: string;
    text: string;
}>;
export declare function installModelRouteTool(ctx: Context, getRegistry: () => ModelRegistryFile, inheritedGlobalMemory?: string): void;
