#!/usr/bin/env node

import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { findExecutable } from "./runtime-locator.mjs";
import { resolveExecutableInvocation } from "./npx-command.mjs";
import { conciseInstallError, discoverCompatiblePythonRuntimes, portableUvAsset } from "./mineru-install-strategies.mjs";
import { getOCRDefinition } from "./ocr-catalog.mjs";
import { managedOCRPython, managedOCRRoot, writeOCRState } from "./ocr-manager.mjs";

const stateRoot = process.argv[2];
const id = process.argv[3];
if (!stateRoot || !id || process.env.OPENDS_OCR_INSTALL !== id || id === "mineru") process.exit(2);

const definition = getOCRDefinition(id);
const moduleRoot = fileURLToPath(new URL("../", import.meta.url));
const runner = join(moduleRoot, "scripts", "ocr-runner.py");
const startedAt = new Date().toISOString();
const attempts = [];
const commandTimeoutMs = Number(process.env.OPENDS_OCR_COMMAND_TIMEOUT_MS) || 60 * 60 * 1000;
const toolRoot = managedOCRRoot(stateRoot, id);
const venv = join(toolRoot, ".venv");
const python = managedOCRPython(stateRoot, id);
const mirror = process.env.OPENDS_OCR_PYPI_MIRROR?.trim() || "https://mirrors.aliyun.com/pypi/simple";
const sources = [
  { label: "官方 PyPI", indexUrl: undefined },
  ...(mirror ? [{ label: "国内镜像", indexUrl: mirror }] : []),
];
const env = {
  ...process.env,
  PYTHONIOENCODING: "utf-8",
  PYTHONUTF8: "1",
  PIP_DISABLE_PIP_VERSION_CHECK: "1",
  UV_CACHE_DIR: join(toolRoot, "cache", "uv"),
  PADDLE_PDX_CACHE_HOME: join(toolRoot, "model-cache", "paddlex"),
  PADDLE_PDX_MODEL_SOURCE: process.env.PADDLE_PDX_MODEL_SOURCE || "BOS",
};
let progress = 4;
let phase = "detect";

function writeProgress(message, extra = {}) {
  if (Number.isFinite(extra.progress)) progress = Math.max(progress, Math.min(99, Number(extra.progress)));
  if (extra.phase) phase = extra.phase;
  writeOCRState(stateRoot, id, { status: "installing", pid: process.pid, startedAt, progress, phase,
    message, attempts, ...extra, progress, phase });
}

function safeRemove(target) {
  const relation = relative(toolRoot, target);
  if (!relation || relation === ".." || relation.startsWith(`..\\`) || relation.startsWith("../") || isAbsolute(relation)) {
    throw new Error(`拒绝清理 ${definition.label} 管理目录之外的路径。`);
  }
  rmSync(target, { recursive: true, force: true });
}

function run(command, args, label, runEnv = env) {
  const invocation = resolveExecutableInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: stateRoot, env: runEnv, stdio: "inherit", windowsHide: true, timeout: commandTimeoutMs,
  });
  if (result.error) throw new Error(`${label}无法启动：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}失败（exit ${result.status ?? "unknown"}）。`);
}

function runPython(runtime, args, label) {
  run(runtime.command, [...runtime.prefixArgs, ...args], label);
}

function attempt(label, action, targetProgress = Math.min(70, progress + 8)) {
  const record = { label, status: "running", startedAt: new Date().toISOString() };
  attempts.push(record);
  writeProgress(`正在尝试：${label}`, { strategy: label, phase: "install", progress: targetProgress });
  try {
    const value = action();
    record.status = "success";
    record.completedAt = new Date().toISOString();
    return value;
  } catch (error) {
    record.status = "failed";
    record.completedAt = new Date().toISOString();
    record.message = conciseInstallError(error);
    console.error(`[DeepSee ${definition.label}] ${label}: ${record.message}`);
    writeProgress(`${label}未成功，正在切换下一种方式…`, { strategy: label });
    return undefined;
  }
}

function resetVenv() {
  if (existsSync(venv)) safeRemove(venv);
  mkdirSync(toolRoot, { recursive: true });
}

