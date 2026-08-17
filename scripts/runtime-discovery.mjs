import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_DEEPSEEK_SELECTION, readBridgeState, readModelSelection } from "./model-selection.mjs";
import { findExecutable } from "./runtime-locator.mjs";
import { connectionToRoute, loadConnections } from "./model-connections.mjs";
import { runtimeDefinitions, verifyRuntime, verifyRuntimeVision } from "./runtime-health.mjs";
import { discoverCodexModels } from "./cli-model-catalog.mjs";
import { discoverDesktopApps, publicDesktopApps } from "./desktop-runtime.mjs";
import { getManagedRuntimeExecutable } from "./runtime-manager.mjs";

const LEGACY_STATE_FILES = [
  ".opends-models.json",
  ".opends-connections.json",
  ".opends-bridge.json",
  ".opends-runtime-hub.json",
];
const VISION_PROBE_CACHE_MS = 24 * 60 * 60 * 1000;
const VISION_PROBE_VERSION = 1;

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

function isPlaceholderCapability(value) {
  const normalized = String(value || "").trim().toLowerCase().replaceAll(" ", "");
  return /^(?:能力|任务|擅长|strength|capability|task)[-_]?\d+$/.test(normalized)
    || ["能力", "任务", "擅长能力", "待补充", "未知能力"].includes(normalized);
}

function hasPlaceholderProfile(route) {
  return (Array.isArray(route?.capabilities) && route.capabilities.some(isPlaceholderCapability))
    || /能力\s*\d|任务\s*\d/i.test(String(route?.description || ""));
}

