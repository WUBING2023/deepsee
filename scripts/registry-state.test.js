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

  it("accepts each supported local OCR and ignores arbitrary tool ids", () => {
    const root = fixture();
    updateRegistryPreferences(root, { visionMode: "ocr", ocrTool: "rapidocr" });
    expect(loadRegistryState(root).preferences).toMatchObject({ visionMode: "ocr", ocrTool: "rapidocr" });
    updateRegistryPreferences(root, { ocrTool: "../../other" });
    expect(loadRegistryState(root).preferences.ocrTool).toBe("rapidocr");
    updateRegistryPreferences(root, { ocrTool: "paddleocr" });
    expect(loadRegistryState(root).preferences.ocrTool).toBe("paddleocr");
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

  it("initializes modalities from Models.dev without selecting an image-only generator as the base model", () => {
    const root = fixture();
    writeFileSync(join(root, ".opends-models.json"), JSON.stringify({ version: 1, routes: [], preferences: {} }));
    writeFileSync(join(root, ".deepsee-model-catalog.json"), JSON.stringify({
      version: 1,
      source: { id: "models.dev" },
      fetchedAt: "2026-08-17T00:00:00.000Z",
      models: {
        "openai/gpt-image-2": {
          id: "openai/gpt-image-2",
          name: "GPT Image 2",
          description: "Image generation and editing model",
          reasoning: false,
          toolCall: false,
          structuredOutput: false,
          modalities: { input: ["text", "image"], output: ["image"] },
          limit: {},
        },
        "openai/gpt-4o": {
          id: "openai/gpt-4o",
          name: "GPT-4o",
          description: "Multimodal chat model",
          reasoning: false,
          toolCall: true,
          structuredOutput: true,
          modalities: { input: ["text", "image"], output: ["text"] },
          limit: { context: 128000 },
        },
      },
    }));
    const result = syncHarnessModels(root, {
      groups: [{
        id: "openai-official",
        name: "OpenAI",
        models: [{ id: "gpt-image-2" }, { id: "gpt-4o" }],
      }],
    });
    const generator = result.state.routes.find((route) => route.model === "gpt-image-2");
    const reader = result.state.routes.find((route) => route.model === "gpt-4o");
    expect(generator).toMatchObject({
      capabilities: expect.arrayContaining(["image-generation"]),
      outputModalities: ["image"],
      visionLevel: "none",
      profileStatus: "ready",
    });
    expect(generator.capabilities).not.toContain("vision");
    expect(generator.roles).not.toContain("executor");
    expect(reader).toMatchObject({
      capabilities: expect.arrayContaining(["vision", "tools", "structured-output", "long-context"]),
      outputModalities: ["text"],
      visionLevel: "full-vision",
    });
    expect(result.state.preferences.primaryRouteId).toBe("harness:openai-official:gpt-4o");
    expect(result.state.preferences.visionRouteId).toBe("harness:openai-official:gpt-4o");
    expect(() => updateRegistryPreferences(root, { primaryRouteId: "harness:openai-official:gpt-image-2" })).toThrow("主模型类型不符合要求");
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
