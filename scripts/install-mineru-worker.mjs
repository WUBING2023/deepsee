#!/usr/bin/env node

import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { findExecutable } from "./runtime-locator.mjs";
import { managedMinerUExecutable, managedMinerURoot, writeMinerUState } from "./mineru-manager.mjs";

const root = process.argv[2];
if (!root || process.env.OPENDS_MINERU_INSTALL !== "1") process.exit(2);

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    stdio: "inherit",
    windowsHide: true,
    timeout: 90 * 60 * 1000,
  });
  if (result.status !== 0) throw new Error(`${args.slice(0, 2).join(" ")} 执行失败（exit ${result.status ?? "unknown"}）。`);
}

try {
  const uv = findExecutable("uv");
  if (!uv) throw new Error("未找到 uv。");
  const toolRoot = managedMinerURoot(root);
  const venv = join(toolRoot, ".venv");
  mkdirSync(toolRoot, { recursive: true });
  const env = {
    ...process.env,
    UV_CACHE_DIR: join(root, ".opends-tools", ".uv-cache"),
    MODELSCOPE_CACHE: join(toolRoot, "model-cache"),
    MINERU_TOOLS_CONFIG_JSON: join(toolRoot, "mineru.json"),
  };
  const python = process.platform === "win32" ? join(venv, "Scripts", "python.exe") : join(venv, "bin", "python");
  run(uv, [
    "venv",
    ...(existsSync(python) ? ["--clear"] : []),
    "--managed-python",
    "--python", "3.12",
    venv,
  ], env);
  run(uv, ["pip", "install", "--python", python, "-U", "mineru[all]"], env);
  const executable = managedMinerUExecutable(root);
  if (!existsSync(executable)) throw new Error("安装完成但未找到 mineru 可执行文件。");
  run(executable, ["--version"], env);
  const modelDownloader = process.platform === "win32"
    ? join(venv, "Scripts", "mineru-models-download.exe")
    : join(venv, "bin", "mineru-models-download");
  if (!existsSync(modelDownloader)) throw new Error("安装完成但未找到 MinerU 模型下载器。");
  run(modelDownloader, ["--source", "modelscope", "--model_type", "pipeline"], env);
  writeMinerUState(root, {
    status: "ready",
    completedAt: new Date().toISOString(),
    message: "MinerU 已安装；首次解析时可能按 MinerU 配置下载模型。",
  });
} catch (error) {
  writeMinerUState(root, {
    status: "error",
    completedAt: new Date().toISOString(),
    message: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
}