function installPackages(installer, source, installSpec = definition.packageSpec) {
  const indexArgs = source.indexUrl ? ["--index-url", source.indexUrl] : [];
  if (definition.enginePackageSpec) {
    installer([definition.enginePackageSpec], ["--index-url", definition.engineIndexUrl]);
  }
  installer([installSpec, ...(definition.extraPackages || [])], indexArgs);
}

function uvInstall(uv, source, installSpec) {
  resetVenv();
  run(uv, ["venv", "--managed-python", "--python", "3.12", venv], `创建 ${definition.label} Python 环境`);
  installPackages((packages, extra) => run(uv, ["pip", "install", "--python", python, "-U", ...packages, ...extra], `安装 ${definition.label}`), source, installSpec);
  return { method: `UV · ${source.label}` };
}

function pythonInstall(runtime, source, installSpec) {
  resetVenv();
  runPython(runtime, ["-m", "venv", venv], `创建 ${definition.label} Python 环境`);
  run(python, ["-m", "pip", "install", "--upgrade", "pip", ...(source.indexUrl ? ["--index-url", source.indexUrl] : [])], "更新 pip");
  installPackages((packages, extra) => run(python, ["-m", "pip", "install", "-U", ...packages, ...extra], `安装 ${definition.label}`), source, installSpec);
  return { method: `Python/pip · ${source.label}` };
}

function downloadFile(url, target, pythonRuntime) {
  mkdirSync(dirname(target), { recursive: true });
  const partial = `${target}.partial`;
  rmSync(partial, { force: true });
  try {
    const curl = findExecutable("curl");
    if (curl) run(curl, ["--location", "--fail", "--retry", "2", "--connect-timeout", "30", "--output", partial, url], `下载 ${basename(target)}`);
    else if (process.platform === "win32" && (findExecutable("powershell") || findExecutable("powershell.exe"))) {
      const powershell = findExecutable("powershell") || findExecutable("powershell.exe");
      const script = "& { param([string]$url,[string]$output) $ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $output }";
      run(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, url, partial], `下载 ${basename(target)}`);
    } else if (pythonRuntime) {
      runPython(pythonRuntime, ["-c", "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])", url, partial], `下载 ${basename(target)}`);
    } else throw new Error("没有可用的下载器。");
    renameSync(partial, target);
  } finally {
    rmSync(partial, { force: true });
  }
}

function extractArchive(archive, destination, archiveType, pythonRuntime) {
  if (existsSync(destination)) safeRemove(destination);
  mkdirSync(destination, { recursive: true });
  if (archiveType === "tar.gz") {
    const tar = findExecutable("tar");
    if (!tar) throw new Error("没有可用的 tar 解压工具。");
    run(tar, ["-xzf", archive, "-C", destination], `解压 ${basename(archive)}`);
    return;
  }
  if (process.platform === "win32" && (findExecutable("powershell") || findExecutable("powershell.exe"))) {
    const powershell = findExecutable("powershell") || findExecutable("powershell.exe");
    const script = "& { param([string]$archive,[string]$destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }";
    run(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, archive, destination], `解压 ${basename(archive)}`);
  } else if (pythonRuntime) runPython(pythonRuntime, ["-m", "zipfile", "-e", archive, destination], `解压 ${basename(archive)}`);
  else if (findExecutable("unzip")) run(findExecutable("unzip"), ["-o", archive, "-d", destination], `解压 ${basename(archive)}`);
  else throw new Error("没有可用的 ZIP 解压工具。");
}

function findFile(directory, name, depth = 5) {
  if (depth < 0 || !existsSync(directory)) return undefined;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return path;
    if (entry.isDirectory()) {
      const nested = findFile(path, name, depth - 1);
      if (nested) return nested;
    }
  }
  return undefined;
}

function installPortableUv(pythonRuntime) {
  const asset = portableUvAsset();
  if (!asset) throw new Error(`当前平台不支持便携 UV：${process.platform}/${process.arch}`);
  const archive = join(toolRoot, "downloads", asset.fileName);
  const checksum = `${archive}.sha256`;
  downloadFile(asset.url, archive, pythonRuntime);
  downloadFile(asset.checksumUrl, checksum, pythonRuntime);
  const expected = readFileSync(checksum, "utf8").match(/\b[a-fA-F0-9]{64}\b/)?.[0]?.toLowerCase();
  const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (!expected || expected !== actual) throw new Error("便携 UV 压缩包 SHA-256 校验失败。");
  const destination = join(toolRoot, "cache", "portable-uv");
  extractArchive(archive, destination, asset.archiveType, pythonRuntime);
  const executable = findFile(destination, asset.executableName);
  if (!executable) throw new Error("便携 UV 解压后未找到可执行文件。");
  if (process.platform !== "win32") chmodSync(executable, 0o755);
  run(executable, ["--version"], "验证便携 UV");
  return executable;
}

