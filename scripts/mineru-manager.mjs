import { closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findExecutable } from "./runtime-locator.mjs";

const moduleRoot = fileURLToPath(new URL("../", import.meta.url));
export const MINERU_STATE_FILE = ".opends-tools/mineru/state.json";

export function managedMinerURoot(root) {
  if (process.env.OPENDS_MINERU_HOME) return process.env.OPENDS_MINERU_HOME;
  if (process.platform === "win32") {
    const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
    return join(localAppData, "DeepSee", "MinerU");
  }
  return join(root, ".opends-tools", "mineru");
}

export function managedMinerUExecutable(root) {
  const toolRoot = managedMinerURoot(root);
  return process.platform === "win32"
    ? join(toolRoot, ".venv", "Scripts", "mineru.exe")
    : join(toolRoot, ".venv", "bin", "mineru");
}

function statePath(root) {
  return join(root, MINERU_STATE_FILE);
}

function readState(root) {
  const path = statePath(root);
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function stateDetails(state) {
  return {
    ...(Number.isFinite(state.progress) ? { progress: Math.max(0, Math.min(100, state.progress)) } : {}),
    ...(state.phase ? { phase: state.phase } : {}),
    ...(state.installMethod ? { installMethod: state.installMethod } : {}),
    ...(state.strategy ? { strategy: state.strategy } : {}),
    ...(Array.isArray(state.attempts) ? { attempts: state.attempts } : {}),
    ...(state.startedAt ? { startedAt: state.startedAt } : {}),
    ...(state.completedAt ? { completedAt: state.completedAt } : {}),
  };
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

export function writeMinerUState(root, value) {
  const path = statePath(root);
  mkdirSync(join(root, ".opends-tools", "mineru"), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function findMinerUExecutable(root) {
  const managed = managedMinerUExecutable(root);
  if (existsSync(managed)) return managed;
  return findExecutable("mineru");
}

export function getMinerUStatus(root) {
  const managed = managedMinerUExecutable(root);
  const managedExists = existsSync(managed);
  const state = readState(root);
  if (managedExists && state.status === "ready") {
    return {
      status: "ready",
      installed: true,
      managed: true,
      executable: managed,
      ...stateDetails(state),
      progress: 100,
      phase: "complete",
      message: state.message || "MinerU 已安装，可用于文档 OCR 与版面解析。",
    };
  }
  if (state.status === "installing") {
    const started = Date.parse(state.startedAt || "");
    const age = Number.isFinite(started) ? Date.now() - started : Number.POSITIVE_INFINITY;
    const withinMaximumInstallWindow = age >= 0 && age < 24 * 60 * 60 * 1000;
    const startupGrace = withinMaximumInstallWindow && age < 60_000 && !state.pid;
    if (withinMaximumInstallWindow && (processIsRunning(state.pid) || startupGrace)) {
      return {
        status: "installing",
        installed: false,
        managed: true,
        message: state.message || "正在自动选择 MinerU 安装方式…",
        ...stateDetails(state),
      };
    }
    return {
      status: "error",
      installed: false,
      managed: true,
      ...stateDetails(state),
      progress: Number.isFinite(state.progress) ? state.progress : 0,
      phase: "error",
      message: "上一次 MinerU 安装进程已结束但没有完成；点击重试会重新检测安装方式。",
    };
  }
  if (state.status === "error") {
    return {
      status: "error",
      installed: false,
      managed: true,
      ...stateDetails(state),
      progress: Number.isFinite(state.progress) ? state.progress : 0,
      phase: "error",
      message: state.message || "MinerU 安装失败，可重试。",
    };
  }
  const external = managedExists ? undefined : findExecutable("mineru");
  if (external) {
    return {
      status: "ready",
      installed: true,
      managed: false,
      executable: external,
      progress: 100,
      phase: "complete",
      message: "MinerU 已安装，可用于文档 OCR 与版面解析。",
      installMethod: "系统已有安装",
    };
  }
  return {
    status: "not-installed",
    installed: false,
    managed: true,
    progress: 0,
    phase: "idle",
    message: "未安装；仅在你点击安装后才会下载。",
  };
}

export function startMinerUInstall(root) {
  const current = getMinerUStatus(root);
  if (current.status === "ready" || current.status === "installing") return current;
  const toolRoot = join(root, ".opends-tools", "mineru");
  mkdirSync(toolRoot, { recursive: true });
  const stdoutPath = join(toolRoot, "install.stdout.log");
  const stderrPath = join(toolRoot, "install.stderr.log");
  const stdout = openSync(stdoutPath, "a");
  const stderr = openSync(stderrPath, "a");
  const startedAt = new Date().toISOString();
  writeMinerUState(root, {
    status: "installing",
    startedAt,
    progress: 2,
    phase: "starting",
    strategy: "自动检测",
    attempts: [],
    message: "正在检测已有 UV、Python 与可用下载源…",
  });
  let child;
  try {
    child = spawn(process.execPath, [join(moduleRoot, "scripts", "install-mineru-worker.mjs"), root], {
      cwd: root,
      detached: true,
      windowsHide: true,
      stdio: ["ignore", stdout, stderr],
      env: { ...process.env, OPENDS_MINERU_INSTALL: "1" },
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  if (!child?.pid) {
    writeMinerUState(root, {
      status: "error",
      startedAt,
      completedAt: new Date().toISOString(),
      progress: 0,
      phase: "error",
      message: "MinerU 后台安装进程未能启动。",
    });
    throw new Error("MinerU 后台安装进程未能启动。");
  }
  child.once("error", (error) => {
    writeMinerUState(root, {
      status: "error",
      startedAt,
      completedAt: new Date().toISOString(),
      progress: 0,
      phase: "error",
      message: `MinerU 后台安装进程启动失败：${error.message}`,
    });
  });
  child.unref();
  return getMinerUStatus(root);
}
