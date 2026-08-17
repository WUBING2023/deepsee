import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_DEEPSEEK_SELECTION, readBridgeState, readModelSelection } from "./model-selection.mjs";
import { findExecutable } from "./runtime-locator.mjs";
import { connectionToRoute, loadConnections } from "./model-connections.mjs";
import { runtimeDefinitions, verifyRuntime } from "./runtime-health.mjs";
import { discoverCodexModels } from "./cli-model-catalog.mjs";
import { discoverDesktopApps, publicDesktopApps } from "./desktop-runtime.mjs";

const LEGACY_STATE_FILES = [
  ".opends-models.json",
  ".opends-connections.json",
  ".opends-bridge.json",
  ".opends-runtime-hub.json",
];

export const WORKSPACE_INSTRUCTION_CANDIDATES = Object.freeze([
  "AGENTS.md",
  "CLAUDE.md",
  "agent.md",
  "AGENTS.local.md",
  "CLAUDE.local.md",
  "agent.local.md",
]);

export function discoverWorkspaceInstructions(cwd = process.cwd()) {
  const workspace = resolve(cwd);
  let projectRoot = workspace;
  while (dirname(projectRoot) !== projectRoot && !existsSync(join(projectRoot, ".git"))) {
    projectRoot = dirname(projectRoot);
  }
  if (!existsSync(join(projectRoot, ".git"))) projectRoot = workspace;
  const directories = [];
  for (let directory = workspace; ; directory = dirname(directory)) {
    directories.unshift(directory);
    if (directory === projectRoot || dirname(directory) === directory) break;
  }
  const files = [];
  for (const directory of directories) {
    for (const name of WORKSPACE_INSTRUCTION_CANDIDATES) {
      const path = join(directory, name);
      try {
        const details = statSync(path);
        if (!details.isFile() || details.size === 0 || details.size > 1024 * 1024) continue;
        files.push({
          name,
          path: relative(projectRoot, path).replaceAll("\\", "/") || name,
          scope: relative(projectRoot, directory).replaceAll("\\", "/") || ".",
          local: name.toLowerCase().includes(".local."),
        });
      } catch {
        // Missing, inaccessible, and transient files stay out of the public summary.
      }
    }
  }
  return {
    projectRoot: projectRoot === workspace ? "." : relative(workspace, projectRoot).replaceAll("\\", "/") || ".",
    files,
    active: files.length > 0,
  };
}

function defaultDshHome(env = process.env) {
  return resolve(env.DSH_HOME || join(homedir(), ".dsh"));
}

export function resolveDeepSeePaths(options = {}) {
  const packageRoot = resolve(options.packageRoot || process.cwd());
  const dshHome = resolve(options.dshHome || defaultDshHome(options.env));
  const stateRoot = resolve(options.stateRoot || join(dshHome, "deepsee"));
  const registryFile = resolve(options.registryFile || process.env.OPENDS_MODEL_REGISTRY_FILE || join(stateRoot, ".opends-models.json"));
  return { packageRoot, dshHome, stateRoot, registryFile };
}

export function migrateLegacyState({ packageRoot, stateRoot }) {
  mkdirSync(stateRoot, { recursive: true });
  for (const name of LEGACY_STATE_FILES) {
    const source = join(packageRoot, name);
    const target = join(stateRoot, name);
    if (!existsSync(target) && existsSync(source)) copyFileSync(source, target);
  }
}

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith("#")) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function preserveUserFields(detected, previous) {
  if (!previous || typeof previous !== "object") return detected;
  const userDescription = previous.descriptionSource === "user";
  const incompatibleVisionProfile = detected.source === "cli"
    && detected.visionLevel !== "full-vision"
    && Array.isArray(previous.capabilities)
    && previous.capabilities.includes("vision");
  const verifiedProfile = previous.descriptionSource === "verified"
    && previous.profileStatus === "ready"
    && !incompatibleVisionProfile;
  const preserveProfileStatus = userDescription || verifiedProfile;
  return {
    ...detected,
    enabled: detected.status === "ready" && (previous.status === "unavailable" || previous.enabled !== false),
    ...((userDescription || verifiedProfile) && typeof previous.description === "string"
      ? { description: previous.description, descriptionSource: previous.descriptionSource }
      : {}),
    ...((userDescription || verifiedProfile) && Array.isArray(previous.roles) ? { roles: previous.roles } : {}),
    ...((userDescription || verifiedProfile) && Array.isArray(previous.capabilities) ? { capabilities: previous.capabilities } : {}),
    ...(Array.isArray(previous.weaknesses) && previous.weaknesses.length > 0 ? { weaknesses: previous.weaknesses } : {}),
    ...(typeof previous.displayName === "string" && previous.displayName.trim() ? { displayName: previous.displayName.trim() } : {}),
    ...(detected.source !== "cli" && typeof previous.sourceLabel === "string" && previous.sourceLabel.trim()
      ? { sourceLabel: previous.sourceLabel.trim() }
      : {}),
    ...(preserveProfileStatus && typeof previous.profileStatus === "string" ? { profileStatus: previous.profileStatus } : {}),
    ...((userDescription || verifiedProfile) && typeof previous.profiledAt === "string" ? { profiledAt: previous.profiledAt } : {}),
    ...(preserveProfileStatus && typeof previous.profileError === "string" ? { profileError: previous.profileError } : {}),
  };
}

