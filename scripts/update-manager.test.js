import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDeepSeeUpdate,
  getDeepSeeUpdateStatus,
  queueDeepSeeUpdateCheck,
  startDeepSeeUpdate,
  writeDeepSeeUpdateState,
} from "./update-manager.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const currentManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const temporaryRoots = [];
const sourceRef = "a".repeat(40);

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

function updateFetch(version, overrides = {}) {
  return vi.fn(async (url) => String(url).includes("/commits/")
    ? { ok: true, status: 200, json: async () => ({ sha: sourceRef }) }
    : response(version, overrides));
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("DeepSee update manager", () => {
  it("detects an available official version without changing the package", async () => {
    const root = fixture();
    const fetchImpl = updateFetch("0.6.0-alpha.9");
    const status = await checkDeepSeeUpdate(root, packageRoot, { fetchImpl });
    expect(status).toMatchObject({
      status: "available",
      currentVersion: currentManifest.version,
      latestVersion: "0.6.0-alpha.9",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(JSON.parse(readFileSync(join(root, ".opends-update", "state.json"), "utf8"))).toMatchObject({ sourceRef });
  });

  it("reports current and caches automatic checks", async () => {
    const root = fixture();
    const fetchImpl = updateFetch(currentManifest.version);
    await checkDeepSeeUpdate(root, packageRoot, { fetchImpl });
    expect(getDeepSeeUpdateStatus(root, packageRoot).status).toBe("current");
    expect(queueDeepSeeUpdateCheck(root, packageRoot, { fetchImpl })).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("turns invalid remote metadata into a retryable error", async () => {
    const root = fixture();
    const status = await checkDeepSeeUpdate(root, packageRoot, {
      fetchImpl: updateFetch("0.6.0-alpha.9", { name: "@attacker/lookalike" }),
    });
    expect(status.status).toBe("error");
    expect(status.message).toContain("包身份");
  });

  it("starts one detached automatic installer only after a verified check", async () => {
    const root = fixture();
    await checkDeepSeeUpdate(root, packageRoot, { fetchImpl: updateFetch("0.6.0-alpha.9") });
    const child = Object.assign(new EventEmitter(), { pid: process.pid, unref: vi.fn() });
    const spawnImpl = vi.fn(() => child);
    const status = startDeepSeeUpdate(root, packageRoot, root, {
      spawnImpl,
      workerPath: join(root, "worker.mjs"),
    });
    expect(status).toMatchObject({ status: "updating", latestVersion: "0.6.0-alpha.9" });
    expect(spawnImpl).toHaveBeenCalledWith(process.execPath, expect.arrayContaining([
      join(root, "worker.mjs"),
      root,
      root,
      "0.6.0-alpha.9",
      sourceRef,
    ]), expect.objectContaining({ detached: true, windowsHide: true }));
    expect(child.unref).toHaveBeenCalled();
  });

  it("requires a manual install when a future update protocol is not supported", async () => {
    const root = fixture();
    const status = await checkDeepSeeUpdate(root, packageRoot, {
      fetchImpl: updateFetch("0.6.0-alpha.9", {
        deepsee: {
          ...currentManifest.deepsee,
          update: { protocol: 2, minimumUpdaterVersion: currentManifest.version },
        },
      }),
    });
    expect(status).toMatchObject({ status: "manual-required", latestVersion: "0.6.0-alpha.9" });
    expect(status.message).toContain("更新协议 2");
    expect(() => startDeepSeeUpdate(root, packageRoot, root)).toThrow("没有已验证");
  });

  it("atomically replaces update state and leaves no temporary file", () => {
    const root = fixture();
    writeDeepSeeUpdateState(root, { status: "current", checkedAt: "2026-08-16T00:00:00.000Z" });
    writeDeepSeeUpdateState(root, { status: "available", latestVersion: "0.6.0-alpha.9" });
    const directory = join(root, ".opends-update");
    expect(JSON.parse(readFileSync(join(directory, "state.json"), "utf8"))).toEqual({
      status: "available",
      latestVersion: "0.6.0-alpha.9",
    });
    expect(readdirSync(directory).filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("retries automatic checks sooner after a transient error", async () => {
    const root = fixture();
    writeDeepSeeUpdateState(root, {
      status: "error",
      checkedAt: new Date(Date.now() - 16 * 60_000).toISOString(),
      message: "temporary failure",
    });
    const fetchImpl = updateFetch(currentManifest.version);
    await queueDeepSeeUpdateCheck(root, packageRoot, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(getDeepSeeUpdateStatus(root, packageRoot).status).toBe("current");
  });

  it("keeps the running version frozen until Harness really restarts", () => {
    const root = fixture();
    const installedPackage = join(root, "package");
    mkdirSync(installedPackage, { recursive: true });
    writeFileSync(join(installedPackage, "package.json"), JSON.stringify(currentManifest));
    expect(getDeepSeeUpdateStatus(root, installedPackage).currentVersion).toBe(currentManifest.version);

    const nextVersion = "0.6.0-alpha.9";
    writeFileSync(join(installedPackage, "package.json"), JSON.stringify({ ...currentManifest, version: nextVersion }));
    writeDeepSeeUpdateState(root, {
      status: "restart-required",
      currentVersion: currentManifest.version,
      latestVersion: nextVersion,
      completedAt: new Date().toISOString(),
      message: "restart required",
    });
    expect(getDeepSeeUpdateStatus(root, installedPackage)).toMatchObject({
      status: "restart-required",
      currentVersion: currentManifest.version,
      latestVersion: nextVersion,
    });
  });
});
