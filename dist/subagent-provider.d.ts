import type { Context } from "@deepseek-ai/cordis";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { ModelRegistryFile } from "./model-registry.js";
export declare const DEEPSEE_SUBAGENT_PROVIDER = "opends";
/**
 * Build the provider used by the native Workflow engine.
 *
 * A Workflow child selects a public DeepSee route with `model: <route id>`.
 * CLI routes go to their verified native provider. Every other child is
 * delegated to Harness' normal in-process spawn provider after route mapping.
 */
export declare function createDeepSeeSubagentProvider(ctx: Context, getRegistry: () => ModelRegistryFile): SubagentProvider;
export declare function installDeepSeeSubagentProvider(ctx: Context, getRegistry: () => ModelRegistryFile): void;
