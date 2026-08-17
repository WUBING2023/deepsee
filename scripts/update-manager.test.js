import { EventEmitter } from "node:events";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acquireDeepSeeUpdateLock,
  checkDeepSeeUpdate,
  claimDeepSeeUpdateLock,
  getDeepSeeUpdateStatus,
  queueDeepSeeUpdateCheck,
  releaseDeepSeeUpdateLock,
  startDeepSeeUpdate,
  writeDeepSeeUpdateState,
} from "./update-manager.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const currentManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
const availableVersion = currentManifest.version.replace(/(\d+)$/, (value) => String(Number(value) + 1));
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
    const fetchImpl = updateFetch(availableVersion);
    const status = await checkDeepSeeUpdate(root, packageRoot, { fetchImpl });
    expect(status).toMatchObject({
      status: "available",
      currentVersion: currentManifest.version,
      latestVersion: availableVersion,
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
      fetchImpl: updateFetch(availableVersion, { name: "@attacker/lookalike" }),
    });
    expect(status.status).toBe("error");
    expect(status.message).toContain("包身份");
  });

  it("falls back to the official commits Atom feed when the GitHub API is rate-limited", async () => {
    const root = fixture();
    const fetchImpl = vi.fn(async (url) => {
      const value = String(url);
      if (value.includes("api.github.com")) return { ok: false, status: 403 };
      if (value.endsWith("main.atom")) {
        return {
          ok: true,
          status: 200,
          text: async () => `<feed><entry><id>tag:github.com,2008:Grit::Commit/${sourceRef}</id></entry></feed>`,
        };
      }
      return response(availableVersion);
    });
    const status = await checkDeepSeeUpdate(root, packageRoot, { fetchImpl });
    expect(status).toMatchObject({ status: "available", latestVersion: availableVersion });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(JSON.parse(readFileSync(join(root, ".opends-update", "state.json"), "utf8"))).toMatchObject({ sourceRef });
  });

  it("starts one detached automatic installer only after a verified check", async () => {
    const root = fixture();
    await checkDeepSeeUpdate(root, packageRoot, { fetchImpl: updateFetch(availableVersion) });
    const child = Object.assign(new EventEmitter(), { pid: process.pid, unref: vi.fn() });
    const spawnImpl = vi.fn(() => child);
    const status = startDeepSeeUpdate(root, packageRoot, root, {
      spawnImpl,
      workerPath: join(root, "worker.mjs"),
    });
    expect(status).toMatchObject({ status: "updating", latestVersion: availableVersion });
    expect(spawnImpl).toHaveBeenCalledWith(process.execPath, expect.arrayContaining([
      join(root, "worker.mjs"),
      root,
      root,
      availableVersion,
      sourceRef,
    ]), expect.objectContaining({ detached: true, windowsHide: true }));
    expect(child.unref).toHaveBeenCalled();
  });

  it("requires a manual install when a future update protocol is not supported", async () => {
    const root = fixture();
    const status = await checkDeepSeeUpdate(root, packageRoot, {
      fetchImpl: updateFetch(availableVersion, {
        deepsee: {
          ...currentManifest.deepsee,
          update: { protocol: 2, minimumUpdaterVersion: currentManifest.version },
        },
      }),
    });
    expect(status).toMatchObject({ status: "manual-required", latestVersion: availableVersion });
    expect(status.message).toContain("更新协议 2");
    expect(() => startDeepSeeUpdate(root, packageRoot, root)).toThrow("没有已验证");
  });

  it("atomically replaces update state and leaves no temporary file", () => {
    const root = fixture();
    writeDeepSeeUpdateState(root, { status: "current", checkedAt: "2026-08-16T00:00:00.000Z" });
    writeDeepSeeUpdateState(root, { status: "available", latestVersion: availableVersion });
    const directory = join(root, ".opends-update");
    expect(JSON.parse(readFileSync(join(directory, "state.json"), "utf8"))).toEqual({
      status: "available",
      latestVersion: availableVersion,
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

    const nextVersion = availableVersion;
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

  it("serializes update workers across Harness processes and hands lock ownership to the worker", () => {
    const root = fixture();
    const first = acquireDeepSeeUpdateLock(root);
    expect(first.acquired).toBe(true);
    expect(acquireDeepSeeUpdateLock(root)).toMatchObject({ acquired: false });
    expect(() => claimDeepSeeUpdateLock(root, "wrong-token", process.pid)).toThrow("锁已失效");
    expect(claimDeepSeeUpdateLock(root, first.token, process.pid)).toBeUndefined();
    expect(releaseDeepSeeUpdateLock(root, first.token)).toBe(true);
    const next = acquireDeepSeeUpdateLock(root);
    expect(next.acquired).toBe(true);
    expect(releaseDeepSeeUpdateLock(root, next.token)).toBe(true);
  });

  it("releases the cross-process lock when the worker cannot be spawned", async () => {
    const root = fixture();
    await checkDeepSeeUpdate(root, packageRoot, { fetchImpl: updateFetch(availableVersion) });
    expect(() => startDeepSeeUpdate(root, packageRoot, root, {
      spawnImpl: () => { throw new Error("spawn failed"); },
    })).toThrow("spawn failed");
    const retry = acquireDeepSeeUpdateLock(root);
    expect(retry.acquired).toBe(true);
    expect(releaseDeepSeeUpdateLock(root, retry.token)).toBe(true);
  });

  it("recovers an abandoned lock after the startup grace period", () => {
    const root = fixture();
    const directory = join(root, ".opends-update");
    mkdirSync(directory, { recursive: true });
    const target = join(directory, "update.lock");
    writeFileSync(target, JSON.stringify({ token: "abandoned", pid: 2147483647 }));
    const old = new Date(Date.now() - 60_000);
    utimesSync(target, old, old);
    const recovered = acquireDeepSeeUpdateLock(root);
    expect(recovered.acquired).toBe(true);
    expect(releaseDeepSeeUpdateLock(root, recovered.token)).toBe(true);
  });

  it("does not let a concurrent version check overwrite an acquired update lock", async () => {
    const root = fixture();
    writeDeepSeeUpdateState(root, {
      status: "available",
      currentVersion: currentManifest.version,
      latestVersion: availableVersion,
      sourceRef,
    });
    const lock = acquireDeepSeeUpdateLock(root);
    const fetchImpl = updateFetch(availableVersion);
    const status = await checkDeepSeeUpdate(root, packageRoot, { fetchImpl });
    expect(status).toMatchObject({ status: "updating", latestVersion: availableVersion });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(JSON.parse(readFileSync(join(root, ".opends-update", "state.json"), "utf8"))).toMatchObject({ status: "available" });
    expect(releaseDeepSeeUpdateLock(root, lock.token)).toBe(true);
  });
});