export async function discoverDeepSeeRuntimes(options = {}) {
  const paths = resolveDeepSeePaths(options);
  const { packageRoot, dshHome, stateRoot, registryFile } = paths;
  migrateLegacyState(paths);
  mkdirSync(dirname(registryFile), { recursive: true });

  const now = new Date().toISOString();
  const existing = readJson(registryFile, { version: 1, routes: [], preferences: {} });
  const oldRoutes = new Map((Array.isArray(existing.routes) ? existing.routes : []).map((route) => [route.id, route]));
  const routes = [];
  const desktopApps = Array.isArray(options.desktopApps)
    ? options.desktopApps
    : discoverDesktopApps({ env: options.env || process.env });

  const settingsPath = join(dshHome, "settings.yaml");
  const settings = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "";
  const bridgeState = readBridgeState(join(stateRoot, ".opends-bridge.json"));
  const selected = readModelSelection(settings);
  const primaryCandidate = selected?.provider === "opends-vision" ? bridgeState.previousModel : selected;
  const primary = primaryCandidate?.provider?.startsWith("deepseek") ? primaryCandidate : DEFAULT_DEEPSEEK_SELECTION;
  if (primary?.provider && primary?.model) {
    const route = {
      id: `harness:${primary.provider}:${primary.model}`,
      source: "harness",
      provider: primary.provider,
      model: primary.model,
      runtimeProvider: primary.provider,
      runtimeModel: primary.model,
      enabled: true,
      status: "ready",
      capabilities: ["text", "reasoning", "tools"],
      weaknesses: ["原生视觉输入"],
      roles: ["primary", "reasoning", "executor"],
      description: "DeepSeek Harness 当前主模型",
      descriptionSource: "declared",
      visionLevel: "none",
      lastCheckedAt: now,
    };
    routes.push(preserveUserFields(route, oldRoutes.get(route.id)));
  }

  // Legacy development installs may still carry one external API in .env.
  // Keep its registry entry during migration; standard installs use Harness'
  // native provider settings and never copy credentials into DeepSee state.
  const envPath = join(packageRoot, ".env");
  const legacyEnv = existsSync(envPath) ? parseEnv(readFileSync(envPath, "utf8")) : {};
  const runtimeEnv = { ...legacyEnv, ...(options.env || process.env) };
  if (runtimeEnv.OPENDS_BRIDGE_MODEL) {
    const vendor = runtimeEnv.OPENDS_BRIDGE_VENDOR || "external";
    const route = {
      id: `api:${vendor}:${runtimeEnv.OPENDS_BRIDGE_MODEL}`,
      source: "api",
      provider: vendor,
      model: runtimeEnv.OPENDS_BRIDGE_MODEL,
      runtimeProvider: "opends-bridge",
      runtimeModel: runtimeEnv.OPENDS_BRIDGE_MODEL,
      enabled: Boolean(runtimeEnv.OPENDS_BRIDGE_API_KEY),
      status: runtimeEnv.OPENDS_BRIDGE_API_KEY ? "ready" : "unavailable",
      capabilities: ["text", "vision", "long-context"],
      weaknesses: ["复杂代码仓库修改", "严格工具执行"],
      roles: ["vision", "document", "review"],
      description: "等待模型自动生成能力画像",
      descriptionSource: "inferred",
      visionLevel: "full-vision",
      profileStatus: runtimeEnv.OPENDS_BRIDGE_API_KEY ? "pending" : "error",
      credentialRef: "env:OPENDS_BRIDGE_API_KEY",
      lastCheckedAt: now,
    };
    routes.push(preserveUserFields(route, oldRoutes.get(route.id)));
  }

  for (const connection of loadConnections(stateRoot)) {
    const route = connectionToRoute(connection);
    if (routes.some((candidate) => candidate.id === route.id)) continue;
    routes.push(preserveUserFields(route, oldRoutes.get(route.id)));
  }

  const runtimeCwd = options.cwd || process.cwd();
  for (const definition of runtimeDefinitions) {
    const desktopApp = desktopApps.find((app) => app.runtimeDefinitionId === definition.id);
    const executable = findExecutable(definition.command, { env: options.env || process.env }) || desktopApp?.runtimeExecutable;
    if (!executable) continue;
    const health = verifyRuntime(definition, executable, { cwd: runtimeCwd });
    const previous = oldRoutes.get(definition.id);
    let cliModels = Array.isArray(definition.cliModels) ? definition.cliModels : [];
    if (health.available && definition.id === "cli:codex") {
      try {
        cliModels = await discoverCodexModels(executable, { cwd: runtimeCwd });
      } catch {
        cliModels = [];
      }
    }
    const selectedCliModel = typeof previous?.cliModel === "string" && cliModels.includes(previous.cliModel)
      ? previous.cliModel
      : "";
    const route = {
      id: definition.id,
      source: "cli",
      provider: definition.provider,
      model: definition.model,
      ...(definition.runtimeProvider ? { runtimeProvider: definition.runtimeProvider } : {}),
      enabled: health.available,
      status: health.available ? "ready" : "unavailable",
      capabilities: definition.capabilities,
      weaknesses: definition.weaknesses || ["能力尚未验证"],
      roles: definition.roles,
      description: definition.description,
      descriptionSource: "inferred",
      ...(desktopApp ? {
        desktopAppId: desktopApp.id,
        sourceLabel: definition.id === "cli:claude-code" ? `${desktopApp.name} + CLI` : desktopApp.name,
      } : {}),
      visionLevel: "none",
      profileStatus: health.available ? "pending" : "error",
      executable,
      ...(cliModels.length > 0 ? { cliModels } : {}),
      ...(selectedCliModel ? { cliModel: selectedCliModel } : {}),
      lastCheckedAt: now,
      ...(health.reason ? { statusReason: health.reason } : {}),
    };
    routes.push(preserveUserFields(route, previous));
  }

  const detectedIds = new Set(routes.map((route) => route.id));
  for (const previous of oldRoutes.values()) {
    if (previous.source === "harness" && !detectedIds.has(previous.id)) {
      routes.push({ ...previous, lastCheckedAt: now });
      detectedIds.add(previous.id);
      continue;
    }
    if (detectedIds.has(previous.id) || previous.descriptionSource !== "user" || previous.source === "ocr") continue;
    routes.push({ ...previous, enabled: false, status: "unavailable", statusReason: "启动验证未发现对应 Runtime。", lastCheckedAt: now });
  }

  const existingPreferences = existing.preferences && typeof existing.preferences === "object" ? existing.preferences : {};
  const defaultPrimary = routes.find((route) => route.enabled !== false && route.status === "ready" && (route.source === "harness" || route.source === "api"));
  const defaultVision = routes.find((route) => route.enabled !== false && route.status === "ready" && route.visionLevel === "full-vision");
  const registry = {
    version: 1,
    routes,
    desktopApps: publicDesktopApps(desktopApps, routes),
    preferences: {
      reviewPolicy: "prefer-different",
      primeAutoWorkflow: true,
      ...existingPreferences,
      ...(existingPreferences.primaryRouteId ? {} : { primaryRouteId: defaultPrimary?.id }),
      ...(existingPreferences.visionRouteId ? {} : { visionRouteId: defaultVision?.id }),
      ...(existingPreferences.visionMode ? {} : { visionMode: "model" }),
      ...(existingPreferences.ocrTool ? {} : { ocrTool: "mineru" }),
    },
  };
  writeFileSync(registryFile, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return registry;
}
