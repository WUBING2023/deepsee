import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, parse, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findExecutable } from "./runtime-locator.mjs";
import {
  defaultManagedRuntimeRoot,
  getManagedRuntimeDefinition,
  publicManagedRuntimeCatalog,
} from "./runtime-catalog.mjs";

const moduleRoot = fileURLToPath(new URL("../", import.meta.url));

function runtimeStatePath(stateRoot, id) {
  return join(stateRoot, ".opends-tools", "runtimes", id, "state.json");
}

function readState(stateRoot, id) {
  const path = runtimeStatePath(stateRoot, id);
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function writeManagedRuntimeState(stateRoot, id, value) {
  getManagedRuntimeDefinition(id);
  const path = runtimeStatePath(stateRoot, id);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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

export function validateRuntimeInstallPath(value, id, options = {}) {
  getManagedRuntimeDefinition(id);
  const raw = String(value || "").trim();
  if (!raw || !isAbsolute(raw)) throw new Error("Runtime 安装路径必须是绝对路径。");
  const target = resolve(raw);
  const filesystemRoot = parse(target).root;
  if (target === filesystemRoot || target === resolve(homedir()) || target === resolve(options.stateRoot || ".")) {
    throw new Error("Runtime 安装路径过于宽泛，请选择一个独立子目录。");
  }
  if (existsSync(target)) {
    const marker = join(target, ".deepsee-runtime.json");
    const entries = readdirSync(target).filter((entry) => entry !== ".deepsee-runtime.json");
    if (entries.length > 0 && !existsSync(marker)) {
      throw new Error("所选目录不是空目录，也不是 DeepSee 管理的 Runtime 目录。");
    }
    if (existsSync(marker)) {
      try {
        const metadata = JSON.parse(readFileSync(marker, "utf8"));
        if (metadata.id !== id) throw new Error("所选目录属于另一个 DeepSee Runtime。");
      } catch (error) {
        if (error instanceof Error && error.message.includes("另一个")) throw error;
        throw new Error("所选目录的 DeepSee Runtime 标记无效。");
      }
    }
  }
  return target;
}

export function managedRuntimeExecutable(installPath, id, platform = process.platform) {
  const definition = getManagedRuntimeDefinition(id);
  const candidates = platform === "win32"
    ? [join(installPath, `${definition.command}.cmd`), join(installPath, `${definition.command}.exe`)]
    : [join(installPath, "bin", definition.command), join(installPath, definition.command)];
  return candidates.find((candidate) => {
    try {
      return existsSync(candidate) && statSync(candidate).isFile();
    } catch {
      return false;
    }
  });
}

function details(state) {
  return {
    ...(Number.isFinite(state.progress) ? { progress: Math.max(0, Math.min(100, state.progress)) } : {}),
    ...(state.phase ? { phase: state.phase } : {}),
    ...(state.installMethod ? { installMethod: state.installMethod } : {}),
    ...(state.installPath ? { installPath: state.installPath } : {}),
    ...(state.executable ? { executable: state.executable } : {}),
    ...(Array.isArray(state.attempts) ? { attempts: state.attempts } : {}),
    ...(state.startedAt ? { startedAt: state.startedAt } : {}),
    ...(state.completedAt ? { completedAt: state.completedAt } : {}),
  };
}

export function getManagedRuntimeStatus(stateRoot, id, options = {}) {
  const definition = getManagedRuntimeDefinition(id);
  const state = readState(stateRoot, id);
  const managedExecutable = state.installPath ? managedRuntimeExecutable(state.installPath, id, options.platform) : undefined;
  if (state.status === "ready" && managedExecutable) {
    return { status: "ready", installed: true, managed: true, progress: 100, phase: "complete",
      ...details({ ...state, executable: managedExecutable }),
      message: state.message || `${definition.label} 已安装并通过启动验证。` };
  }
  if (state.status === "installing") {
    const started = Date.parse(state.startedAt || "");
    const age = Number.isFinite(started) ? Date.now() - started : Number.POSITIVE_INFINITY;
    if (age >= 0 && age < 24 * 60 * 60 * 1000 && (processIsRunning(state.pid) || (age < 60_000 && !state.pid))) {
      return { status: "installing", installed: false, managed: true, ...details(state),
        message: state.message || `正在安装 ${definition.label}…` };
    }
    return { status: "error", installed: false, managed: true, ...details(state), phase: "error",
      message: `${definition.label} 上一次安装未完成，可以直接重试。` };
  }
  if (state.status === "error") {
    return { status: "error", installed: false, managed: true, ...details(state), phase: "error",
      message: state.message || `${definition.label} 安装失败，可以重试。` };
  }
  const external = findExecutable(definition.command, { env: options.env || process.env, platform: options.platform });
  if (external) {
    return { status: "ready", installed: true, managed: false, executable: external, progress: 100, phase: "complete",
      installMethod: "系统已有安装", message: `${definition.label} 已在系统 PATH 中，可直接加入模型目录。` };
  }
  return { status: "not-installed", installed: false, managed: true, progress: 0, phase: "idle",
    installPath: state.installPath || defaultManagedRuntimeRoot(id, options.env, options.platform),
    message: state.message || "未安装；选择路径后由 DeepSee 下载官方稳定版。" };
}

export function getManagedRuntimesState(stateRoot, options = {}) {
  return {
    catalog: publicManagedRuntimeCatalog(options.env, options.platform).map((entry) => ({
      ...entry,
      ...getManagedRuntimeStatus(stateRoot, entry.id, options),
    })),
  };
}

export function getManagedRuntimeExecutable(stateRoot, routeId, options = {}) {
  const entry = publicManagedRuntimeCatalog(options.env, options.platform).find((candidate) => candidate.routeId === routeId);
  if (!entry) return undefined;
  const status = getManagedRuntimeStatus(stateRoot, entry.id, options);
  return status.status === "ready" ? status.executable : undefined;
}

export function startManagedRuntimeInstall(stateRoot, id, installPath, options = {}) {
  const definition = getManagedRuntimeDefinition(id);
  const target = validateRuntimeInstallPath(installPath, id, { stateRoot });
  const current = getManagedRuntimeStatus(stateRoot, id, options);
  if (current.status === "installing") return current;
  if (current.status === "ready" && current.managed === false) return current;
  const logRoot = join(stateRoot, ".opends-tools", "runtimes", id);
  mkdirSync(logRoot, { recursive: true });
  const stdout = openSync(join(logRoot, "install.stdout.log"), "a");
  const stderr = openSync(join(logRoot, "install.stderr.log"), "a");
  const startedAt = new Date().toISOString();
  writeManagedRuntimeState(stateRoot, id, { status: "installing", startedAt, installPath: target,
    progress: 3, phase: "starting", attempts: [], message: `正在准备 ${definition.label} 官方安装…` });
  const spawnImpl = options.spawnImpl || spawn;
  let child;
  try {
    child = spawnImpl(process.execPath, [options.workerPath || join(moduleRoot, "scripts", "install-runtime-worker.mjs"), stateRoot, id, target], {
      cwd: stateRoot, detached: true, windowsHide: true, stdio: ["ignore", stdout, stderr],
      env: { ...process.env, OPENDS_RUNTIME_INSTALL: id },
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  if (!child?.pid) {
    writeManagedRuntimeState(stateRoot, id, { status: "error", startedAt, completedAt: new Date().toISOString(),
      installPath: target, progress: 0, phase: "error", message: `${definition.label} 后台安装进程未能启动。` });
    throw new Error(`${definition.label} 后台安装进程未能启动。`);
  }
  child.once?.("error", (error) => writeManagedRuntimeState(stateRoot, id, {
    status: "error", startedAt, completedAt: new Date().toISOString(), installPath: target,
    progress: 0, phase: "error", message: `${definition.label} 后台安装进程启动失败：${error.message}`,
  }));
  child.unref?.();
  return getManagedRuntimeStatus(stateRoot, id, options);
}