function isVisionCapabilityClaim(value) {
  return /vision|image|visual|multimodal|视觉|图像|图片|识图|看图|扫描|ocr/i.test(String(value || ""));
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
    && !incompatibleVisionProfile
    && !hasPlaceholderProfile(previous);
  const preserveProfileStatus = userDescription || verifiedProfile;
  const previousCapabilities = Array.isArray(previous.capabilities)
    ? previous.capabilities.filter((capability) => detected.visionLevel === "full-vision" || (capability !== "vision" && !isVisionCapabilityClaim(capability)))
    : [];
  const previousRoles = Array.isArray(previous.roles)
    ? previous.roles.filter((role) => !["vision", "document"].includes(role) || detected.visionLevel === "full-vision")
    : [];
  const previousDescription = typeof previous.description === "string"
    ? (detected.visionLevel === "full-vision"
        ? previous.description.trim()
        : previous.description.split(/[、;；\n]/).map((part) => part.trim()).filter((part) => part && !isVisionCapabilityClaim(part)).join("、"))
    : "";
  return {
    ...detected,
    enabled: detected.status === "ready" && (previous.status === "unavailable" || previous.enabled !== false),
    ...((userDescription || verifiedProfile) && previousDescription
      ? { description: previousDescription, descriptionSource: previous.descriptionSource }
      : {}),
    ...((userDescription || verifiedProfile) ? { roles: [...new Set([...(detected.roles || []), ...previousRoles])] } : {}),
    ...((userDescription || verifiedProfile) ? { capabilities: [...new Set([...(detected.capabilities || []), ...previousCapabilities])] } : {}),
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

function cliRuntimeId(route) {
  if (route?.source !== "cli") return "";
  if (typeof route.cliRuntimeId === "string" && route.cliRuntimeId.trim()) return route.cliRuntimeId.trim();
  return String(route.id || "").replace(/@\d+$/, "");
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
    const executable = getManagedRuntimeExecutable(stateRoot, definition.id, { env: options.env || process.env })
      || findExecutable(definition.command, { env: options.env || process.env })
      || desktopApp?.runtimeExecutable;
    if (!executable) continue;
    const health = verifyRuntime(definition, executable, { cwd: runtimeCwd });
    const previousInstances = [...oldRoutes.values()].filter((route) => cliRuntimeId(route) === definition.id);
    const previous = oldRoutes.get(definition.id) || previousInstances[0];
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
      : cliModels[0] || "";
    const visionProbeCache = new Map();
    const resolveVisionHealth = (model, prior) => {
      if (!health.available || definition.visionLevel !== "full-vision") {
        return { available: false, reason: "", probedAt: undefined };
      }
      if (typeof definition.visionProbe !== "function") {
        return { available: true, reason: "", probedAt: undefined };
      }
      const cacheKey = model || definition.model;
      if (visionProbeCache.has(cacheKey)) return visionProbeCache.get(cacheKey);
      const cacheAge = Date.now() - Date.parse(String(prior?.visionProbedAt || ""));
      if (options.forceVisionProbe !== true
        && prior?.visionProbeVersion === VISION_PROBE_VERSION
        && prior?.visionProbeModel === cacheKey
        && prior?.executable === executable
        && Number.isFinite(cacheAge)
        && cacheAge >= 0
        && cacheAge < VISION_PROBE_CACHE_MS) {
        const cached = {
          available: prior.visionProbeReady === true,
          reason: prior.visionProbeReady === true ? "" : (prior.visionStatusReason || "当前账号所选模型没有通过真实图片输入验证。"),
          probedAt: prior.visionProbedAt,
        };
        visionProbeCache.set(cacheKey, cached);
        return cached;
      }
      const probed = {
        ...verifyRuntimeVision(definition, executable, cacheKey, { cwd: runtimeCwd }),
        probedAt: now,
      };
      visionProbeCache.set(cacheKey, probed);
      return probed;
    };
    const visionHealth = resolveVisionHealth(selectedCliModel, previous);
    const visionLevel = visionHealth.available ? definition.visionLevel : "none";
    const inputModalities = Array.isArray(definition.inputModalities)
      ? definition.inputModalities.filter((modality) => modality !== "image" || visionHealth.available)
      : undefined;
    const capabilities = definition.capabilities.filter((capability) => capability !== "vision" || visionHealth.available);
    const route = {
      id: definition.id,
      source: "cli",
      provider: definition.provider,
      model: definition.model,
      ...(definition.runtimeProvider ? { runtimeProvider: definition.runtimeProvider } : {}),
      cliRuntimeId: definition.id,
      enabled: health.available,
      status: health.available ? "ready" : "unavailable",
      capabilities,
      ...(inputModalities ? { inputModalities } : {}),
      ...(Array.isArray(definition.outputModalities) ? { outputModalities: definition.outputModalities } : {}),
      weaknesses: definition.weaknesses || ["能力尚未验证"],
      roles: definition.roles,
      description: definition.description,
      descriptionSource: "inferred",
      ...(definition.sourceLabel ? { sourceLabel: definition.sourceLabel } : {}),
      ...(desktopApp ? {
        desktopAppId: desktopApp.id,
        sourceLabel: definition.id === "cli:claude-code" ? `${desktopApp.name} + CLI` : desktopApp.name,
      } : {}),
      visionLevel,
      profileStatus: health.available ? "pending" : "error",
      executable,
      ...(cliModels.length > 0 ? { cliModels } : {}),
      ...(selectedCliModel ? { cliModel: selectedCliModel } : {}),
      lastCheckedAt: now,
      ...(health.reason ? { statusReason: health.reason } : {}),
      ...(typeof definition.visionProbe === "function" ? {
        visionProbeVersion: VISION_PROBE_VERSION,
        visionProbeModel: selectedCliModel || definition.model,
        visionProbeReady: visionHealth.available,
        visionProbedAt: visionHealth.probedAt,
        ...(visionHealth.reason ? { visionStatusReason: visionHealth.reason } : {}),
      } : {}),
    };
    routes.push(preserveUserFields(route, previous));
    for (const instance of previousInstances) {
      if (!instance || instance.id === definition.id) continue;
      const instanceModel = typeof instance.cliModel === "string" ? instance.cliModel.trim() : "";
      const modelAvailable = instanceModel && (cliModels.length === 0 || cliModels.includes(instanceModel));
      const instanceVision = resolveVisionHealth(instanceModel, instance);
      const instanceVisionLevel = instanceVision.available ? definition.visionLevel : "none";
      const detectedInstance = {
        ...route,
        id: instance.id,
        cliRuntimeId: definition.id,
        ...(instanceModel ? { cliModel: instanceModel } : {}),
        enabled: health.available && modelAvailable && instance.enabled !== false,
        status: health.available && modelAvailable ? "ready" : "unavailable",
        capabilities: definition.capabilities.filter((capability) => capability !== "vision" || instanceVision.available),
        ...(Array.isArray(definition.inputModalities) ? {
          inputModalities: definition.inputModalities.filter((modality) => modality !== "image" || instanceVision.available),
        } : {}),
        visionLevel: instanceVisionLevel,
        ...(typeof definition.visionProbe === "function" ? {
          visionProbeVersion: VISION_PROBE_VERSION,
          visionProbeModel: instanceModel || definition.model,
          visionProbeReady: instanceVision.available,
          visionProbedAt: instanceVision.probedAt,
          ...(instanceVision.reason ? { visionStatusReason: instanceVision.reason } : {}),
        } : {}),
        ...(!modelAvailable ? { statusReason: "该订阅模型已不在当前 Runtime 的可选列表中；可移除后重新添加。" } : {}),
      };
      routes.push(preserveUserFields(detectedInstance, instance));
    }
  }

  const detectedIds = new Set(routes.map((route) => route.id));
  for (const previous of oldRoutes.values()) {
    if (previous.source === "harness" && !detectedIds.has(previous.id)) {
      routes.push(hasPlaceholderProfile(previous)
        ? {
            ...previous,
            capabilities: Array.isArray(previous.capabilities) ? previous.capabilities.filter((value) => !isPlaceholderCapability(value)) : ["text"],
            description: "正在让模型生成能力画像。",
            descriptionSource: "inferred",
            profileStatus: "pending",
            profileError: undefined,
            profiledAt: undefined,
            lastCheckedAt: now,
          }
        : { ...previous, lastCheckedAt: now });
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
