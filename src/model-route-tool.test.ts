import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { ModelRegistryFile } from "./model-registry.js";
import { runModelRoute } from "./model-route-tool.js";

const registry: ModelRegistryFile = {
  version: 1,
  routes: [
    {
      id: "cli:codex",
      source: "cli",
      provider: "openai",
      model: "codex-cli",
      runtimeProvider: "codex",
      cliModels: ["gpt-5.6-sol", "gpt-5.6-terra"],
      cliModel: "gpt-5.6-sol",
      enabled: true,
      status: "ready",
      capabilities: ["coding"],
      weaknesses: [],
      roles: ["coding"],
      description: "Codex",
      descriptionSource: "verified",
      visionLevel: "none",
    },
    {
      id: "cli:codex@2",
      cliRuntimeId: "cli:codex",
      source: "cli",
      provider: "openai",
      model: "codex-cli",
      runtimeProvider: "codex",
      cliModels: ["gpt-5.6-sol", "gpt-5.6-terra"],
      cliModel: "gpt-5.6-terra",
      enabled: true,
      status: "ready",
      capabilities: ["coding"],
      weaknesses: [],
      roles: ["coding"],
      description: "Codex Terra",
      descriptionSource: "verified",
      visionLevel: "none",
    },
    {
      id: "api:kimi:k3",
      source: "api",
      provider: "kimi",
      model: "k3",
      runtimeProvider: "kimi-runtime",
      runtimeModel: "k3",
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

function context() {
  const dispose = vi.fn(async () => undefined);
  const start = vi.fn(async () => ({
    id: "child",
    result: Promise.resolve({ output: [{ type: "text" as const, text: "ROUTE_OK" }], stopReason: "completed" as const }),
    dispose,
  }));
  return { ctx: { subagents: { start } } as unknown as Pick<Context, "subagents">, start, dispose };
}

describe("runModelRoute", () => {
  it("directly runs an independently enabled Codex subscription model", async () => {
    const { ctx, start, dispose } = context();
    await expect(runModelRoute(ctx, registry, {
      route: "cli:codex@2",
      prompt: "Do the task",
    }, {} as Agent, new AbortController().signal)).resolves.toEqual({
      route: "cli:codex@2",
      model: "gpt-5.6-terra",
      text: "ROUTE_OK",
    });
    expect(start).toHaveBeenCalledWith("codex", expect.objectContaining({ agentOptions: { model: "gpt-5.6-terra" } }));
    expect(dispose).toHaveBeenCalledOnce();
  });

  it("inherits global user memory into a direct CLI delegation", async () => {
    const { ctx, start } = context();
    await runModelRoute(ctx, registry, {
      route: "cli:codex",
      prompt: "Do the task",
    }, {} as Agent, new AbortController().signal, "GLOBAL_MEMORY_SENTINEL");
    expect(start).toHaveBeenCalledWith("codex", expect.objectContaining({
      prompt: [expect.objectContaining({ text: expect.stringContaining("GLOBAL_MEMORY_SENTINEL") })],
    }));
  });

  it("keeps API and Harness routes on the DeepSee provider", async () => {
    const { ctx, start } = context();
    await runModelRoute(ctx, registry, { route: "api:kimi:k3", prompt: "Inspect image" }, {} as Agent, new AbortController().signal);
    expect(start).toHaveBeenCalledWith("opends", expect.objectContaining({ agentOptions: { model: "api:kimi:k3" } }));
  });

  it("rejects an unverified CLI model override", async () => {
    const { ctx } = context();
    await expect(runModelRoute(ctx, registry, {
      route: "cli:codex",
      model: "made-up",
      prompt: "Do the task",
    }, {} as Agent, new AbortController().signal)).rejects.toThrow("not enabled");
  });
});
