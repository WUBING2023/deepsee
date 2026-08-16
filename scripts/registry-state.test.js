import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyPreferencesToHarness,
  loadRegistryState,
  syncHarnessModels,
  updateRegistryPreferences,
  updateRegistryRoute,
} from "./registry-state.mjs";

const roots = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "opends-registry-"));
  roots.push(root);
  writeFileSync(join(root, ".opends-models.json"), JSON.stringify({
    version: 1,
    routes: [
      { id: "harness:deepseek:m", source: "harness", provider: "deepseek", model: "m", runtimeProvider: "deepseek", runtimeModel: "m", enabled: true, status: "ready", visionLevel: "none" },
      { id: "api:kimi:v", source: "api", provider: "kimi", model: "v", runtimeProvider: "opends-api-kimi", runtimeModel: "v", enabled: true, status: "ready", visionLevel: "full-vision" },
      { id: "cli:bad", source: "cli", provider: "bad", model: "bad", enabled: false, status: "unavailable", statusReason: "not logged in", visionLevel: "none" },
    ],
    preferences: {},
  }));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("registry preferences", () => {
  it("persists editable preferences and rejects enabling an unavailable CLI", () => {
    const root = fixture();
    expect(() => updateRegistryRoute(root, { id: "cli:bad", enabled: true })).toThrow("not logged in");
    updateRegistryPreferences(root, { primaryRouteId: "harness:deepseek:m", visionRouteId: "api:kimi:v", visionMode: "ocr", ocrTool: "mineru", primeAutoWorkflow: false });
    expect(loadRegistryState(root).preferences).toEqual({
      primaryRouteId: "harness:deepseek:m",
      visionRouteId: "api:kimi:v",
      visionMode: "ocr",
      ocrTool: "mineru",
      primeAutoWorkflow: false,
    });
  });

  it("syncs Harness model catalogs without copying credentials and queues AI profiling", () => {
    const root = fixture();
    const result = syncHarnessModels(root, {
      groups: [{
        id: "deepseek-official",
        name: "DeepSeek",
        models: [
          { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", reasoning: { efforts: [] } },
          { id: "vision-pro", name: "Vision Pro", description: "Multimodal vision and image understanding" },
        ],
      }],
      failures: [],
      apiKey: "must-not-be-stored",
    });
    expect(result.synced).toBe(2);
    const text = readFileSync(join(root, ".opends-models.json"), "utf8");
    expect(text).not.toContain("must-not-be-stored");
    const routes = loadRegistryState(root).routes.filter((route) => route.source === "harness");
    expect(routes).toHaveLength(2);
    expect(routes[0]).toMatchObject({
      id: "harness:deepseek-official:deepseek-v4-flash",
      runtimeProvider: "deepseek-official",
      profileStatus: "pending",
    });
    expect(result.state.preferences).toMatchObject({
      primaryRouteId: "api:kimi:v",
      visionRouteId: "api:kimi:v",
      visionMode: "model",
    });
  });

  it("syncs the preferred base model into Harness' composite vision selection", () => {
    const root = fixture();
    const dshHome = join(root, ".dsh");
    mkdirSync(dshHome, { recursive: true });
    writeFileSync(join(dshHome, "settings.yaml"), "agent-default-model:\n  provider: deepseek\n  model: old\n");
    updateRegistryPreferences(root, { primaryRouteId: "api:kimi:v" });
    applyPreferencesToHarness(root, dshHome);
    const settings = readFileSync(join(dshHome, "settings.yaml"), "utf8");
    expect(settings).toContain("provider: opends-vision");
    expect(settings).toContain("model: v");
  });
});
