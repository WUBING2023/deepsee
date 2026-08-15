import { createServer } from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDeepSeeAdminHandler, DEEPSEE_API_PREFIX, installDeepSeeAdminRoute } from "../host/admin-server.mjs";

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
});

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deepsee-admin-"));
  const handler = createDeepSeeAdminHandler({ packageRoot: root, stateRoot: root, dshHome: root });
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
  });

  it("rejects cross-origin browser requests", async () => {
    const base = await fixture();
    const response = await fetch(`${base}${DEEPSEE_API_PREFIX}/v1/models`, {
      headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    });
    expect(response.status).toBe(403);
  });
});
