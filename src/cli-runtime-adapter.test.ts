import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { ContentBlock, GenerateOptions, Message } from "@deepseek-ai/dsh-llm";
import type { ModelRegistryFile } from "./model-registry.js";
import { CliRuntimeAdapter, cliBasePrompt, cliRuntimeProviderId } from "./cli-runtime-adapter.js";

const registry: ModelRegistryFile = {
  version: 1,
  routes: [{
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
    roles: ["primary", "coding"],
    description: "Codex subscription",
    descriptionSource: "verified",
    inputModalities: ["text", "image"],
    visionLevel: "full-vision",
  }, {
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
    description: "Codex Terra subscription",
    descriptionSource: "verified",
    visionLevel: "none",
  }],
};

function message(role: Message["role"], text: string): Message {
  return {
    id: `m-${role}` as Message["id"],
    role,
    content: [{ type: "text", text }],
    source: role === "assistant"
      ? { kind: "model", provider: "test", model: "test" }
      : { kind: "user" },
  };
}

function options(model = "gpt-5.6-sol"): GenerateOptions {
  return {
    provider: "deepsee-cli-codex",
    model,
    sessionId: "parent-session" as GenerateOptions["sessionId"],
    messages: [message("user", "Reply with CODEX_BASE_OK")],
    signal: new AbortController().signal,
  };
}

describe("CliRuntimeAdapter", () => {
  it("exposes only the selected model from each authenticated subscription account", async () => {
    const start = vi.fn(async () => ({
      id: "child",
      result: Promise.resolve({ output: [{ type: "text" as const, text: "CODEX_BASE_OK" }], stopReason: "completed" as const }),
      dispose: vi.fn(async () => undefined),
    }));
    const ctx = {
      agents: { get: vi.fn(() => ({ session: { header: { cwd: "C:\\workspace" } } })) },
      subagents: { start },
    } as unknown as Pick<Context, "agents" | "subagents">;
    const adapter = new CliRuntimeAdapter(ctx, () => registry);

    expect(cliRuntimeProviderId("cli:codex")).toBe("deepsee-cli-codex");
    expect(cliRuntimeProviderId("cli:codex@2")).toBe("deepsee-cli-codex");
    await expect(adapter.listModels("deepsee-cli-codex")).resolves.toEqual([
      expect.objectContaining({ id: "gpt-5.6-sol", provider: "deepsee-cli-codex" }),
      expect.objectContaining({ id: "gpt-5.6-terra", provider: "deepsee-cli-codex" }),
    ]);
    await expect(adapter.resolveModel("deepsee-cli-codex", "gpt-5.6-terra")).resolves.toMatchObject({ id: "gpt-5.6-terra" });

    const chunks = [];
    for await (const chunk of adapter.stream(options())) chunks.push(chunk);
    expect(start).toHaveBeenCalledWith("codex", expect.objectContaining({
      agentOptions: { model: "gpt-5.6-sol" },
      prompt: [expect.objectContaining({ text: expect.stringContaining("Reply with CODEX_BASE_OK") })],
    }));
    expect(chunks).toContainEqual({ type: "text-delta", index: 0, text: "CODEX_BASE_OK" });
    expect(chunks.at(-1)).toEqual({ type: "finish", reason: { kind: "stop" } });
  });

  it("rejects a model that the authenticated CLI did not advertise", async () => {
    const ctx = {
      agents: { get: vi.fn() },
      subagents: { start: vi.fn() },
    } as unknown as Pick<Context, "agents" | "subagents">;
    const adapter = new CliRuntimeAdapter(ctx, () => registry);
    await expect(adapter.resolveModel("deepsee-cli-codex", "not-a-model")).rejects.toThrow("not available");
  });

  it("keeps auxiliary title requests read-only", () => {
    const prompt = cliBasePrompt({ ...options(), purpose: "session-title" });
    expect(prompt).toContain("do not modify files");
    expect(prompt).toContain("short title");
  });

  it("passes assembled Harness instructions to a CLI base runtime", () => {
    const prompt = cliBasePrompt({ ...options(), system: "GLOBAL_MEMORY_SENTINEL" });
    expect(prompt).toContain("GLOBAL_MEMORY_SENTINEL");
    expect(prompt.indexOf("GLOBAL_MEMORY_SENTINEL")).toBeLessThan(prompt.indexOf("Conversation transcript:"));
  });

  it("passes original image blocks to an image-capable subscription provider", async () => {
    const image = {
      type: "image",
      attachment: { attachmentId: "image-1", mediaType: "image/png", bytes: 4, width: 1, height: 1 },
    } as unknown as ContentBlock;
    const start = vi.fn(async () => ({
      id: "child",
      result: Promise.resolve({ output: [{ type: "text" as const, text: "IMAGE_OK" }], stopReason: "completed" as const }),
      dispose: vi.fn(async () => undefined),
    }));
    const ctx = {
      agents: { get: vi.fn(() => ({ session: { header: { cwd: "C:\\workspace" } } })) },
      subagents: { start },
    } as unknown as Pick<Context, "agents" | "subagents">;
    const adapter = new CliRuntimeAdapter(ctx, () => registry);
    const request = options();
    request.messages = [{ ...request.messages[0], content: [...request.messages[0].content, image] }];
    for await (const _chunk of adapter.stream(request)) {
      // Drain the adapter to completion.
    }
    expect(await adapter.resolveModel("deepsee-cli-codex", "gpt-5.6-sol")).toMatchObject({ inputModalities: ["text", "image"] });
    expect(start).toHaveBeenCalledWith("codex", expect.objectContaining({ prompt: expect.arrayContaining([image]) }));
  });

  it("uses the live initiator when Harness omits a base-model session id", async () => {
    const initiator = { session: { header: { cwd: "C:\\workspace" } } };
    const start = vi.fn(async () => ({
      id: "child",
      result: Promise.resolve({ output: [{ type: "text" as const, text: "INITIATOR_OK" }], stopReason: "completed" as const }),
      dispose: vi.fn(async () => undefined),
    }));
    const currentInitiator = vi.fn(() => initiator);
    const ctx = {
      agents: { get: vi.fn(), currentInitiator },
      subagents: { start },
    } as unknown as Pick<Context, "agents" | "subagents">;
    const adapter = new CliRuntimeAdapter(ctx, () => registry);
    const request = options();
    delete request.sessionId;

    const chunks = [];
    for await (const chunk of adapter.stream(request)) chunks.push(chunk);

    expect(currentInitiator).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith("codex", expect.objectContaining({ parent: initiator }));
    expect(chunks).toContainEqual({ type: "text-delta", index: 0, text: "INITIATOR_OK" });
  });
});
