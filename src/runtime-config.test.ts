import { describe, expect, it } from "vitest";
import type { Config } from "./index.js";
import { resolveRuntimeConfig } from "./index.js";
import type { ModelRegistryFile } from "./model-registry.js";

const config = {
  autoVision: true,
  provider: "fallback-vision",
  model: "fallback-model",
  primaryProvider: "deepseek",
  targetProviders: ["deepseek"],
  visionMode: "model",
  ocrTool: "mineru",
  ocrExecutable: "",
} as Config;

describe("live visual reader selection", () => {
  it("preserves an OCR selection when the tool is unavailable instead of silently routing to a model", () => {
    const registry = {
      version: 1,
      routes: [{
        id: "api:kimi:vision",
        source: "api",
        provider: "kimi",
        runtimeProvider: "kimi",
        model: "vision",
        enabled: true,
        status: "ready",
        capabilities: ["vision"],
        weaknesses: [],
        roles: ["vision"],
        description: "vision",
        descriptionSource: "declared",
        visionLevel: "full-vision",
      }],
      preferences: { visionMode: "ocr", visionRouteId: "api:kimi:vision", ocrTool: "paddleocr" },
    } as ModelRegistryFile;
    const resolved = resolveRuntimeConfig(config, registry, new Set(["kimi"]), { status: "not-installed" });
    expect(resolved).toMatchObject({ visionMode: "ocr", ocrTool: "paddleocr", ocrExecutable: "", autoVision: true });
  });
});
