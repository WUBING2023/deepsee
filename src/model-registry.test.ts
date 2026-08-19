import { describe, expect, it } from "vitest";
import {
  applyRouteOverrides,
  normalizeRegistry,
  queryRoutes,
  withFallbackRoutes,
  type ModelRoute,
} from "./model-registry.js";

const vision: ModelRoute = {
  id: "kimi:k3",
  source: "api",
  provider: "kimi",
  model: "k3",
  enabled: true,
  status: "ready",
  capabilities: ["text", "vision"],
  weaknesses: [],
  roles: ["vision", "review"],
  description: "vision",
  descriptionSource: "verified",
  visionLevel: "full-vision",
};

describe("model registry", () => {
  it("normalizes tags and ignores duplicate routes", () => {
    const registry = normalizeRegistry({
      version: 1,
      routes: [
        { ...vision, capabilities: [" Vision ", "VISION"], roles: ["Review"] },
        vision,
      ],
    });
    expect(registry.routes).toHaveLength(1);
    expect(registry.routes[0]?.capabilities).toEqual(["vision"]);
    expect(registry.routes[0]?.roles).toEqual(["review"]);
  });

  it("drops retired synthetic vision routes from persisted registries", () => {
    const registry = normalizeRegistry({
      version: 1,
      routes: [
        vision,
        { ...vision, id: "legacy-provider", runtimeProvider: "opends-bridge" },
        { ...vision, id: "legacy-adapter", provider: "opends-vision" },
      ],
    });
    expect(registry.routes.map((route) => route.id)).toEqual([vision.id]);
  });

  it("preserves safe desktop runtime metadata during capability profiling reads", () => {
    const registry = normalizeRegistry({
      version: 1,
      routes: [{ ...vision, desktopAppId: "desktop:codex" }],
      desktopApps: [{
        id: "desktop:codex",
        name: "Codex Desktop",
        provider: "openai",
        launchUrl: "codex://",
        status: "ready",
        execution: "runtime",
        runtimeRouteId: "kimi:k3",
      }],
    });
    expect(registry.routes[0]?.desktopAppId).toBe("desktop:codex");
    expect(registry.desktopApps).toEqual([
      expect.objectContaining({ id: "desktop:codex", launchUrl: "codex://", execution: "runtime" }),
    ]);
  });

  it("never returns disabled or unavailable routes by default", () => {
    const registry = normalizeRegistry({
      version: 1,
      routes: [
        vision,
        { ...vision, id: "disabled", enabled: false },
        { ...vision, id: "installed", status: "installed" },
      ],
    });
    expect(queryRoutes(registry, { capability: "vision" }).map((route) => route.id)).toEqual(["kimi:k3"]);
  });

  it("keeps discovered routes ahead of defaults", () => {
    const discovered = normalizeRegistry({ version: 1, routes: [{ ...vision, description: "user edited" }] });
    const merged = withFallbackRoutes(discovered, [vision, { ...vision, id: "deepseek:default" }]);
    expect(merged.routes.map((route) => route.id)).toEqual(["kimi:k3", "deepseek:default"]);
    expect(merged.routes[0]?.description).toBe("user edited");
  });

  it("applies user roles and disables a route at the query boundary", () => {
    const registry = normalizeRegistry({ version: 1, routes: [vision] });
    const updated = applyRouteOverrides(registry, [{
      id: vision.id,
      enabled: false,
      capabilities: ["Vision", "OCR"],
      weaknesses: ["Coding"],
      roles: ["Document"],
      description: " user choice ",
    }]);
    expect(updated.routes[0]).toMatchObject({
      enabled: false,
      capabilities: ["vision", "ocr"],
      weaknesses: ["coding"],
      roles: ["document"],
      description: "user choice",
      descriptionSource: "user",
    });
    expect(queryRoutes(updated)).toEqual([]);
  });
});
