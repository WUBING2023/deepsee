#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { downloadWithFallback } from "./download-fallback.mjs";
import { findExecutable } from "./runtime-locator.mjs";
import { resolveExecutableInvocation } from "./npx-command.mjs";
import {
  conciseInstallError,
  discoverCompatiblePythonRuntimes,
  isWindowsTorchDllFailure,
  mineruModelSources,
  mineruPackageSources,
  MINERU_PACKAGE_SPEC,
  MINERU_SOURCE_ZIP_URL,
  portableUvAsset,
  resolvePortableUvRelease,
  WINDOWS_TORCH_COMPAT_PACKAGES,
  WINDOWS_TORCH_CPU_INDEX,
} from "./mineru-install-strategies.mjs";
import { managedMinerUExecutable, managedMinerURoot, writeMinerUState } from "./mineru-manager.mjs";

const root = process.argv[2];
if (!root || process.env.OPENDS_MINERU_INSTALL !== "1") process.exit(2);

const startedAt = new Date().toISOString();
const attempts = [];
const commandTimeoutMs = Number(process.env.OPENDS_MINERU_COMMAND_TIMEOUT_MS) || 90 * 60 * 1000;
const packageSpec = process.env.OPENDS_MINERU_PACKAGE_SPEC?.trim() || MINERU_PACKAGE_SPEC;
const sourceExtra = process.env.OPENDS_MINERU_SOURCE_EXTRA?.trim() || "core";
const sourceZipUrl = process.env.OPENDS_MINERU_SOURCE_ZIP?.trim() || MINERU_SOURCE_ZIP_URL;
const toolRoot = managedMinerURoot(root);
const downloadWorker = fileURLToPath(new URL("./download-file-worker.mjs", import.meta.url));
const venv = join(toolRoot, ".venv");
const python = process.platform === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
const env = {
  ...process.env,
  PIP_DISABLE_PIP_VERSION_CHECK: "1",
  UV_CACHE_DIR: join(toolRoot, "cache", "uv"),
  MODELSCOPE_CACHE: join(toolRoot, "model-cache"),
  HF_HOME: join(toolRoot, "model-cache", "huggingface"),
  MINERU_TOOLS_CONFIG_JSON: join(toolRoot, "mineru.json"),
  PYTHONUTF8: "1",
  PYTHONIOENCODING: "utf-8",
};
let progress = 4;
let phase = "detect";

function writeProgress(message, extra = {}) {
  if (Number.isFinite(extra.progress)) progress = Math.max(progress, Math.min(99, Number(extra.progress)));
  if (typeof extra.phase === "string" && extra.phase) phase = extra.phase;
  writeMinerUState(root, {
    status: "installing",
    pid: process.pid,
    startedAt,
    progress,
    phase,
    message,
    attempts,
    ...extra,
    progress,
    phase,
  });
}

function safeRemove(target) {
  const relation = relative(toolRoot, target);
  if (!relation || relation === ".." || relation.startsWith(`..\\`) || relation.startsWith("../") || isAbsolute(relation)) {
    throw new Error(`拒绝清理 MinerU 管理目录之外的路径：${target}`);
  }
  rmSync(target, { recursive: true, force: true });
}

function run(command, args, label, runEnv = env) {
  const invocation = resolveExecutableInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    env: runEnv,
    stdio: "inherit",
    windowsHide: true,
    timeout: commandTimeoutMs,
  });
  if (result.error) throw new Error(`${label}无法启动：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}失败（exit ${result.status ?? "unknown"}）。`);
}

function runPython(runtime, args, label) {
  run(runtime.command, [...runtime.prefixArgs, ...args], label);
}

function capture(command, args) {
  const invocation = resolveExecutableInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: root,
    env,
    encoding: "utf8",
    windowsHide: true,
    timeout: commandTimeoutMs,
  });
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
  if (output) console.error(output);
  return { ...result, output };
}

function attempt(label, action) {
  const record = { label, status: "running", startedAt: new Date().toISOString() };
  attempts.push(record);
  const modelDownload = /pipeline 模型/.test(label);
  const attemptProgress = modelDownload
    ? Math.max(progress, 82)
    : Math.min(66, Math.max(progress + 5, 20));
  writeProgress(`正在尝试：${label}`, { strategy: label, phase: modelDownload ? "models" : "install", progress: attemptProgress });
  try {
    const value = action();
    record.status = "success";
    record.completedAt = new Date().toISOString();
    writeProgress(`${label}已完成，正在继续验证…`, { strategy: label, progress: modelDownload ? 96 : Math.min(72, progress + 5) });
    return value;
  } catch (error) {
    record.status = "failed";
    record.completedAt = new Date().toISOString();
    record.message = conciseInstallError(error);
    console.error(`[DeepSee MinerU] ${label}: ${record.message}`);
    writeProgress(`${label}未成功，正在自动切换下一种方式…`, { strategy: label });
    return undefined;
  }
}

