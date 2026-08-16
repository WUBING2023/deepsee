import { createServer } from "node:http";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepSeeAdminHandler, DEEPSEE_API_PREFIX, installDeepSeeAdminRoute } from "../host/admin-server.mjs";

const servers = [];
const packageRoot = fileURLToPath(new URL("../", import.meta.url));

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), "deepsee-admin-"));
  const handler = createDeepSeeAdminHandler({
    packageRoot,
    stateRoot: root,
    dshHome: root,
    disableUpdateCheck: true,
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
    expect(state.update).toMatchObject({ currentVersion: "0.6.0-alpha.6" });
  });

  it("checks the official update manifest through the same-origin route", async () => {
    const manifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
    const sourceRef = "b".repeat(40);
    const base = await fixture({
      updateFetch: async (url) => String(url).includes("/commits/")
        ? ({ ok: true, status: 200, json: async () => ({ sha: sourceRef }) })
        : ({ ok: true, status: 200, json: async () => ({ ...manifest, version: "0.6.0-alpha.7" }) }),
    });
    const response = await fetch(`${base}${DEEPSEE_API_PREFIX}/v1/update/check`, {
      method: "POST",
      headers: { origin: base, "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ update: { status: "available", latestVersion: "0.6.0-alpha.7" } });
  });

  it("rejects cross-origin browser requests", async () => {
    const base = await fixture();
    const response = await fetch(`${base}${DEEPSEE_API_PREFIX}/v1/models`, {
      headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    });
    expect(response.status).toBe(403);
  });
});
