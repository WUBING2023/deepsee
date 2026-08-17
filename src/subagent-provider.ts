import type { Context } from "@deepseek-ai/cordis";
import type { SubagentProvider } from "@deepseek-ai/dsh-subagent";
import type { ModelRegistryFile } from "./model-registry.js";
import { resolveDeepSeeAgentOptions } from "./subagent-router.js";

export const DEEPSEE_SUBAGENT_PROVIDER = "opends";

/**
 * Build the provider used by the native Workflow engine.
 *
 * A Workflow child selects a public DeepSee route with `model: <route id>`.
 * CLI routes go to their verified native provider. Every other child is
 * delegated to Harness' normal in-process spawn provider after route mapping.
 */
export function createDeepSeeSubagentProvider(
  ctx: Context,
  getRegistry: () => ModelRegistryFile,
): SubagentProvider {
  return {
    name: DEEPSEE_SUBAGENT_PROVIDER,
    capabilities: {
      outputSchema: true,
      depthLimit: true,
      toolFilter: true,
      persona: true,
    },
    inheritsParentContext: false,
    async start(request) {
      const registry = getRegistry();
      const requestedModel = request.agentOptions?.model?.trim();
      const cliRoute = requestedModel
        ? registry.routes.find((route) => route.id === requestedModel && route.source === "cli")
        : undefined;

      if (cliRoute) {
        if (!cliRoute.enabled || cliRoute.status !== "ready") {
          throw new Error(cliRoute.statusReason || `DeepSee CLI route "${cliRoute.id}" is not available.`);
        }
        if (!cliRoute.runtimeProvider) {
          throw new Error(`DeepSee CLI route "${cliRoute.id}" has no verified Harness provider adapter.`);
        }
        const runtime = ctx.subagents.getProvider(cliRoute.runtimeProvider);
        if (!runtime) {
          throw new Error(`Harness provider "${cliRoute.runtimeProvider}" is not available for ${cliRoute.id}.`);
        }
        if (request.outputSchema && !runtime.capabilities.outputSchema) {
          throw new Error(`${cliRoute.id} does not support structured output.`);
        }
        if (request.maxDepth !== undefined && !runtime.capabilities.depthLimit) {
          throw new Error(`${cliRoute.id} does not support depth limits.`);
        }
        if (request.toolFilter && !runtime.capabilities.toolFilter) {
          throw new Error(`${cliRoute.id} does not support tool filters.`);
        }
        if (request.persona && !runtime.capabilities.persona) {
          throw new Error(`${cliRoute.id} does not support a custom persona.`);
        }

        const { model: _routeId, provider: _provider, ...remainingOptions } = request.agentOptions || {};
        const selectedCliModel = cliRoute.cliModel?.trim();
        const { agentOptions: _originalOptions, ...baseRequest } = request;
        return runtime.start({
          ...baseRequest,
          ...(Object.keys(remainingOptions).length > 0 || selectedCliModel
            ? { agentOptions: { ...remainingOptions, ...(selectedCliModel ? { model: selectedCliModel } : {}) } }
            : {}),
        });
      }

      const spawn = ctx.subagents.getProvider("spawn");
      if (!spawn) {
        throw new Error('DeepSee requires the built-in Harness "spawn" subagent provider.');
      }
      const agentOptions = resolveDeepSeeAgentOptions(registry, request.agentOptions);
      return spawn.start({
        ...request,
        ...(agentOptions ? { agentOptions } : {}),
      });
    },
  };
}

export function installDeepSeeSubagentProvider(
  ctx: Context,
  getRegistry: () => ModelRegistryFile,
): void {
  ctx.subagents.registerProvider(createDeepSeeSubagentProvider(ctx, getRegistry));
}
