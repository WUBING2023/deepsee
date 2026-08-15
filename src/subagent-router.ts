import type { AgentOptions } from "@deepseek-ai/dsh-agent";
import type { ModelRegistryFile, ModelRoute } from "./model-registry.js";

const ROUTE_ID_PREFIXES = ["api:", "harness:", "cli:", "ocr:"] as const;

function looksLikeRouteId(value: string): boolean {
  return ROUTE_ID_PREFIXES.some((prefix) => value.startsWith(prefix));
}

function assertRunnable(route: ModelRoute): void {
  if (!route.enabled) {
    throw new Error(`DeepSee route "${route.id}" is disabled by the user.`);
  }
  if (route.status !== "ready") {
    throw new Error(`DeepSee route "${route.id}" is ${route.status}, not ready.`);
  }
  if (route.source === "cli" || route.source === "ocr") {
    throw new Error(
      `DeepSee route "${route.id}" is discovered but does not yet have a verified Harness child-agent adapter.`,
    );
  }
}

/**
 * Resolve the model field used by a Prime Workflow child.
 *
 * A workflow writes `model: "<DeepSee route id>"`. The DeepSee subagent provider
 * turns that registry id into a normal Harness LLM provider/model pair, then
 * delegates the complete child lifecycle to Harness' built-in spawn provider.
 */
export function resolveDeepSeeAgentOptions(
  registry: ModelRegistryFile,
  requested: AgentOptions | undefined,
): AgentOptions | undefined {
  const requestedModel = requested?.model?.trim();
  if (!requestedModel) return requested;

  const route = registry.routes.find((candidate) => candidate.id === requestedModel);
  if (!route) {
    if (looksLikeRouteId(requestedModel)) {
      throw new Error(`DeepSee route "${requestedModel}" was not found in the model registry.`);
    }
    return requested;
  }

  assertRunnable(route);
  return {
    ...requested,
    provider: route.runtimeProvider ?? route.provider,
    model: route.runtimeModel ?? route.model,
  };
}
