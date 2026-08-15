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
      message: "MinerU 已安装，可用于文档 OCR 与版面解析。",
    };
  }
  if (state.status === "installing") {
    const started = Date.parse(state.startedAt || "");
    if (Number.isFinite(started) && Date.now() - started < 2 * 60 * 60 * 1000) {
      return { status: "installing", installed: false, managed: true, message: "正在安装 MinerU…" };
    }
  }
  if (state.status === "error") {
    return { status: "error", installed: false, managed: true, message: state.message || "MinerU 安装失败，可重试。" };
  }
  const external = managedExists ? undefined : findExecutable("mineru");
  if (external) {
    return {
      status: "ready",
      installed: true,
      managed: false,
      executable: external,
      message: "MinerU 已安装，可用于文档 OCR 与版面解析。",
    };
  }
  return {
    status: "not-installed",
    installed: false,
    managed: true,
    message: "未安装；仅在你点击安装后才会下载。",
  };
}

export function startMinerUInstall(root) {
  const current = getMinerUStatus(root);
  if (current.status === "ready" || current.status === "installing") return current;
  if (!findExecutable("uv")) throw new Error("未找到 uv；请先安装 uv 后重试。");
  const toolRoot = join(root, ".opends-tools", "mineru");
  mkdirSync(toolRoot, { recursive: true });
  const stdoutPath = join(toolRoot, "install.stdout.log");
  const stderrPath = join(toolRoot, "install.stderr.log");
  const stdout = openSync(stdoutPath, "a");
  const stderr = openSync(stderrPath, "a");
  const child = spawn(process.execPath, [join(moduleRoot, "scripts", "install-mineru-worker.mjs"), root], {
    cwd: root,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", stdout, stderr],
    env: { ...process.env, OPENDS_MINERU_INSTALL: "1" },
  });
  closeSync(stdout);
  closeSync(stderr);
  child.unref();
  writeMinerUState(root, {
    status: "installing",
    pid: child.pid,
    startedAt: new Date().toISOString(),
    message: "正在安装 MinerU…",
  });
  return getMinerUStatus(root);
}
