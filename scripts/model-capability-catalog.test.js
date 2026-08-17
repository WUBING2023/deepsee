import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getModelCatalogStatus,
  modelCapabilityDefaults,
  refreshModelCapabilityCatalog,
} from "./model-capability-catalog.mjs";

const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deepsee-model-catalog-"));
  roots.push(root);
  return root;
}

function catalog() {
  const models = {
    "openai/gpt-image-2": {
      id: "openai/gpt-image-2",
      name: "GPT Image 2",
      description: "Image model for generation, editing, and visual design workflows",
      modalities: { input: ["text", "image"], output: ["image"] },
      last_updated: "2026-04-21",
    },
    "openai/gpt-4o": {
      id: "openai/gpt-4o",
      name: "GPT-4o",
      description: "Multimodal chat model for practical coding and assistants",
      tool_call: true,
      structured_output: true,
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
      limit: { context: 128000, output: 16384 },
    },
    "moonshotai/kimi-k3": {
      id: "moonshotai/kimi-k3",
      name: "Kimi K3",
      description: "Multimodal long-context coding and agent model",
      reasoning: true,
      tool_call: true,
      modalities: { input: ["text", "image", "video"], output: ["text"] },
      limit: { context: 1048576, output: 131072 },
    },
  };
  for (let index = 0; index < 7; index += 1) {
    models[`example/model-${index}`] = {
      id: `example/model-${index}`,
      name: `Model ${index}`,
      description: "Text model",
      modalities: { input: ["text"], output: ["text"] },
    };
  }
  return models;
}

async function installCatalog(root, now = Date.parse("2026-08-17T00:00:00.000Z")) {
  const fetchImpl = vi.fn(async () => new Response(JSON.stringify(catalog()), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));
  await refreshModelCapabilityCatalog(root, { fetchImpl, force: true, now });
  return fetchImpl;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("Models.dev capability defaults", () => {
  it("distinguishes image understanding from image generation", async () => {
    const root = fixture();
    await installCatalog(root);
    const generator = modelCapabilityDefaults(root, "openai-official", "gpt-image-2");
    expect(generator).toMatchObject({ catalogModelId: "openai/gpt-image-2", visionLevel: "none" });
    expect(generator.capabilities).toContain("image-generation");
    expect(generator.capabilities).not.toContain("vision");

    const reader = modelCapabilityDefaults(root, "openai-official", "gpt-4o");
    expect(reader).toMatchObject({ catalogModelId: "openai/gpt-4o", visionLevel: "full-vision" });
    expect(reader.capabilities).toEqual(expect.arrayContaining([
      "vision",
      "document",
      "coding",
      "tools",
      "structured-output",
      "long-context",
    ]));
    expect(reader.capabilities).not.toContain("image-generation");
  });

  it("matches provider aliases and keeps video input separate from video generation", async () => {
    const root = fixture();
    await installCatalog(root);
    const profile = modelCapabilityDefaults(root, "kimi", "kimi-k3");
    expect(profile.catalogModelId).toBe("moonshotai/kimi-k3");
    expect(profile.capabilities).toEqual(expect.arrayContaining(["vision", "video-input", "reasoning", "tools", "coding", "long-context"]));
    expect(profile.capabilities).not.toContain("video-generation");
  });

  it("uses a seven-day cache and falls back to stale data when refresh fails", async () => {
    const root = fixture();
    const now = Date.parse("2026-08-17T00:00:00.000Z");
    const firstFetch = await installCatalog(root, now);
    await refreshModelCapabilityCatalog(root, {
      fetchImpl: firstFetch,
      now: now + 24 * 60 * 60 * 1000,
    });
    expect(firstFetch).toHaveBeenCalledTimes(1);

    const stale = await refreshModelCapabilityCatalog(root, {
      fetchImpl: vi.fn(async () => { throw new Error("offline"); }),
      force: true,
      now: now + 8 * 24 * 60 * 60 * 1000,
    });
    expect(stale.models["moonshotai/kimi-k3"]).toBeTruthy();
    expect(getModelCatalogStatus(root, { now: now + 8 * 24 * 60 * 60 * 1000 })).toMatchObject({
      source: "Models.dev",
      status: "stale",
      modelCount: 10,
      message: "offline",
    });
  });
});
