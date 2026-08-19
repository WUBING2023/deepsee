import type { Context } from "@deepseek-ai/cordis";
import type { SubagentProvider, SubagentRun } from "@deepseek-ai/dsh-subagent";
import { validateJsonSchemaValue } from "@deepseek-ai/dsh-tools";
import type { ModelRegistryFile } from "./model-registry.js";
import { resolveDeepSeeAgentOptions } from "./subagent-router.js";
import { recordExecutionTrace } from "../scripts/execution-trace.mjs";

export const DEEPSEE_SUBAGENT_PROVIDER = "opends";

function outputText(runOutput: Awaited<SubagentRun["result"]>["output"]): string {
  return runOutput
    .filter((block) => block.type === "text" || block.type === "reasoning")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function structuredOutputPrompt(schema: unknown): string {
  return [
    "The caller requires structured output for a DeepSeek Harness Workflow.",
    "Return ONLY one JSON object matching this JSON Schema. Do not wrap it in Markdown and do not add prose before or after it.",
    JSON.stringify(schema),
  ].join("\n");
}

function parseStructuredOutput(text: string): unknown {
  const candidates = [text.trim()];
  for (const match of text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) candidates.unshift(match[1].trim());
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) candidates.push(text.slice(firstBrace, lastBrace + 1));
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Try the next conservative JSON candidate.
    }
  }
  throw new Error("the CLI model did not return a JSON object");
}

function adaptStructuredOutput(run: SubagentRun, schema: NonNullable<Parameters<SubagentProvider["start"]>[0]["outputSchema"]>): SubagentRun {
  const result = run.result.then((value) => {
    if (value.stopReason !== "completed") return value;
    try {
      const structured = parseStructuredOutput(outputText(value.output));
      const errors = validateJsonSchemaValue(schema, structured);
      if (errors.length > 0) throw new Error(errors.join("; "));
      return { ...value, structured };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        ...value,
        output: [...value.output, { type: "text" as const, text: `DeepSee structured-output validation failed: ${detail}` }],
        stopReason: "error" as const,
      };
    }
  });
  return { ...run, result };
}

function observedRun(
  run: SubagentRun,
  request: Parameters<SubagentProvider["start"]>[0],
  metadata: { provider: string; model?: string },
): SubagentRun {
  const common = {
    childId: String(run.id),
    parentSessionId: String(request.parent.id || ""),
    provider: metadata.provider,
    model: metadata.model || "",
    cwd: request.parent.session?.header?.cwd || "",
  };
  recordExecutionTrace({
    ...common,
    type: "run.started",
    eventId: "deepsee-lifecycle-start",
    title: `${metadata.provider} 已开始执行`,
    status: "running",
  });
  const result = run.result.then((value) => {
    const text = outputText(value.output);
    recordExecutionTrace({
      ...common,
      type: value.stopReason === "completed" ? "run.completed" : "run.failed",
      eventId: "deepsee-lifecycle-end",
      title: value.stopReason === "completed" ? "子任务已完成" : `子任务已结束：${value.stopReason}`,
      summary: text,
      output: text,
      status: value.stopReason === "completed" ? "completed" : value.stopReason === "aborted" ? "cancelled" : "failed",
    });
    return value;
  }, (error: unknown) => {
    recordExecutionTrace({
      ...common,
      type: "run.failed",
      eventId: "deepsee-lifecycle-end",
      title: "子任务运行失败",
      detail: error instanceof Error ? error.message : String(error),
      status: "failed",
    });
    throw error;
  });
  return {
    id: run.id,
    localAgent: run.localAgent,
    result,
    dispose: () => run.dispose(),
  };
}

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
  inheritedGlobalMemory = "",
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
        const { model: _routeId, provider: _provider, ...remainingOptions } = request.agentOptions || {};
        const selectedCliModel = cliRoute.cliModel?.trim();
        const {
          agentOptions: _originalOptions,
          outputSchema,
          maxDepth,
          toolFilter,
          persona,
          ...baseRequest
        } = request;
        const prompt = [
          ...(inheritedGlobalMemory ? [{ type: "text" as const, text: inheritedGlobalMemory }] : []),
          ...(persona && !runtime.capabilities.persona
            ? [{ type: "text" as const, text: `Required child persona:\n${persona}` }]
            : []),
          ...request.prompt,
          ...(toolFilter && !runtime.capabilities.toolFilter
            ? [{ type: "text" as const, text: `Respect this parent Workflow tool boundary and do not simulate unavailable Harness tools:\n${JSON.stringify(toolFilter)}` }]
            : []),
          ...(outputSchema && !runtime.capabilities.outputSchema
            ? [{ type: "text" as const, text: structuredOutputPrompt(outputSchema) }]
            : []),
        ];
        let run = await runtime.start({
          ...baseRequest,
          prompt,
          ...(outputSchema && runtime.capabilities.outputSchema ? { outputSchema } : {}),
          ...(maxDepth !== undefined && runtime.capabilities.depthLimit ? { maxDepth } : {}),
          ...(toolFilter && runtime.capabilities.toolFilter ? { toolFilter } : {}),
          ...(persona && runtime.capabilities.persona ? { persona } : {}),
          ...(Object.keys(remainingOptions).length > 0 || selectedCliModel
            ? { agentOptions: { ...remainingOptions, ...(selectedCliModel ? { model: selectedCliModel } : {}) } }
            : {}),
        });
        if (outputSchema && !runtime.capabilities.outputSchema) run = adaptStructuredOutput(run, outputSchema);
        return observedRun(run, request, {
          provider: cliRoute.runtimeProvider,
          model: selectedCliModel || cliRoute.model,
        });
      }

      const spawn = ctx.subagents.getProvider("spawn");
      if (!spawn) {
        throw new Error('DeepSee requires the built-in Harness "spawn" subagent provider.');
      }
      const agentOptions = resolveDeepSeeAgentOptions(registry, request.agentOptions);
      const prompt = inheritedGlobalMemory
        ? [{ type: "text" as const, text: inheritedGlobalMemory }, ...request.prompt]
        : request.prompt;
      const run = await spawn.start({
        ...request,
        prompt,
        ...(agentOptions ? { agentOptions } : {}),
      });
      return observedRun(run, request, {
        provider: agentOptions?.provider || "spawn",
        model: agentOptions?.model,
      });
    },
  };
}

export function installDeepSeeSubagentProvider(
  ctx: Context,
  getRegistry: () => ModelRegistryFile,
  inheritedGlobalMemory = "",
): void {
  ctx.subagents.registerProvider(createDeepSeeSubagentProvider(ctx, getRegistry, inheritedGlobalMemory));
}
