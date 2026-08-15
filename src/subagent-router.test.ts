import { describe, expect, it } from "vitest";
import type { ModelRegistryFile } from "./model-registry.js";
import { resolveDeepSeeAgentOptions } from "./subagent-router.js";

const registry: ModelRegistryFile = {
  version: 1,
  routes: [
    {
      id: "api:kimi:kimi-k3",
      source: "api",
      provider: "kimi",
      model: "kimi-k3",
      runtimeProvider: "opends-bridge",
      runtimeModel: "kimi-k3",
      enabled: true,
      status: "ready",
      capabilities: ["text", "vision"],
      weaknesses: [],
      roles: ["vision", "review"],
      description: "Kimi visual route",
      descriptionSource: "verified",
      visionLevel: "full-vision",
    },
    {
      id: "cli:claude-code",
      source: "cli",
      provider: "anthropic",
      model: "claude-code",
      enabled: true,
      status: "installed",
      capabilities: ["coding"],
      weaknesses: [],
      roles: ["coding"],
      description: "Claude Code",
      descriptionSource: "inferred",
      visionLevel: "none",
    },
  ],
};

describe("resolveDeepSeeAgentOptions", () => {
  it("maps a ready registry id to its Harness provider and model", () => {
    expect(resolveDeepSeeAgentOptions(registry, { model: "api:kimi:kimi-k3" })).toEqual({
      provider: "opends-bridge",
      model: "kimi-k3",
    });
  });

  it("leaves ordinary Harness model ids unchanged", () => {
    expect(resolveDeepSeeAgentOptions(registry, { model: "deepseek-v4-flash" })).toEqual({
      model: "deepseek-v4-flash",
    });
  });

  it("rejects discovered but unverified CLI routes", () => {
    expect(() => resolveDeepSeeAgentOptions(registry, { model: "cli:claude-code" }))
      .toThrow("installed, not ready");
  });

  it("fails loudly for a missing registry route", () => {
    expect(() => resolveDeepSeeAgentOptions(registry, { model: "api:missing:model" }))
      .toThrow("was not found");
  });
});
