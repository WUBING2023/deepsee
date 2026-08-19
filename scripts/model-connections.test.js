import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateLegacyConnections, scrubLegacyDotEnv } from "./model-connections.mjs";

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("legacy credential migration", () => {
  it("irreversibly removes stored keys and legacy provider routes", () => {
    const root = mkdtempSync(join(tmpdir(), "deepsee-security-"));
    roots.push(root);
    writeFileSync(join(root, ".opends-connections.json"), JSON.stringify({
      version: 1,
      connections: [{ provider: "kimi", model: "kimi-test", baseURL: "https://example.test/v1", apiKey: "live-secret" }],
    }));
    writeFileSync(join(root, ".opends-models.json"), JSON.stringify({
      version: 1,
      routes: [
        { id: "api:kimi:kimi-test", runtimeProvider: "opends-api-123", credentialRef: "env:OPENDS_PROVIDER_123_API_KEY" },
        { id: "harness:deepseek:model", source: "harness" },
      ],
      preferences: { primaryRouteId: "api:kimi:kimi-test", visionRouteId: "api:kimi:kimi-test" },
    }));

    expect(migrateLegacyConnections(root)).toMatchObject({ requiresUserAction: true, detectedSecrets: 1, secretsRemoved: 0 });
    expect(readFileSync(join(root, ".opends-connections.json"), "utf8")).toContain("live-secret");
    const result = migrateLegacyConnections(root, { scrub: true });
    const connections = readFileSync(join(root, ".opends-connections.json"), "utf8");
    const registry = JSON.parse(readFileSync(join(root, ".opends-models.json"), "utf8"));
    expect(result).toMatchObject({ secretsRemoved: 1, routesRemoved: 1 });
    expect(connections).not.toContain("live-secret");
    expect(connections).not.toContain("apiKey");
    expect(registry.routes.map((route) => route.id)).toEqual(["harness:deepseek:model"]);
    expect(registry.preferences).toEqual({});
  });

  it("is idempotent and scrubs only DeepSee's legacy dotenv key", () => {
    const root = mkdtempSync(join(tmpdir(), "deepsee-dotenv-"));
    roots.push(root);
    writeFileSync(join(root, ".env"), "OPENDS_BRIDGE_API_KEY=secret\nUNRELATED_VALUE=keep\n");
    expect(scrubLegacyDotEnv(root)).toMatchObject({ detectedSecrets: 1, secretsRemoved: 0 });
    expect(scrubLegacyDotEnv(root, { scrub: true }).secretsRemoved).toBe(1);
    const source = readFileSync(join(root, ".env"), "utf8");
    expect(source).toContain("OPENDS_BRIDGE_API_KEY=");
    expect(source).not.toContain("secret");
    expect(source).toContain("UNRELATED_VALUE=keep");
    expect(migrateLegacyConnections(root)).toMatchObject({ found: false, secretsRemoved: 0 });
  });
});