function resetVenv() {
  if (existsSync(venv)) safeRemove(venv);
  mkdirSync(toolRoot, { recursive: true });
}

function uvInstall(uv, source, installSpec = packageSpec) {
  resetVenv();
  run(uv, ["venv", "--managed-python", "--python", "3.12", venv], "创建 MinerU Python 环境");
  const args = ["pip", "install", "--python", python, "-U", installSpec];
  if (source.indexUrl) args.push("--index-url", source.indexUrl);
  run(uv, args, `通过 ${source.label} 安装 MinerU`);
  return { python, method: `UV · ${source.label}` };
}

function pythonInstall(runtime, source, installSpec = packageSpec) {
  resetVenv();
  runPython(runtime, ["-m", "venv", venv], "创建 MinerU Python 环境");
  const pipIndex = source.indexUrl ? ["--index-url", source.indexUrl] : [];
  run(python, ["-m", "pip", "install", "--upgrade", "pip", ...pipIndex], `通过 ${source.label} 更新 pip`);
  run(python, ["-m", "pip", "install", "-U", installSpec, ...pipIndex], `通过 ${source.label} 安装 MinerU`);
  return { python, method: `Python/pip · ${source.label}` };
}

function downloadFile(url, target, pythonRuntime) {
  const label = basename(target);
  const strategies = [{
    label: "DeepSee Node HTTPS",
    download: (source, partial) => run(process.execPath, [downloadWorker, source, partial], `通过 DeepSee Node 下载 ${label}`),
  }];
  const curl = findExecutable("curl");
  if (curl) strategies.push({
    label: "curl",
    download: (source, partial) => run(curl, ["--location", "--fail", "--retry", "2", "--connect-timeout", "30", "--output", partial, source], `通过 curl 下载 ${label}`),
  });
  const powershell = process.platform === "win32" && (findExecutable("powershell") || findExecutable("powershell.exe"));
  if (powershell) strategies.push({
    label: "PowerShell TLS 1.2",
    download: (source, partial) => {
      const script = "& { param([string]$url,[string]$output) $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $output }";
      run(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, source, partial], `通过 PowerShell 下载 ${label}`);
    },
  });
  if (pythonRuntime) strategies.push({
    label: "Python urllib",
    download: (source, partial) => runPython(pythonRuntime, ["-c", "import sys, urllib.request; urllib.request.urlretrieve(sys.argv[1], sys.argv[2])", source, partial], `通过 Python 下载 ${label}`),
  });
  return downloadWithFallback(url, target, strategies);
}

function extractArchive(archive, destination, archiveType, pythonRuntime) {
  if (existsSync(destination)) safeRemove(destination);
  mkdirSync(destination, { recursive: true });
  if (archiveType === "zip") {
    if (process.platform === "win32" && (findExecutable("powershell") || findExecutable("powershell.exe"))) {
      const powershell = findExecutable("powershell") || findExecutable("powershell.exe");
      const script = "& { param([string]$archive,[string]$destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }";
      run(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, archive, destination], `解压 ${basename(archive)}`);
      return;
    }
    if (pythonRuntime) {
      runPython(pythonRuntime, ["-m", "zipfile", "-e", archive, destination], `解压 ${basename(archive)}`);
      return;
    }
    const unzip = findExecutable("unzip");
    if (unzip) {
      run(unzip, ["-o", archive, "-d", destination], `解压 ${basename(archive)}`);
      return;
    }
    throw new Error("没有可用的 ZIP 解压工具。");
  }
  const tar = findExecutable("tar");
  if (!tar) throw new Error("没有可用的 tar 解压工具。");
  run(tar, ["-xzf", archive, "-C", destination], `解压 ${basename(archive)}`);
}

function findFile(rootDirectory, name, depth = 4) {
  if (depth < 0 || !existsSync(rootDirectory)) return undefined;
  for (const entry of readdirSync(rootDirectory, { withFileTypes: true })) {
    const path = join(rootDirectory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) return path;
    if (entry.isDirectory()) {
      const nested = findFile(path, name, depth - 1);
      if (nested) return nested;
    }
  }
  return undefined;
}

