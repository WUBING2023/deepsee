#!/usr/bin/env node

import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getManagedRuntimeDefinition } from "./runtime-catalog.mjs";
import { managedRuntimeExecutable, validateRuntimeInstallPath, writeManagedRuntimeState } from "./runtime-manager.mjs";
import { findExecutable } from "./runtime-locator.mjs";
import { resolveExecutableInvocation } from "./npx-command.mjs";

const stateRoot = process.argv[2];
const id = process.argv[3];
const requestedPath = process.argv[4];
if (!stateRoot || !id || !requestedPath || process.env.OPENDS_RUNTIME_INSTALL !== id) process.exit(2);

const definition = getManagedRuntimeDefinition(id);
const installPath = validateRuntimeInstallPath(requestedPath, id, { stateRoot });
const moduleRoot = fileURLToPath(new URL("../", import.meta.url));
const startedAt = new Date().toISOString();
const attempts = [];
let progress = 5;
let phase = "detect";

function writeProgress(message, extra = {}) {
  if (Number.isFinite(extra.progress)) progress = Math.max(progress, Math.min(99, Number(extra.progress)));
  if (extra.phase) phase = extra.phase;
  writeManagedRuntimeState(stateRoot, id, { status: "installing", pid: process.pid, startedAt,
    installPath, attempts, message, ...extra, progress, phase });
}

function concise(error) {
  return String(error instanceof Error ? error.message : error).replace(/[\r\n]+/g, " ").trim().slice(0, 420);
}

async function attempt(label, action, targetProgress) {
  const record = { label, status: "running", startedAt: new Date().toISOString() };
  attempts.push(record);
  writeProgress(`正在尝试：${label}`, { strategy: label, phase: "install", progress: targetProgress });
  try {
    const result = await action();
    record.status = "success";
    record.completedAt = new Date().toISOString();
    return result;
  } catch (error) {
    record.status = "failed";
    record.completedAt = new Date().toISOString();
    record.message = concise(error);
    writeProgress(`${label}未成功，正在切换备用方式…`, { strategy: label });
    return undefined;
  }
}

function run(command, args, label) {
  const invocation = resolveExecutableInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd: stateRoot, env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    stdio: "inherit", windowsHide: true, timeout: 60 * 60 * 1000,
  });
  if (result.error) throw new Error(`${label}无法启动：${result.error.message}`);
  if (result.status !== 0) throw new Error(`${label}失败（exit ${result.status ?? "unknown"}）。`);
}

function writeMarker(method) {
  mkdirSync(installPath, { recursive: true });
  writeFileSync(join(installPath, ".deepsee-runtime.json"), `${JSON.stringify({ id, managedBy: "deepsee", method }, null, 2)}\n`, "utf8");
}

function installWithNpm() {
  const npm = findExecutable("npm");
  if (!npm) throw new Error("没有找到 npm；Gemini CLI 官方安装要求 Node.js 20+。");
  writeMarker("npm");
  run(npm, ["install", "--global", "--prefix", installPath, definition.packageSpec, "--no-audit", "--no-fund"], "npm 安装 Gemini CLI");
  const executable = managedRuntimeExecutable(installPath, id);
  if (!executable) throw new Error("npm 已结束，但没有生成 gemini 可执行入口。");
  return { executable, method: "npm · 官方稳定版" };
}

async function download(url, target) {
  const partial = `${target}.partial`;
  rmSync(partial, { force: true });
  const response = await fetch(url, { redirect: "follow", headers: { "user-agent": "DeepSee Runtime Installer" } });
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）。`);
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(partial, buffer);
  renameSync(partial, target);
}

async function installOfficialBundle() {
  if (id !== "gemini") throw new Error("该 Runtime 没有官方 bundle 备用方案。");
  const release = await fetch("https://api.github.com/repos/google-gemini/gemini-cli/releases/latest", {
    headers: { accept: "application/vnd.github+json", "user-agent": "DeepSee Runtime Installer" },
  });
  if (!release.ok) throw new Error(`无法读取 Gemini CLI 官方 Release（HTTP ${release.status}）。`);
  const metadata = await release.json();
  const asset = Array.isArray(metadata.assets) ? metadata.assets.find((item) => item?.name === "gemini.js") : undefined;
  if (!asset?.browser_download_url) throw new Error("官方最新 Release 中没有找到 gemini.js。");
  const bundleRoot = join(installPath, "bundle");
  mkdirSync(bundleRoot, { recursive: true });
  const bundle = join(bundleRoot, "gemini.js");
  await download(asset.browser_download_url, bundle);
  writeMarker("official-release-bundle");
  if (process.platform === "win32") {
    const escapedNode = process.execPath.replaceAll("%", "%%");
    writeFileSync(join(installPath, "gemini.cmd"), `@echo off\r\n"${escapedNode}" "%~dp0bundle\\gemini.js" %*\r\n`, "utf8");
  } else {
    const binRoot = join(installPath, "bin");
    mkdirSync(binRoot, { recursive: true });
    const wrapper = join(binRoot, "gemini");
    writeFileSync(wrapper, `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/../bundle/gemini.js" "$@"\n`, "utf8");
    chmodSync(wrapper, 0o755);
  }
  const executable = managedRuntimeExecutable(installPath, id);
  if (!executable) throw new Error("官方 bundle 已下载，但没有生成 gemini 可执行入口。");
  return { executable, method: "GitHub Release · 官方单文件 bundle" };
}

try {
  mkdirSync(installPath, { recursive: true });
  writeProgress(`正在检测 ${definition.label} 的官方安装方式…`, { phase: "detect", progress: 9 });
  let installed = await attempt("npm · 官方稳定版", installWithNpm, 18);
  if (!installed) installed = await attempt("GitHub Release · 官方 bundle", installOfficialBundle, 62);
  if (!installed) throw new Error("npm 与官方 Release bundle 均未成功。");
  writeProgress(`正在验证 ${definition.label} 可执行入口…`, { phase: "verify", progress: 92 });
  run(installed.executable, ["--version"], `验证 ${definition.label}`);
  writeManagedRuntimeState(stateRoot, id, { status: "ready", installed: true, startedAt,
    completedAt: new Date().toISOString(), installPath, executable: installed.executable,
    progress: 100, phase: "complete", installMethod: installed.method, attempts,
    message: `${definition.label} 已通过 ${installed.method} 安装并验证；重启 Harness 后可用。${definition.authHint}` });
  try {
    const { discoverDeepSeeRuntimes } = await import("./runtime-discovery.mjs");
    await discoverDeepSeeRuntimes({ packageRoot: moduleRoot, stateRoot, dshHome: dirname(stateRoot), cwd: stateRoot });
  } catch {
    // Runtime state is authoritative; Harness startup will repeat discovery.
  }
} catch (error) {
  writeManagedRuntimeState(stateRoot, id, { status: "error", installed: false, startedAt,
    completedAt: new Date().toISOString(), installPath, progress, phase: "error", attempts,
    message: `${definition.label} 自动安装未完成。${concise(error)}` });
  process.exitCode = 1;
}
