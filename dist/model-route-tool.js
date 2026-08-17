import { defineTool } from "@deepseek-ai/dsh-tools";
import { DEEPSEE_SUBAGENT_PROVIDER } from "./subagent-provider.js";
function outputText(output) {
    return output
        .filter((block) => block.type === "text" || block.type === "reasoning")
        .map((block) => block.text)
        .join("\n")
        .trim();
}
function readyRoute(registry, routeId) {
    const route = registry.routes.find((candidate) => candidate.id === routeId);
    if (!route)
        throw new Error(`DeepSee route "${routeId}" was not found.`);
    if (!route.enabled || route.status !== "ready") {
        throw new Error(route.statusReason || `DeepSee route "${routeId}" is not ready.`);
    }
    return route;
}
export async function runModelRoute(ctx, registry, input, parent, signal, inheritedGlobalMemory = "") {
    const route = readyRoute(registry, input.route.trim());
    const requestedModel = input.model?.trim();
    let provider = DEEPSEE_SUBAGENT_PROVIDER;
    let agentOptions = { model: route.id };
    let selectedModel = route.runtimeModel || route.model;
    if (route.source === "cli") {
        if (!route.runtimeProvider)
            throw new Error(`${route.id} has no native Harness provider.`);
        if (requestedModel && requestedModel !== route.cliModel) {
            throw new Error(`Model "${requestedModel}" is not enabled on ${route.id}; add it as a separate DeepSee model first.`);
        }
        provider = route.runtimeProvider;
        selectedModel = requestedModel || route.cliModel || route.model;
        agentOptions = { model: selectedModel };
    }
    else if (requestedModel) {
        throw new Error("The model override is supported only for CLI subscription routes.");
    }
    const prompt = route.source === "cli" && inheritedGlobalMemory
        ? `${inheritedGlobalMemory}\n\n## Current delegated task\n\n${input.prompt}`
        : input.prompt;
    const run = await ctx.subagents.start(provider, {
        parent,
        prompt: [{ type: "text", text: prompt }],
        signal,
        agentOptions,
    });
    try {
        const result = await run.result;
        if (result.stopReason !== "completed") {
            throw new Error(`${route.id} stopped with ${result.stopReason}.`);
        }
        const text = outputText(result.output);
        if (!text)
            throw new Error(`${route.id} returned no assistant text.`);
        return { route: route.id, model: selectedModel, text };
    }
    finally {
        await run.dispose();
    }
}
export function installModelRouteTool(ctx, getRegistry, inheritedGlobalMemory = "") {
    ctx.tools.register(defineTool({
        name: "opends_run_model",
        description: "Run one enabled DeepSee model route directly. Use this whenever the user explicitly asks for Codex, Claude Code, Kimi, or another named route, including small single tasks; do not silently substitute the current model.",
        parameters: {
            route: {
                type: "string",
                required: true,
                description: "Exact route id returned by opends_list_models, such as cli:codex or cli:claude-code.",
            },
            prompt: {
                type: "string",
                required: true,
                description: "Complete standalone task for the selected model/runtime.",
            },
            model: {
                type: "string",
                description: "Optional exact CLI subscription model from the route's availableModels list.",
            },
        },
        output: {
            schema: {
                type: "object",
                additionalProperties: false,
                properties: {
                    route: { type: "string", required: true },
                    model: { type: "string", required: true },
                    text: { type: "string", required: true },
                },
            },
            render: (_args, value) => [{ type: "text", text: `[DeepSee / ${value.route} / ${value.model}]\n${value.text}` }],
        },
        isConcurrencySafe: () => true,
        async execute(args, exec) {
            if (!exec.agent)
                throw new Error("opends_run_model requires a live Harness agent session.");
            return runModelRoute(ctx, getRegistry(), args, exec.agent, exec.signal, inheritedGlobalMemory);
        },
    }));
    ctx.systemPrompt.section({
        name: "opends:direct-model-route",
        order: 150,
        text: "## DeepSee direct model routing\n\nWhen the user explicitly asks to use Codex, Claude Code, Kimi, or another named model/runtime, first call `opends_list_models` if the exact route is uncertain, then call `opends_run_model` for a single task. This rule applies even to small tasks. Never replace an explicitly requested model with yourself. Use native `workflow` only for multi-agent orchestration; its child `model` is the exact DeepSee route id. Every CLI route represents one user-enabled subscription model, so use the listed route instead of overriding it with an unlisted model. If the requested route fails, report that failure instead of invoking the CLI through `pwsh`/`bash`.",
    });
}
