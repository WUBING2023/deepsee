import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { ModelRegistryFile } from "./model-registry.js";
import { createDeepSeeSubagentProvider, DEEPSEE_SUBAGENT_PROVIDER } from "./subagent-provider.js";

const registry: ModelRegistryFile = {
  version: 1,
  routes: [
    {
      id: "cli:codex",
      source: "cli",
      provider: "openai",
      model: "codex-cli",
      runtimeProvider: "codex",
      cliModel: "gpt-5.6-sol",
      enabled: true,
      status: "ready",
      capabilities: ["coding"],
      weaknesses: [],
      roles: ["coding"],
      description: "Codex CLI",
      descriptionSource: "verified",
      visionLevel: "none",
    },
    {
      id: "api:kimi:kimi-k3",
      source: "api",
      provider: "kimi",
      model: "kimi-k3",
      runtimeProvider: "opends-bridge",
      runtimeModel: "kimi-k3",
      enabled: true,
      status: "ready",
      capabilities: ["vision"],
      weaknesses: [],
      roles: ["vision"],
      description: "Kimi",
      descriptionSource: "verified",
      visionLevel: "full-vision",
    },
  ],
};

function testContext() {
  const run = {
    id: "child-id",
    result: Promise.resolve({ output: [{ type: "text", text: "ok" }], stopReason: "completed" as const }),
    dispose: vi.fn(async () => undefined),
  };
  const codexStart = vi.fn(async (_request: unknown) => run);
  const spawnStart = vi.fn(async (_request: unknown) => run);
  const providers = new Map([
    ["codex", {
      name: "codex",
      capabilities: { outputSchema: false, depthLimit: false, toolFilter: false, persona: false },
      inheritsParentContext: false,
      start: codexStart,
    }],
    ["spawn", {
      name: "spawn",
      capabilities: { outputSchema: true, depthLimit: true, toolFilter: true, persona: true },
      inheritsParentContext: true,
      start: spawnStart,
    }],
  ]);
  const ctx = {
    subagents: { getProvider: (name: string) => providers.get(name) },
  } as unknown as Context;
  return { ctx, codexStart, spawnStart };
}

function request(model?: string) {
  return {
    prompt: [{ type: "text" as const, text: "Do the task" }],
    parent: {} as never,
    signal: new AbortController().signal,
    ...(model ? { agentOptions: { model } } : {}),
  };
}

describe("DeepSee Workflow subagent provider", () => {
  it("uses the stable provider name configured by the Workflow engine", () => {
    const { ctx } = testContext();
    expect(createDeepSeeSubagentProvider(ctx, () => registry).name).toBe(DEEPSEE_SUBAGENT_PROVIDER);
    expect(DEEPSEE_SUBAGENT_PROVIDER).toBe("opends");
  });

  it("routes cli:codex to the native Codex provider and selected CLI model", async () => {
    const { ctx, codexStart, spawnStart } = testContext();
    await createDeepSeeSubagentProvider(ctx, () => registry).start(request("cli:codex") as never);

    expect(codexStart).toHaveBeenCalledOnce();
    expect(codexStart.mock.calls[0]?.[0]).toMatchObject({
      agentOptions: { model: "gpt-5.6-sol" },
    });
    expect(spawnStart).not.toHaveBeenCalled();
  });

  it("maps API routes and delegates them to the normal Harness spawn provider", async () => {
    const { ctx, codexStart, spawnStart } = testContext();
    await createDeepSeeSubagentProvider(ctx, () => registry).start(request("api:kimi:kimi-k3") as never);

    expect(spawnStart).toHaveBeenCalledOnce();
    expect(spawnStart.mock.calls[0]?.[0]).toMatchObject({
      agentOptions: { provider: "opends-bridge", model: "kimi-k3" },
    });
    expect(codexStart).not.toHaveBeenCalled();
  });

  it("keeps ordinary Workflow children on the normal spawn provider", async () => {
    const { ctx, spawnStart } = testContext();
    await createDeepSeeSubagentProvider(ctx, () => registry).start(request() as never);

    expect(spawnStart).toHaveBeenCalledOnce();
    expect(spawnStart.mock.calls[0]?.[0]).not.toHaveProperty("agentOptions");
  });
});