function verifySha256(archive, checksumFile, trustedDigest) {
  const expected = trustedDigest || readFileSync(checksumFile, "utf8").match(/\b[a-fA-F0-9]{64}\b/)?.[0]?.toLowerCase();
  if (!expected) throw new Error("便携 UV 校验文件格式无效。");
  const actual = createHash("sha256").update(readFileSync(archive)).digest("hex");
  if (actual !== expected) throw new Error("便携 UV 压缩包 SHA-256 校验失败。");
}

function installPortableUv(pythonRuntime) {
  const asset = portableUvAsset();
  if (!asset) throw new Error(`当前平台暂不支持便携 UV：${process.platform}/${process.arch}`);
  const bootstrapRoot = join(toolRoot, "bootstrap", "uv");
  const archive = join(toolRoot, "downloads", asset.fileName);
  const checksum = `${archive}.sha256`;
  const releaseMetadata = join(toolRoot, "downloads", "uv-release.json");
  let release;
  try {
    downloadFile(asset.releaseApiUrl, releaseMetadata, pythonRuntime);
    release = resolvePortableUvRelease(JSON.parse(readFileSync(releaseMetadata, "utf8")), asset);
  } catch (error) {
    console.error(`[DeepSee MinerU] UV Release 元数据不可用，将改用官方校验文件：${conciseInstallError(error)}`);
  }
  downloadFile(release?.archiveUrl || asset.url, archive, pythonRuntime);
  if (!release?.digest) downloadFile(release?.checksumUrl || asset.checksumUrl, checksum, pythonRuntime);
  verifySha256(archive, checksum, release?.digest);
  extractArchive(archive, bootstrapRoot, asset.archiveType, pythonRuntime);
  const executable = findFile(bootstrapRoot, asset.executableName);
  if (!executable) throw new Error("便携 UV 解压完成，但未找到可执行文件。");
  if (process.platform !== "win32") chmodSync(executable, 0o755);
  run(executable, ["--version"], "验证便携 UV");
  return executable;
}

function downloadMinerUSource(pythonRuntime) {
  const archive = join(toolRoot, "downloads", "MinerU-source.zip");
  const sourceRoot = join(toolRoot, "source");
  downloadFile(sourceZipUrl, archive, pythonRuntime);
  extractArchive(archive, sourceRoot, "zip", pythonRuntime);
  const pyproject = findFile(sourceRoot, "pyproject.toml", 3);
  if (!pyproject) throw new Error("官方源码 ZIP 中没有找到 pyproject.toml。");
  return dirname(pyproject);
}

function modelDownloaderPath() {
  return process.platform === "win32"
    ? join(venv, "Scripts", "mineru-models-download.exe")
    : join(venv, "bin", "mineru-models-download");
}

function installWindowsTorchCompatibility(installed) {
  if (process.platform !== "win32") return;
  writeProgress("正在验证 Windows PyTorch 运行库…", { phase: "verify", progress: 72 });
  const initial = capture(python, ["-c", "import torch; print(torch.__version__)"]);
  if (initial.status === 0) return;
  if (!isWindowsTorchDllFailure(initial.output)) {
    throw new Error(`PyTorch 无法启动：${conciseInstallError(initial.output || initial.error || `exit ${initial.status}`)}`);
  }

  const repaired = attempt("修复 Windows PyTorch CPU 兼容性", () => {
    writeProgress("检测到 c10.dll 初始化失败，正在切换到 PyTorch 2.8 CPU 兼容组合…", {
      phase: "repair",
      progress: 73,
    });
    if (installed.uv) {
      run(installed.uv, [
        "pip",
        "install",
        "--python",
        python,
        "--reinstall",
        ...WINDOWS_TORCH_COMPAT_PACKAGES,
        "--index-url",
        WINDOWS_TORCH_CPU_INDEX,
      ], "安装 Windows PyTorch CPU 兼容组合");
    } else {
      run(python, [
        "-m",
        "pip",
        "install",
        "--reinstall",
        ...WINDOWS_TORCH_COMPAT_PACKAGES,
        "--index-url",
        WINDOWS_TORCH_CPU_INDEX,
      ], "安装 Windows PyTorch CPU 兼容组合");
    }
    const verified = capture(python, ["-c", "import torch; print(torch.__version__)"]);
    if (verified.status !== 0) {
      const detail = conciseInstallError(verified.output || verified.error || `exit ${verified.status}`);
      throw new Error(`PyTorch 2.8 CPU 仍无法加载（${detail}）。请安装 Microsoft Visual C++ 2015–2022 x64 Redistributable 后重试：https://aka.ms/vs/17/release/vc_redist.x64.exe`);
    }
    return true;
  });
  if (!repaired) {
    throw new Error("Windows PyTorch DLL 自动修复未完成。请打开安装诊断，按提示安装 Microsoft Visual C++ 运行库后重试。");
  }
}