function downloadSource(pythonRuntime) {
  const archive = join(toolRoot, "downloads", `${id}-source.zip`);
  const destination = join(toolRoot, "source");
  downloadFile(definition.sourceZipUrl, archive, pythonRuntime);
  extractArchive(archive, destination, "zip", pythonRuntime);
  const pyproject = findFile(destination, "pyproject.toml");
  if (!pyproject) throw new Error("官方源码 ZIP 中没有找到 pyproject.toml。");
  return dirname(pyproject);
}

function installPackage() {
  mkdirSync(toolRoot, { recursive: true });
  const runtimes = discoverCompatiblePythonRuntimes();
  let uv = findExecutable("uv");
  let installed;
  if (uv) {
    for (const source of sources) {
      installed = attempt(`系统 UV · ${source.label}`, () => uvInstall(uv, source));
      if (installed) return installed;
    }
  }
  for (const runtime of runtimes) {
    for (const source of sources) {
      installed = attempt(`${runtime.label} ${runtime.version} · ${source.label}`, () => pythonInstall(runtime, source));
      if (installed) return installed;
    }
  }
  uv = attempt("下载并校验便携 UV", () => installPortableUv(runtimes[0]), 48);
  if (uv) {
    for (const source of sources) {
      installed = attempt(`便携 UV · ${source.label}`, () => uvInstall(uv, source));
      if (installed) return installed;
    }
  }
  const sourceRoot = attempt(`下载并解压 ${definition.label} 官方源码 ZIP`, () => downloadSource(runtimes[0]), 58);
  if (!sourceRoot) return undefined;
  for (const source of sources) {
    installed = uv
      ? attempt(`源码 ZIP · UV · ${source.label}`, () => uvInstall(uv, source, sourceRoot), 66)
      : runtimes[0]
        ? attempt(`源码 ZIP · Python/pip · ${source.label}`, () => pythonInstall(runtimes[0], source, sourceRoot), 66)
        : undefined;
    if (installed) return installed;
  }
  return undefined;
}

try {
  if (process.platform === "win32" && id === "paddleocr" && /[^\x20-\x7E]/.test(toolRoot)) {
    throw new Error("PaddleOCR 的 Windows 原生推理层不支持非 ASCII 模型路径；请移除含中文的 OPENDS_OCR_HOME 自定义路径后重试。DeepSee 默认会自动选择兼容目录。");
  }
  writeProgress(`正在检测 ${definition.label} 可用的 UV、Python 与下载源…`, { phase: "detect", progress: 8 });
  const installed = installPackage();
  if (!installed || !existsSync(python)) throw new Error(`所有安装方式均未生成可用的 ${definition.label} 环境。`);
  writeProgress(`${definition.label} 核心已安装，正在准备本地模型…`, { phase: "models", progress: 78 });
  run(python, [runner, id, "--probe"], `验证 ${definition.label} 引擎与模型`);
  writeProgress(`${definition.label} 已通过真实引擎验证。`, { phase: "verify", progress: 96 });
  writeOCRState(stateRoot, id, { status: "ready", installed: true, startedAt,
    completedAt: new Date().toISOString(), progress: 100, phase: "complete",
    installMethod: installed.method, attempts,
    message: `${definition.label} 已通过 ${installed.method} 安装并验证，可用于本地 OCR。` });
} catch (error) {
  const failedAttempts = attempts.filter((attempt) => attempt.status === "failed").slice(-3);
  const attemptSummary = failedAttempts.length > 0
    ? ` 最后失败：${failedAttempts.map((attempt) => `${attempt.label}（${attempt.message || "未知错误"}）`).join("；")}。`
    : "";
  writeOCRState(stateRoot, id, { status: "error", installed: false, startedAt,
    completedAt: new Date().toISOString(), progress, phase: "error", attempts,
    message: `${definition.label} 自动安装未完成。${conciseInstallError(error)}${attemptSummary}` });
  process.exitCode = 1;
}
