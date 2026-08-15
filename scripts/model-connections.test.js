import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addConnection,
  buildGeneratedPatch,
  publicConnections,
  updateRegistryWithConnection,
} from "./model-connections.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("local model connections", () => {
  it("keeps API keys out of public routes and the model registry", () => {
    const root = mkdtempSync(join(tmpdir(), "opends-connections-"));
    roots.push(root);
    const connection = addConnection(root, {
      provider: "kimi",
      model: "kimi-test",
      apiKey: "secret-key",
      capabilities: ["vision", "text"],
      weaknesses: ["coding"],
      visionLevel: "full-vision",
    });
    const route = updateRegistryWithConnection(root, connection);
    expect(route).toMatchObject({
      id: "api:kimi:kimi-test",
      capabilities: ["vision", "text"],
      weaknesses: ["coding"],
    });
    expect(JSON.stringify(publicConnections(root))).not.toContain("secret-key");
    expect(readFileSync(join(root, ".opends-models.json"), "utf8")).not.toContain("secret-key");
  });

  it("generates a Harness provider for every stored connection", () => {
    const root = mkdtempSync(join(tmpdir(), "opends-patch-"));
    roots.push(root);
    const connection = addConnection(root, {
      provider: "openai",
      model: "gpt-test",
      apiKey: "local-secret",
      capabilities: ["text"],
      visionLevel: "none",
    });
    const env = {
      OPENDS_MODEL_REGISTRY_FILE: join(root, ".opends-models.json"),
      OPENDS_BRIDGE_MAX_TOKENS: "2048",
    };
    const patchPath = join(root, "generated.yml");
    buildGeneratedPatch(root, env, patchPath);
    const text = readFileSync(patchPath, "utf8");
    expect(text).toContain(connection.runtimeProvider);
    expect(text).toContain("gpt-test");
    expect(text).not.toContain("local-secret");
    expect(env[connection.apiKeyEnv]).toBe("local-secret");
    expect(connection.weaknesses).toEqual(["长篇中文内容创作", "低延迟轻量任务"]);
  });

  it("loads the official Codex provider when the verified CLI route is enabled", () => {
    const root = mkdtempSync(join(tmpdir(), "opends-codex-patch-"));
    roots.push(root);
    writeFileSync(join(root, ".opends-models.json"), JSON.stringify({
      version: 1,
      routes: [{
        id: "cli:codex",
        source: "cli",
        provider: "openai",
        model: "codex-cli",
        runtimeProvider: "codex",
        enabled: true,
        status: "ready",
      }],
      preferences: {},
    }));
    const patchPath = join(root, "generated.yml");
    buildGeneratedPatch(root, { OPENDS_MODEL_REGISTRY_FILE: join(root, ".opends-models.json") }, patchPath);
    expect(readFileSync(patchPath, "utf8")).toContain("name: '@deepseek-ai/dsh-subagent-codex'");
  });

  it("does not require a heavyweight external Claude adapter", () => {
    const root = mkdtempSync(join(tmpdir(), "opends-claude-patch-"));
    roots.push(root);
    writeFileSync(join(root, ".opends-models.json"), JSON.stringify({
      version: 1,
      routes: [{
        id: "cli:claude-code",
        source: "cli",
        provider: "anthropic",
        model: "claude-code",
        runtimeProvider: "claude-code",
        enabled: true,
        status: "ready",
      }],
      preferences: {},
    }));
    const patchPath = join(root, "generated.yml");
    buildGeneratedPatch(root, { OPENDS_MODEL_REGISTRY_FILE: join(root, ".opends-models.json") }, patchPath);
    expect(readFileSync(patchPath, "utf8")).not.toContain("name: '@deepseek-ai/dsh-subagent-claude-code'");
  });
});
