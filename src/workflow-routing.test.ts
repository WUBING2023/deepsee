import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import { installDeepSeeWorkflowRouting } from "./workflow-routing.js";

describe("installDeepSeeWorkflowRouting", () => {
  it("supplies opends to a preset-isolated native Workflow engine", async () => {
    const original = vi.fn((request: unknown) => request);
    const engine = { start: original };
    let preStep: ((payload: { agent: { ctx: Context } }, next: () => Promise<unknown>) => Promise<unknown>) | undefined;
    let dispose: (() => void) | undefined;
    const presetServices = new Map<object, unknown>();
    const ctx = {
      get: vi.fn((name: string) => name === "agentPresets" ? {
        serviceFor: (agent: object) => presetServices.get(agent),
      } : undefined),
      on: vi.fn((event: string, listener: typeof preStep) => {
        if (event === "agent/pre-step") preStep = listener;
      }),
      effect: vi.fn((factory: () => () => void) => {
        dispose = factory();
      }),
    } as unknown as Context;
    const agentCtx = { get: () => undefined } as unknown as Context;
    const agent = { ctx: agentCtx };
    presetServices.set(agent, engine);

    installDeepSeeWorkflowRouting(ctx);
    await preStep?.({ agent }, async () => ({ kind: "enter", messages: [] }));
    const result = engine.start({ script: "return null" });

    expect(original).toHaveBeenCalledWith({ script: "return null", subagentProvider: "opends" });
    expect(result).toEqual({ script: "return null", subagentProvider: "opends" });

    dispose?.();
    expect(engine.start).toBe(original);
  });

  it("preserves an explicit subagent provider override", async () => {
    const original = vi.fn((request: unknown) => request);
    const engine = { start: original };
    let preStep: ((payload: { agent: { ctx: Context } }, next: () => Promise<unknown>) => Promise<unknown>) | undefined;
    const ctx = {
      get: vi.fn(() => undefined),
      on: vi.fn((_event: string, listener: typeof preStep) => {
        preStep = listener;
      }),
      effect: vi.fn((factory: () => () => void) => factory()),
    } as unknown as Context;
    const agentCtx = { get: () => engine } as unknown as Context;

    installDeepSeeWorkflowRouting(ctx);
    await preStep?.({ agent: { ctx: agentCtx } }, async () => ({ kind: "enter", messages: [] }));
    engine.start({ script: "return null", subagentProvider: "spawn" });

    expect(original).toHaveBeenCalledWith({ script: "return null", subagentProvider: "spawn" });
  });
});
