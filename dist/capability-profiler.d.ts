import type { Context } from "@deepseek-ai/cordis";
import { type LlmRuntime, type LlmResolvedModelInfo } from "@deepseek-ai/dsh-llm";
import { type ModelRoute } from "./model-registry.js";
export interface CapabilityProfile {
    strengths: string[];
    vision: boolean;
    visionVerified: boolean;
    capabilities: string[];
    roles: string[];
    description: string;
}
export declare function isPlaceholderCapability(value: string): boolean;
export declare function parseCapabilityProfile(text: string, info?: Pick<LlmResolvedModelInfo, "inputModalities" | "reasoning">): CapabilityProfile;
export declare function requestCapabilityProfile(llm: LlmRuntime, route: Pick<ModelRoute, "runtimeProvider" | "provider" | "runtimeModel" | "model">, signal?: AbortSignal): Promise<CapabilityProfile>;
export declare function installCapabilityProfiler(ctx: Context, registryFile: string): void;
