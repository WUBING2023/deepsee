#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { findExecutable } from "./runtime-locator.mjs";
import { writeDeepSeeUpdateState } from "./update-manager.mjs";
import {
  DEEPSEE_PACKAGE_NAME,
  deepSeeUpdateArchiveUrl,
  validateDeepSeeManifest,
  validateDeepSeeSourceRef,
} from "./update-policy.mjs";

const [stateRoot, dshHome, expectedVersion, sourceRefValue] = process.argv.slice(2);
if (!stateRoot || !dshHome || !expectedVersion || !sourceRefValue) {
  throw new Error("DeepSee update worker requires stateRoot, DSH_HOME, expectedVersion and sourceRef.");
}
const sourceRef = validateDeepSeeSourceRef(sourceRefValue);
const archiveUrl = deepSeeUpdateArchiveUrl(sourceRef);

const updateRoot = join(stateRoot, ".opends-update");
const archive = join(updateRoot, "downloads", `deepsee-${expectedVersion}.zip`);
const partial = `${archive}.partial`;
const workRoot = join(updateRoot, "work", `${process.pid}-${Date.now()}`);
const priorState = (() => {
  try {
    return JSON.parse(readFileSync(join(updateRoot, "state.json"), "utf8"));
  } catch {
    return {};
  }
})();
const startedAt = priorState.startedAt || new Date().toISOString();

function safeRemove(target) {
  const relation = relative(updateRoot, target);
  if (!relation || relation === ".." || relation.startsWith(`..\\`) || relation.startsWith("../") || isAbsolute(relation)) {
    throw new Error(`Refusing to remove a path outside the DeepSee update workspace: ${target}`);
  }
  rmSync(target, { recursive: true, force: true });
}

function run(command, args, label) {
  const result = spawnSync(command, args, {
    cwd: stateRoot,
    env: { ...process.env, DSH_HOME: dshHome },
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw new Error(`${label}无法启动：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}失败（退出码 ${String(result.status)}）。`);
}

async function downloadArchive() {
  mkdirSync(join(updateRoot, "downloads"), { recursive: true });
  rmSync(partial, { force: true });
  const response = await fetch(archiveUrl, {
    headers: { accept: "application/zip", "user-agent": `DeepSee-Updater/${expectedVersion}` },
    redirect: "follow",
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!response.ok) throw new Error(`下载 GitHub ZIP 失败（HTTP ${response.status}）。`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength < 1024) throw new Error("下载的 DeepSee ZIP 文件异常过小。");
  writeFileSync(partial, bytes);
  rmSync(archive, { force: true });
  renameSync(partial, archive);
}

function extractArchive() {
  safeRemove(workRoot);
  mkdirSync(workRoot, { recursive: true });
  if (process.platform === "win32") {
    const powershell = findExecutable("powershell") || findExecutable("powershell.exe");
    if (powershell) {
      const script = "& { param([string]$archive,[string]$destination) Expand-Archive -LiteralPath $archive -DestinationPath $destination -Force }";
      run(powershell, ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script, archive, workRoot], "解压 DeepSee ZIP");
      return;
    }
  }
  const unzip = findExecutable("unzip");
  if (unzip) {
    run(unzip, ["-o", archive, "-d", workRoot], "解压 DeepSee ZIP");
    return;
  }
  const python = findExecutable("python3") || findExecutable("python");
  if (python) {
    run(python, ["-m", "zipfile", "-e", archive, workRoot], "解压 DeepSee ZIP");
    return;
  }
  throw new Error("电脑上没有可用的 PowerShell、unzip 或 Python ZIP 解压工具。");
}

function findPackageRoot(directory, depth = 3) {
  if (depth < 0 || !existsSync(directory)) return undefined;
  const manifestPath = join(directory, "package.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = validateDeepSeeManifest(JSON.parse(readFileSync(manifestPath, "utf8")));
      if (manifest.name === DEEPSEE_PACKAGE_NAME && manifest.version === expectedVersion) return directory;
    } catch {
      // Continue scanning only inside the dedicated extracted update workspace.
    }
  }
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const found = findPackageRoot(join(directory, entry.name), depth - 1);
    if (found) return found;
  }
  return undefined;
}

try {
  console.log(`[DeepSee] Downloading verified commit ${sourceRef}`);
  await downloadArchive();
  extractArchive();
  const packageRoot = findPackageRoot(workRoot);
  if (!packageRoot) {
    throw new Error(`GitHub ZIP 未包含经过验证的 DeepSee ${expectedVersion} 预构建包。`);
  }
  for (const required of ["dist/index.js", "scripts/cli.mjs", "scripts/install-plugin.mjs", "scripts/install-policy.mjs"]) {
    if (!existsSync(join(packageRoot, ...required.split("/")))) {
      throw new Error(`DeepSee ZIP 缺少升级所需文件：${required}`);
    }
  }

  console.log(`[DeepSee] Installing verified package ${expectedVersion} from ${basename(packageRoot)}`);
  run(process.execPath, [
    join(packageRoot, "scripts", "cli.mjs"),
    "install",
    "--from-folder",
    "--timeout-ms",
    "1800000",
    "--retries",
    "2",
    "--force",
  ], "安装 DeepSee 更新");

  writeDeepSeeUpdateState(stateRoot, {
    status: "restart-required",
    currentVersion: priorState.currentVersion,
    latestVersion: expectedVersion,
    sourceRef,
    checkedAt: priorState.checkedAt,
    startedAt,
    completedAt: new Date().toISOString(),
    message: `DeepSee ${expectedVersion} 已安装到 Web 与 Headless；重启 Harness 后生效。`,
  });
} catch (error) {
  writeDeepSeeUpdateState(stateRoot, {
    status: "error",
    currentVersion: priorState.currentVersion,
    latestVersion: expectedVersion,
    sourceRef,
    checkedAt: priorState.checkedAt,
    startedAt,
    completedAt: new Date().toISOString(),
    message: `DeepSee 自动升级未完成：${error instanceof Error ? error.message : String(error)}`,
  });
  process.exitCode = 1;
} finally {
  rmSync(partial, { force: true });
  if (existsSync(workRoot)) safeRemove(workRoot);
  rmSync(archive, { force: true });
}
