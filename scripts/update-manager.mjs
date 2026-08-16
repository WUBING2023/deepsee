import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  compareSemVer,
  DEEPSEE_RELEASE_URL,
  DEEPSEE_UPDATE_MANIFEST_URL,
  DEFAULT_UPDATE_CHECK_INTERVAL_MS,
  updateIsStale,
  validateDeepSeeManifest,
} from "./update-policy.mjs";

const moduleRoot = fileURLToPath(new URL("../", import.meta.url));
export const DEEPSEE_UPDATE_STATE_FILE = ".opends-update/state.json";
const activeChecks = new Map();

function statePath(root) {
  return join(root, DEEPSEE_UPDATE_STATE_FILE);
}

function readJson(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" ? value : fallback;
  } catch {
    return fallback;
  }
}

function currentManifest(packageRoot) {
  return validateDeepSeeManifest(readJson(join(packageRoot, "package.json")));
}

function processIsRunning(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function publicFields(state, currentVersion) {
  return {
    status: state.status || "idle",
    currentVersion,
    ...(state.latestVersion ? { latestVersion: state.latestVersion } : {}),
    ...(state.checkedAt ? { checkedAt: state.checkedAt } : {}),
    ...(state.startedAt ? { startedAt: state.startedAt } : {}),
    ...(state.completedAt ? { completedAt: state.completedAt } : {}),
    ...(state.message ? { message: state.message } : {}),
    releaseUrl: DEEPSEE_RELEASE_URL,
  };
}

export function writeDeepSeeUpdateState(root, value) {
  const directory = join(root, ".opends-update");
  mkdirSync(directory, { recursive: true });
  writeFileSync(statePath(root), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function getDeepSeeUpdateStatus(stateRoot, packageRoot) {
  const currentVersion = currentManifest(packageRoot).version;
  const state = readJson(statePath(stateRoot));
  if (!state.status) {
    return {
      status: "idle",
      currentVersion,
      message: "尚未检查更新。",
      releaseUrl: DEEPSEE_RELEASE_URL,
    };
  }

  if (state.status === "restart-required" && state.latestVersion) {
    if (compareSemVer(currentVersion, state.latestVersion) >= 0) {
      return {
        ...publicFields(state, currentVersion),
        status: "current",
        message: `DeepSee ${currentVersion} 已是最新版本。`,
      };
    }
    return publicFields(state, currentVersion);
  }

  if (state.status === "available" && state.latestVersion && compareSemVer(state.latestVersion, currentVersion) <= 0) {
    return {
      ...publicFields(state, currentVersion),
      status: "current",
      message: `DeepSee ${currentVersion} 已是最新版本。`,
    };
  }

  if (state.status === "updating") {
    const started = Date.parse(state.startedAt || "");
    const age = Number.isFinite(started) ? Date.now() - started : Number.POSITIVE_INFINITY;
    const startupGrace = age >= 0 && age < 30_000 && !state.pid;
    if (!processIsRunning(state.pid) && !startupGrace) {
      return {
        ...publicFields(state, currentVersion),
        status: "error",
        message: "升级进程已结束但没有写入完成状态；可点击重试。",
      };
    }
  }

  if (state.status === "checking") {
    const started = Date.parse(state.startedAt || "");
    if (!Number.isFinite(started) || Date.now() - started > 60_000) {
      return {
        ...publicFields(state, currentVersion),
        status: "error",
        message: "版本检查超时；可点击重试。",
      };
    }
  }

  return publicFields(state, currentVersion);
}

export async function checkDeepSeeUpdate(stateRoot, packageRoot, options = {}) {
  const manifest = currentManifest(packageRoot);
  const startedAt = new Date().toISOString();
  writeDeepSeeUpdateState(stateRoot, {
    status: "checking",
    currentVersion: manifest.version,
    startedAt,
    message: "正在检查 DeepSee 更新…",
  });
  try {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("当前 Node.js Runtime 不支持联网检查更新。");
    const response = await fetchImpl(options.manifestUrl || DEEPSEE_UPDATE_MANIFEST_URL, {
      headers: { accept: "application/json", "user-agent": `DeepSee/${manifest.version}` },
      redirect: "follow",
      signal: options.signal || AbortSignal.timeout(options.timeoutMs || 15_000),
    });
    if (!response.ok) throw new Error(`GitHub 返回 HTTP ${response.status}`);
    const latest = validateDeepSeeManifest(await response.json());
    const checkedAt = new Date().toISOString();
    const available = compareSemVer(latest.version, manifest.version) > 0;
    writeDeepSeeUpdateState(stateRoot, {
      status: available ? "available" : "current",
      currentVersion: manifest.version,
      latestVersion: latest.version,
      checkedAt,
      message: available
        ? `DeepSee ${latest.version} 可以升级。`
        : `DeepSee ${manifest.version} 已是最新版本。`,
    });
  } catch (error) {
    writeDeepSeeUpdateState(stateRoot, {
      status: "error",
      currentVersion: manifest.version,
      checkedAt: new Date().toISOString(),
      message: `暂时无法检查更新：${error instanceof Error ? error.message : String(error)}`,
    });
  }
  return getDeepSeeUpdateStatus(stateRoot, packageRoot);
}

function configuredInterval(env = process.env) {
  const value = Number(env.DEEPSEE_UPDATE_CHECK_INTERVAL_MS);
  return Number.isSafeInteger(value) && value >= 60_000 ? value : DEFAULT_UPDATE_CHECK_INTERVAL_MS;
}

export function queueDeepSeeUpdateCheck(stateRoot, packageRoot, options = {}) {
  const current = getDeepSeeUpdateStatus(stateRoot, packageRoot);
  if (["checking", "updating", "restart-required"].includes(current.status)) return undefined;
  if (!options.force && !updateIsStale(current.checkedAt, Date.now(), options.intervalMs || configuredInterval(options.env))) {
    return undefined;
  }
  const key = statePath(stateRoot);
  if (activeChecks.has(key)) return activeChecks.get(key);
  const pending = checkDeepSeeUpdate(stateRoot, packageRoot, options)
    .finally(() => activeChecks.delete(key));
  activeChecks.set(key, pending);
  return pending;
}

export function startDeepSeeUpdate(stateRoot, packageRoot, dshHome, options = {}) {
  const current = getDeepSeeUpdateStatus(stateRoot, packageRoot);
  if (current.status === "updating" || current.status === "restart-required") return current;
  if (current.status !== "available" || !current.latestVersion) {
    throw new Error("当前没有已验证的 DeepSee 新版本；请先检查更新。");
  }

  const updateRoot = join(stateRoot, ".opends-update");
  mkdirSync(updateRoot, { recursive: true });
  const stdout = openSync(join(updateRoot, "update.stdout.log"), "a");
  const stderr = openSync(join(updateRoot, "update.stderr.log"), "a");
  const startedAt = new Date().toISOString();
  writeDeepSeeUpdateState(stateRoot, {
    status: "updating",
    currentVersion: current.currentVersion,
    latestVersion: current.latestVersion,
    checkedAt: current.checkedAt,
    startedAt,
    message: `正在自动升级到 DeepSee ${current.latestVersion}…`,
  });

  let child;
  try {
    child = (options.spawnImpl || spawn)(process.execPath, [
      options.workerPath || join(moduleRoot, "scripts", "update-worker.mjs"),
      stateRoot,
      dshHome,
      current.latestVersion,
    ], {
      cwd: stateRoot,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", stdout, stderr],
      env: { ...process.env, DSH_HOME: dshHome, DEEPSEE_UPDATE_WORKER: "1" },
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  if (!child?.pid) {
    writeDeepSeeUpdateState(stateRoot, {
      status: "error",
      currentVersion: current.currentVersion,
      latestVersion: current.latestVersion,
      checkedAt: current.checkedAt,
      startedAt,
      completedAt: new Date().toISOString(),
      message: "DeepSee 后台升级进程未能启动。",
    });
    throw new Error("DeepSee 后台升级进程未能启动。");
  }
  writeDeepSeeUpdateState(stateRoot, {
    status: "updating",
    currentVersion: current.currentVersion,
    latestVersion: current.latestVersion,
    checkedAt: current.checkedAt,
    startedAt,
    pid: child.pid,
    message: `正在自动升级到 DeepSee ${current.latestVersion}…`,
  });
  child.once("error", (error) => {
    writeDeepSeeUpdateState(stateRoot, {
      status: "error",
      currentVersion: current.currentVersion,
      latestVersion: current.latestVersion,
      checkedAt: current.checkedAt,
      startedAt,
      completedAt: new Date().toISOString(),
      message: `DeepSee 后台升级进程启动失败：${error.message}`,
    });
  });
  child.unref();
  return getDeepSeeUpdateStatus(stateRoot, packageRoot);
}