function installPackage() {
  mkdirSync(toolRoot, { recursive: true });
  writeProgress("正在检查 UV、Python 与安装源…", { phase: "detect", progress: 10 });
  const sources = mineruPackageSources();
  const pythonRuntimes = discoverCompatiblePythonRuntimes();
  let uv = findExecutable("uv");
  let installed;

  if (uv) {
    for (const source of sources) {
      installed = attempt(`系统 UV · ${source.label}`, () => uvInstall(uv, source));
      if (installed) return { ...installed, uv, pythonRuntimes };
    }
  }

  for (const runtime of pythonRuntimes) {
    for (const source of sources) {
      installed = attempt(`${runtime.label} ${runtime.version} · ${source.label}`, () => pythonInstall(runtime, source));
      if (installed) return { ...installed, uv, pythonRuntimes };
    }
  }

  uv = attempt("下载并校验便携 UV 压缩包", () => installPortableUv(pythonRuntimes[0]));
  if (uv) {
    for (const source of sources) {
      installed = attempt(`便携 UV · ${source.label}`, () => uvInstall(uv, source));
      if (installed) return { ...installed, uv, pythonRuntimes };
    }
  }

  const archivePython = existsSync(python)
    ? { command: python, prefixArgs: [], label: "DeepSee managed Python" }
    : pythonRuntimes[0];
  const sourceRoot = attempt("下载并解压 MinerU 官方源码 ZIP", () => downloadMinerUSource(archivePython));
  if (!sourceRoot) return undefined;
  for (const source of sources) {
    if (uv) {
      installed = attempt(`源码 ZIP · UV · ${source.label}`, () => uvInstall(uv, source, `${sourceRoot}[${sourceExtra}]`));
    } else if (pythonRuntimes[0]) {
      installed = attempt(`源码 ZIP · Python/pip · ${source.label}`, () => pythonInstall(pythonRuntimes[0], source, `${sourceRoot}[${sourceExtra}]`));
    } else {
      attempt("处理 MinerU 官方源码 ZIP", () => { throw new Error("源码已下载，但电脑上没有兼容 Python，且便携 UV 无法启动。"); });
      break;
    }
    if (installed) return { ...installed, uv, pythonRuntimes };
  }
  return undefined;
}

try {
  writeProgress("正在检测已有 UV、Python 与可用下载源…", { strategy: "自动检测", phase: "detect", progress: 6 });
  const installed = installPackage();
  const executable = managedMinerUExecutable(root);
  if (!installed || !existsSync(executable)) throw new Error("所有自动安装方式均未生成可用的 mineru 可执行文件。");
  installWindowsTorchCompatibility(installed);
  writeProgress("MinerU 核心已安装，正在验证可执行文件…", { phase: "verify", progress: 74 });
  run(executable, ["--version"], "验证 MinerU");
  const modelDownloader = modelDownloaderPath();
  if (!existsSync(modelDownloader)) throw new Error("安装完成但未找到 MinerU 模型下载器。");

  writeProgress("正在准备 MinerU pipeline 模型…", { phase: "models", progress: 80 });
  let modelsReady = false;
  for (const source of mineruModelSources()) {
    const result = attempt(`下载 pipeline 模型 · ${source}`, () => {
      run(modelDownloader, ["--source", source, "--model_type", "pipeline"], `通过 ${source} 下载 MinerU 模型`);
      return true;
    });
    if (result) {
      modelsReady = true;
      break;
    }
  }
  if (!modelsReady) throw new Error("MinerU 已安装，但所有模型下载源均未完成；可以稍后点击重试。");

  writeMinerUState(root, {
    status: "ready",
    installed: true,
    startedAt,
    completedAt: new Date().toISOString(),
    progress: 100,
    phase: "complete",
    installMethod: installed.method,
    attempts,
    message: `MinerU 已通过 ${installed.method} 安装，可用于文档 OCR 与版面解析。`,
  });
} catch (error) {
  const lastFailures = attempts.filter((item) => item.status === "failed").slice(-3);
  const failureSummary = lastFailures.map((item) => `${item.label}（${item.message || "未知错误"}）`).join("；");
  writeMinerUState(root, {
    status: "error",
    installed: false,
    startedAt,
    completedAt: new Date().toISOString(),
    progress,
    phase: "error",
    attempts,
    message: `MinerU 自动安装未完成。${conciseInstallError(error)}${failureSummary ? ` 最后失败：${failureSummary}。` : ""}`,
  });
  process.exitCode = 1;
}
