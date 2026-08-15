#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";

const root = fileURLToPath(new URL("../", import.meta.url));
const dshHome = resolveDshHome();
const stateRoot = join(dshHome, "deepsee");

function loadDotEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith("#")) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] ??= value;
  }
}

function hasCommand(command) {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ".ps1", ""] : [""];
  return (process.env.PATH ?? "").split(delimiter).some((directory) => {
    const cleanDirectory = directory.replace(/^"|"$/g, "");
    return extensions.some((extension) => existsSync(join(cleanDirectory, `${command}${extension}`)));
  });
}

function configured(value) {
  return value?.trim() ? "configured" : "not configured";
}

function bridgeState() {
  for (const file of [".opends-bridge.json", ".opends-runtime-hub.json"]) {
    const path = join(stateRoot, file);
    if (!existsSync(path)) continue;
    try {
      return JSON.parse(readFileSync(path, "utf8")).enabled === false ? "disabled" : "enabled";
    } catch {
      return "enabled (state unreadable)";
    }
  }
  return "enabled (default)";
}

function bundleStatus(profile) {
  const path = join(dshHome, "profiles", profile, "package.json");
  if (!existsSync(path)) return "profile not initialized";
  try {
    const manifest = JSON.parse(readFileSync(path, "utf8"));
    const dependency = manifest.dependencies?.["deepsee-harness"];
    const active = manifest.dsh?.profile?.bundles?.includes("deepsee-harness");
    return dependency && active ? `installed (${dependency})` : "run deepsee install";
  } catch {
    return "profile manifest unreadable";
  }
}

function externalApiStatus() {
  if (!process.env.OPENDS_BRIDGE_API_KEY?.trim()) return "run pnpm run setup";
  const path = join(root, ".opends-bridge-health.json");
  if (!existsSync(path)) return "configured, not live-tested";
  try {
    const health = JSON.parse(readFileSync(path, "utf8"));
    const current = {
      provider: process.env.OPENDS_BRIDGE_VENDOR ?? "external",
      api: process.env.OPENDS_BRIDGE_API ?? "openai-completions",
      baseURL: process.env.OPENDS_BRIDGE_BASE_URL ?? "https://api.moonshot.cn/v1",
      model: process.env.OPENDS_BRIDGE_MODEL ?? "kimi-k3",
    };
    if (Object.entries(current).some(([key, value]) => health[key] !== value)) {
      return "configured, changed since test";
    }
    if (health.ok === true) return "ready (live vision test passed)";
    const http = health.httpStatus ? `, HTTP ${health.httpStatus}` : "";
    return `blocked: ${health.reason ?? "last test failed"}${http}`;
  } catch {
    return "configured, health record unreadable";
  }
}

loadDotEnv();
const externalReady = Boolean(process.env.OPENDS_BRIDGE_API_KEY?.trim());
const externalStatus = externalApiStatus();
console.log("DeepSee Bridge doctor");
console.table([
  { check: "Node.js", status: process.version },
  { check: "pnpm", status: hasCommand("pnpm") ? "available" : "not found" },
  { check: "Bridge state", status: bridgeState() },
  { check: "Built plugin", status: existsSync(join(root, "dist", "index.js")) ? "present" : "run pnpm run build" },
  { check: "Web profile", status: bundleStatus("web") },
  { check: "Headless profile", status: bundleStatus("headless") },
  { check: "External API", status: externalStatus },
]);
console.table([
  { setting: "Provider", value: process.env.OPENDS_BRIDGE_VENDOR ?? "kimi (default)" },
  { setting: "Protocol", value: process.env.OPENDS_BRIDGE_API ?? "openai-completions" },
  { setting: "Base URL", value: process.env.OPENDS_BRIDGE_BASE_URL ?? "https://api.moonshot.cn/v1" },
  { setting: "Model", value: process.env.OPENDS_BRIDGE_MODEL ?? "kimi-k3" },
  { setting: "External API key", value: configured(process.env.OPENDS_BRIDGE_API_KEY) },
  { setting: "DeepSeek API key", value: configured(process.env.DEEPSEEK_API_KEY) },
  { setting: "Automatic vision", value: process.env.OPENDS_BRIDGE_AUTO_VISION === "0" ? "off" : externalReady ? "on" : "waiting for API key" },
  { setting: "Text tool", value: process.env.OPENDS_BRIDGE_TEXT_TOOL === "1" ? externalReady ? "on" : "waiting for API key" : "off" },
]);
console.log(`Workspace: ${root}`);
console.log(`DSH_HOME: ${dshHome}`);
console.log("Secrets were not printed. Run `pnpm run test:connection` for one minimal live request.");
