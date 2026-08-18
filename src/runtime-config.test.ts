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
  it("routes a verified Codex visual reader through its DeepSee LLM adapter and concrete model", () => {
    const registry = {
      version: 1,
      routes: [{
        id: "cli:codex",
        source: "cli",
        provider: "openai",
        runtimeProvider: "codex",
        model: "codex-cli",
        cliModel: "gpt-5.6-sol",
        enabled: true,
        status: "ready",
        inputModalities: ["text", "image"],
        capabilities: ["vision"],
        weaknesses: [],
        roles: ["vision"],
        description: "Codex vision",
        descriptionSource: "verified",
        visionLevel: "full-vision",
      }],
      preferences: { visionMode: "model", visionRouteId: "cli:codex" },
    } as ModelRegistryFile;

    const resolved = resolveRuntimeConfig(config, registry, new Set(["deepsee-cli-codex"]), { status: "not-installed" });

    expect(resolved).toMatchObject({
      provider: "deepsee-cli-codex",
      model: "gpt-5.6-sol",
      visionMode: "model",
      autoVision: true,
    });
  });

  it("falls back to a ready visual model when the selected OCR executable is unavailable", () => {
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
    expect(resolved).toMatchObject({
      provider: "kimi",
      model: "vision",
      visionMode: "model",
      ocrTool: "paddleocr",
      ocrExecutable: "",
      autoVision: true,
    });
  });

  it("uses a ready managed OCR fallback without routing the image into the base model", () => {
    const registry = {
      version: 1,
      routes: [],
      preferences: { visionMode: "ocr", ocrTool: "paddleocr" },
    } as ModelRegistryFile;
    const resolved = resolveRuntimeConfig(config, registry, new Set(), {
      status: "ready",
      executable: "C:\\DeepSee\\rapidocr\\python.exe",
      tool: "rapidocr",
    });
    expect(resolved).toMatchObject({
      visionMode: "ocr",
      ocrTool: "rapidocr",
      ocrExecutable: "C:\\DeepSee\\rapidocr\\python.exe",
      autoVision: true,
    });
  });
});
