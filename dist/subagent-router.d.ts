import type { AgentOptions } from "@deepseek-ai/dsh-agent";
import type { ModelRegistryFile } from "./model-registry.js";
/**
 * Resolve the model field used by a Prime Workflow child.
 *
 * A workflow writes `model: "<DeepSee route id>"`. The DeepSee subagent provider
 * turns that registry id into a normal Harness LLM provider/model pair, then
 * delegates the complete child lifecycle to Harness' built-in spawn provider.
 */
export declare function resolveDeepSeeAgentOptions(registry: ModelRegistryFile, requested: AgentOptions | undefined): AgentOptions | undefined;
