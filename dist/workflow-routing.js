import { DEEPSEE_SUBAGENT_PROVIDER } from "./subagent-provider.js";
function workflowEngineFor(ctx, agent) {
    const presets = ctx.get("agentPresets");
    // Preset-owned services intentionally sit behind an isolate realm, so an
    // agent's ordinary context cannot address them directly. `serviceFor` is
    // the Harness-supported host-to-preset lookup. The fallback keeps DeepSee
    // compatible with rosterless/headless compositions.
    const candidate = presets?.serviceFor(agent, "workflowEngine")
        ?? agent.ctx.get("workflowEngine");
    if (typeof candidate !== "object" || candidate === null)
        return undefined;
    const start = candidate.start;
    return typeof start === "function" ? candidate : undefined;
}
/**
 * Make native Workflow use the DeepSee subagent provider in every Harness
 * preset, including the shipped Standard/Code presets that keep their own
 * isolated Workflow engine. The public Workflow request seam already supports
 * `subagentProvider`; this wrapper only supplies its missing default.
 */
export function installDeepSeeWorkflowRouting(ctx) {
    const patched = new Map();
    ctx.on("agent/pre-step", async (payload, next) => {
        const engine = workflowEngineFor(ctx, payload.agent);
        if (engine && !patched.has(engine)) {
            const original = engine.start;
            const routed = function startWithDeepSee(request) {
                return original.call(engine, {
                    ...request,
                    subagentProvider: request.subagentProvider ?? DEEPSEE_SUBAGENT_PROVIDER,
                });
            };
            patched.set(engine, { original, routed });
            engine.start = routed;
        }
        return next();
    });
    ctx.effect(() => () => {
        for (const [engine, { original, routed }] of patched) {
            // Do not overwrite another plugin that deliberately wrapped the engine
            // after DeepSee did.
            if (engine.start === routed)
                engine.start = original;
        }
        patched.clear();
    }, "deepsee: workflow route");
}
