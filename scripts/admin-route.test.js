import { createServer } from "node:http";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepSeeAdminHandler, DEEPSEE_API_PREFIX, installDeepSeeAdminRoute } from "../host/admin-server.mjs";
import { recordExecutionTrace } from "./execution-trace.mjs";

const servers = [];
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const availableVersion = manifest.version.replace(/(\d+)$/, (value) => String(Number(value) + 1));
let fixtureRoot = "";

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "deepsee-admin-"));
  fixtureRoot = root;
  const handler = createDeepSeeAdminHandler({
    packageRoot,
    stateRoot: root,
    dshHome: root,
    disableUpdateCheck: true,
    disableCatalogRefresh: true,
    ...options,
  });
  const server = createServer(handler);
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

describe("embedded DeepSee Host route", () => {
  it("registers against the injected Harness webServer service", () => {
    const dispose = vi.fn();
    const register = vi.fn(() => dispose);
    const ctx = {
      webServer: { register },
      effect: (factory) => factory(),
    };
    expect(installDeepSeeAdminRoute(ctx, {})).toBe(true);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      kind: "prefix",
      path: DEEPSEE_API_PREFIX,
    }));
  });

  it("serves redacted state on the Harness origin without a bearer token", async () => {
    const base = await fixture();
    const response = await fetch(`${base}${DEEPSEE_API_PREFIX}/v1/models`, {
      headers: { origin: base },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const state = await response.json();
    expect(state).toMatchObject({ version: 1, routes: [], preferences: {} });
    expect(state.tools.mineru).toBeTruthy();
    expect(state.tools.ocr.catalog.map((tool) => tool.id)).toEqual(["mineru", "paddleocr", "rapidocr"]);
    expect(state.tools.runtimes.catalog.map((runtime) => runtime.id)).toEqual(["gemini"]);
    expect(state.update).toMatchObject({ currentVersion: manifest.version });
  });

  it("checks the official update manifest through the same-origin route", async () => {
    const sourceRef = "b".repeat(40);
    const base = await fixture({
      updateFetch: async (url) => String(url).includes("/commits/")
        ? ({ ok: true, status: 200, json: async () => ({ sha: sourceRef }) })
        : ({ ok: true, status: 200, json: async () => ({ ...manifest, version: availableVersion }) }),
    });
    const response = await fetch(`${base}${DEEPSEE_API_PREFIX}/v1/update/check`, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ update: { status: "available", latestVersion: availableVersion } });
  });

  it("starts a managed Runtime install through the same-origin route", async () => {
    const runtimeInstall = vi.fn((_root, id, installPath) => ({ id, installPath, status: "installing", progress: 3 }));
    const base = await fixture({ runtimeInstall });
    const response = await fetch(`${base}${DEEPSEE_API_PREFIX}/v1/runtimes/gemini/install`, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ installPath: "C:\\DeepSee\\Runtimes\\gemini" }),
    });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ runtime: { id: "gemini", status: "installing" } });
    expect(runtimeInstall).toHaveBeenCalledWith(expect.any(String), "gemini", "C:\\DeepSee\\Runtimes\\gemini", expect.any(Object));
  });

  it("synchronizes a preferred main model through the live Harness default-model service", async () => {
    const syncPrimaryModel = vi.fn(async (route) => ({
      provider: route.runtimeProvider,
      model: route.runtimeModel,
    }));
    const base = await fixture({ syncPrimaryModel });
    writeFileSync(join(fixtureRoot, ".opends-models.json"), JSON.stringify({
      version: 1,
      routes: [{
        id: "harness:deepseek-official:deepseek-v4-pro",
        source: "harness",
        provider: "deepseek-official",
        model: "deepseek-v4-pro",
        runtimeProvider: "deepseek-official",
        runtimeModel: "deepseek-v4-pro",
        enabled: true,
        status: "ready",
        capabilities: ["text", "reasoning"],
        weaknesses: [],
        roles: ["primary"],
        description: "DeepSeek V4 Pro",
        descriptionSource: "declared",
        visionLevel: "none",
      }],
      preferences: {},
    }));

    const response = await fetch(`${base}${DEEPSEE_API_PREFIX}/v1/preferences`, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: JSON.stringify({ primaryRouteId: "harness:deepseek-official:deepseek-v4-pro" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      restartRequired: false,
      liveApplied: true,
      selection: { provider: "deepseek-official", model: "deepseek-v4-pro" },
    });
    expect(syncPrimaryModel).toHaveBeenCalledWith(expect.objectContaining({
      id: "harness:deepseek-official:deepseek-v4-pro",
    }));
  });

  it("serves Workflow execution traces and workspace-scoped artifacts", async () => {
    const base = await fixture();
    const workspace = join(fixtureRoot, "workspace");
    const poster = join(workspace, "poster.svg");
    mkdirSync(workspace, { recursive: true });
    writeFileSync(poster, "<svg xmlns=\"http://www.w3.org/2000/svg\"></svg>");
    recordExecutionTrace({ childId: "child-a", parentSessionId: "parent", provider: "codex", model: "gpt-test", cwd: workspace, type: "run.started" });
    recordExecutionTrace({ childId: "child-a", parentSessionId: "parent", provider: "codex", model: "gpt-test", cwd: workspace, type: "run.completed", output: "Created `poster.svg`", status: "completed" });

    const traceResponse = await fetch(`${base}${DEEPSEE_API_PREFIX}/v1/traces?children=child-a`, { headers: { origin: base } });
    const payload = await traceResponse.json();
    expect(payload.traces[0]).toMatchObject({ childId: "child-a", status: "completed", artifacts: [expect.objectContaining({ name: "poster.svg" })] });
    const artifactResponse = await fetch(`${base}${payload.traces[0].artifacts[0].url}`, { headers: { origin: base } });
    expect(artifactResponse.status).toBe(200);
    expect(artifactResponse.headers.get("content-type")).toBe("image/svg+xml");
  });

  it("rejects cross-origin browser requests", async () => {
    const base = await fixture();
    const response = await fetch(`${base}${DEEPSEE_API_PREFIX}/v1/models`, {
      headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    });
    expect(response.status).toBe(403);
  });
});
