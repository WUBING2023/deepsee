import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, parse, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findExecutable } from "./runtime-locator.mjs";
import { getMinerUStatus, startMinerUInstall, uninstallMinerU } from "./mineru-manager.mjs";
import { getOCRDefinition, OCR_TOOL_IDS, publicOCRCatalog } from "./ocr-catalog.mjs";

const moduleRoot = fileURLToPath(new URL("../", import.meta.url));

export function managedOCRRoot(root, id) {
  let base = process.env.OPENDS_OCR_HOME;
  if (!base && process.platform === "win32") {
    base = join(process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "DeepSee", "OCR");
    if (id === "paddleocr" && /[^\x20-\x7E]/.test(base)) {
      const programData = process.env.PROGRAMDATA || `${process.env.SystemDrive || "C:"}\\ProgramData`;
      const userId = createHash("sha256").update(homedir()).digest("hex").slice(0, 12);
      base = join(programData, "DeepSee", "OCR", userId);
    }
  }
  if (!base) base = join(root, ".opends-tools", "ocr-runtimes");
  return join(base, id);
}

export function managedOCRPython(root, id) {
  const toolRoot = managedOCRRoot(root, id);
  return process.platform === "win32"
    ? join(toolRoot, ".venv", "Scripts", "python.exe")
    : join(toolRoot, ".venv", "bin", "python");
}

function statePath(root, id) {
  return join(root, ".opends-tools", "ocr", id, "state.json");
}

function readState(root, id) {
  const path = statePath(root, id);
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function writeOCRState(root, id, value) {
  getOCRDefinition(id);
  const path = statePath(root, id);
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

function adjacentPython(executable) {
  const bin = dirname(executable);
  const candidates = process.platform === "win32"
    ? [join(dirname(bin), "python.exe"), join(bin, "python.exe")]
    : [join(bin, "python3"), join(bin, "python")];
  return candidates.find((candidate) => existsSync(candidate));
}

function pythonOCRStatus(root, id) {
  const definition = getOCRDefinition(id);
  const python = managedOCRPython(root, id);
  const state = readState(root, id);
  if (existsSync(python) && state.status === "ready") {
    return {
      status: "ready", installed: true, managed: true, executable: python,
      ...stateDetails(state), progress: 100, phase: "complete",
      message: state.message || `${definition.label} 已安装，可用于本地 OCR。`,
    };
  }
  if (state.status === "installing") {
    const started = Date.parse(state.startedAt || "");
    const age = Number.isFinite(started) ? Date.now() - started : Number.POSITIVE_INFINITY;
    const withinWindow = age >= 0 && age < 24 * 60 * 60 * 1000;
    const startupGrace = withinWindow && age < 60_000 && !state.pid;
    if (withinWindow && (processIsRunning(state.pid) || startupGrace)) {
      return { status: "installing", installed: false, managed: true,
        message: state.message || `正在安装 ${definition.label}…`, ...stateDetails(state) };
    }
    return { status: "error", installed: false, managed: true, ...stateDetails(state),
      phase: "error", message: `上一次 ${definition.label} 安装进程未完成；点击重试会重新检测安装方式。` };
  }
  if (state.status === "error") {
    return { status: "error", installed: false, managed: true, ...stateDetails(state),
      phase: "error", message: state.message || `${definition.label} 安装失败，可重试。` };
  }
  const external = findExecutable(definition.command);
  const externalPython = external ? adjacentPython(external) : undefined;
  if (external && externalPython) {
    return { status: "ready", installed: true, managed: false, executable: externalPython,
      progress: 100, phase: "complete", installMethod: "系统已有安装",
      message: `${definition.label} 已在系统 Python 环境中安装。` };
  }
  return { status: "not-installed", installed: false, managed: true, progress: 0, phase: "idle",
    message: state.message || "未安装；仅在你点击安装后才会下载。" };
}

export function getOCRStatus(root, id) {
  getOCRDefinition(id);
  return id === "mineru" ? getMinerUStatus(root) : pythonOCRStatus(root, id);
}

export function getOCRToolsState(root) {
  const catalog = publicOCRCatalog().map((entry) => ({ ...entry, ...getOCRStatus(root, entry.id) }));
  return { catalog };
}

export function startOCRInstall(root, id) {
  const definition = getOCRDefinition(id);
  if (id === "mineru") return startMinerUInstall(root);
  const current = getOCRStatus(root, id);
  if (current.status === "ready" || current.status === "installing") return current;
  const logRoot = join(root, ".opends-tools", "ocr", id);
  mkdirSync(logRoot, { recursive: true });
  const stdout = openSync(join(logRoot, "install.stdout.log"), "a");
  const stderr = openSync(join(logRoot, "install.stderr.log"), "a");
  const startedAt = new Date().toISOString();
  writeOCRState(root, id, { status: "installing", startedAt, progress: 2, phase: "starting",
    strategy: "自动检测", attempts: [], message: `正在准备 ${definition.label} 的隔离环境…` });
  let child;
  try {
    child = spawn(process.execPath, [join(moduleRoot, "scripts", "install-python-ocr-worker.mjs"), root, id], {
      cwd: root, detached: true, windowsHide: true, stdio: ["ignore", stdout, stderr],
      env: { ...process.env, OPENDS_OCR_INSTALL: id },
    });
  } finally {
    closeSync(stdout);
    closeSync(stderr);
  }
  if (!child?.pid) {
    writeOCRState(root, id, { status: "error", startedAt, completedAt: new Date().toISOString(),
      progress: 0, phase: "error", message: `${definition.label} 后台安装进程未能启动。` });
    throw new Error(`${definition.label} 后台安装进程未能启动。`);
  }
  child.once("error", (error) => writeOCRState(root, id, {
    status: "error", startedAt, completedAt: new Date().toISOString(), progress: 0, phase: "error",
    message: `${definition.label} 后台安装进程启动失败：${error.message}`,
  }));
  child.unref();
  return getOCRStatus(root, id);
}

const MANAGED_ENTRIES = Object.freeze([".venv", "cache", "downloads", "model-cache", "source", "probe.png"]);

export function uninstallOCR(root, id) {
  const definition = getOCRDefinition(id);
  if (id === "mineru") return uninstallMinerU(root);
  const current = getOCRStatus(root, id);
  if (current.status === "installing") throw new Error(`${definition.label} 正在安装，完成或失败后才能卸载。`);
  if (current.status === "ready" && current.managed === false) {
    throw new Error(`这是系统已有的 ${definition.label}；DeepSee 不会卸载其他程序管理的环境。`);
  }
  const toolRoot = resolve(managedOCRRoot(root, id));
  const filesystemRoot = parse(toolRoot).root;
  const depth = relative(filesystemRoot, toolRoot).split(/[\\/]+/).filter(Boolean).length;
  if (depth < 3 || toolRoot === resolve(root) || toolRoot === resolve(homedir())) {
    throw new Error(`${definition.label} 管理目录不安全，已拒绝卸载。`);
  }
  for (const entry of MANAGED_ENTRIES) rmSync(join(toolRoot, entry), { recursive: true, force: true });
  writeOCRState(root, id, { status: "not-installed", installed: false, progress: 0, phase: "idle",
    completedAt: new Date().toISOString(),
    message: `DeepSee 管理的 ${definition.label} 已卸载；系统中的其他安装未受影响。` });
  return getOCRStatus(root, id);
}

export function isOCRToolId(value) {
  return OCR_TOOL_IDS.includes(value);
}
