import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDeepSeeUpdate,
  getDeepSeeUpdateStatus,
  queueDeepSeeUpdateCheck,
  startDeepSeeUpdate,
} from "./update-manager.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const currentManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const temporaryRoots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deepsee-update-"));
  temporaryRoots.push(root);
  return root;
}

function response(version, overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({ ...currentManifest, version, ...overrides }),
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("DeepSee update manager", () => {
  it("detects an available official version without changing the package", async () => {
    const root = fixture();
    const fetchImpl = vi.fn(async () => response("0.6.0-alpha.7"));
    const status = await checkDeepSeeUpdate(root, packageRoot, { fetchImpl });
    expect(status).toMatchObject({
      status: "available",
      currentVersion: currentManifest.version,
      latestVersion: "0.6.0-alpha.7",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(join(root, ".opends-update", "state.json"), "utf8"))).not.toHaveProperty("pid");
  });

  it("reports current and caches automatic checks", async () => {
    const root = fixture();
    const fetchImpl = vi.fn(async () => response(currentManifest.version));
    await checkDeepSeeUpdate(root, packageRoot, { fetchImpl });
    expect(getDeepSeeUpdateStatus(root, packageRoot).status).toBe("current");
    expect(queueDeepSeeUpdateCheck(root, packageRoot, { fetchImpl })).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("turns invalid remote metadata into a retryable error", async () => {
    const root = fixture();
    const status = await checkDeepSeeUpdate(root, packageRoot, {
      fetchImpl: async () => response("0.6.0-alpha.7", { name: "@attacker/lookalike" }),
    });
    expect(status.status).toBe("error");
    expect(status.message).toContain("包身份");
  });

  it("starts one detached automatic installer only after a verified check", async () => {
    const root = fixture();
    await checkDeepSeeUpdate(root, packageRoot, { fetchImpl: async () => response("0.6.0-alpha.7") });
    const child = Object.assign(new EventEmitter(), { pid: process.pid, unref: vi.fn() });
    const spawnImpl = vi.fn(() => child);
    const status = startDeepSeeUpdate(root, packageRoot, root, {
      spawnImpl,
      workerPath: join(root, "worker.mjs"),
    });
    expect(status).toMatchObject({ status: "updating", latestVersion: "0.6.0-alpha.7" });
    expect(spawnImpl).toHaveBeenCalledWith(process.execPath, expect.arrayContaining([
      join(root, "worker.mjs"),
      root,
      root,
      "0.6.0-alpha.7",
    ]), expect.objectContaining({ detached: true, windowsHide: true }));
    expect(child.unref).toHaveBeenCalled();
  });
});
