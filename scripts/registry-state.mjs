import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readBridgeState, readModelSelection, writeModelSelection } from "./model-selection.mjs";

export const REGISTRY_FILE = ".opends-models.json";

function stringList(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,，]/);
  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function pendingCapabilities(model) {
  const description = text(model?.description).toLowerCase();
  const capabilities = ["text"];
  if (model?.reasoning || /reason|推理/.test(description)) capabilities.push("reasoning");
  if (/vision|image|multimodal|视觉|图像|多模态/.test(description)) capabilities.push("vision");
  return [...new Set(capabilities)];
}

function pendingRoles(capabilities) {
  return [...new Set([
    "executor",
    ...(capabilities.includes("reasoning") ? ["reasoning", "review"] : []),
    ...(capabilities.includes("vision") ? ["vision", "document"] : []),
  ])];
}

export function loadRegistryState(root) {
  const path = join(root, REGISTRY_FILE);
  if (!existsSync(path)) return { version: 1, routes: [], preferences: {} };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return {
      version: 1,
      routes: Array.isArray(value?.routes) ? value.routes : [],
      preferences: value?.preferences && typeof value.preferences === "object" ? value.preferences : {},
    };
  } catch {
    return { version: 1, routes: [], preferences: {} };
  }
}

export function saveRegistryState(root, registry) {
  const path = join(root, REGISTRY_FILE);
  writeFileSync(path, `${JSON.stringify({
    version: 1,
    routes: Array.isArray(registry.routes) ? registry.routes : [],
    preferences: registry.preferences && typeof registry.preferences === "object" ? registry.preferences : {},
  }, null, 2)}\n`, "utf8");
}

export function publicRegistryState(root) {
  const registry = loadRegistryState(root);
  return {
    ...registry,
    routes: registry.routes.map(({ credentialRef: _credentialRef, executable: _executable, ...route }) => route),
  };
}

export function syncHarnessModels(root, input) {
  const registry = loadRegistryState(root);
  const previous = new Map(registry.routes.map((route) => [route?.id, route]));
  const groups = (Array.isArray(input?.groups) ? input.groups : []).slice(0, 32);
  const failures = new Map((Array.isArray(input?.failures) ? input.failures : [])
    .map((failure) => [text(failure?.id), text(failure?.message, "模型目录暂时不可用。")])
    .filter(([id]) => id));
  const now = new Date().toISOString();
  const harnessRoutes = [];

  for (const group of groups) {
    const provider = text(group?.id);
    if (!provider || provider === "opends-vision" || provider === "opends-bridge" || provider.startsWith("opends-api-")) continue;
    const sourceLabel = text(group?.name, provider);
    for (const model of (Array.isArray(group?.models) ? group.models : []).slice(0, 200)) {
      const modelId = text(model?.id);
      if (!modelId) continue;
      const id = `harness:${provider}:${modelId}`;
      const current = previous.get(id);
      const keepProfile = current?.descriptionSource === "user"
        || (current?.descriptionSource === "verified" && current?.profileStatus === "ready");
      const capabilities = keepProfile ? stringList(current.capabilities) : pendingCapabilities(model);
      const route = {
        id,
        source: "harness",
        provider,
        model: modelId,
        displayName: text(model?.name, modelId),
        sourceLabel,
        runtimeProvider: provider,
        runtimeModel: modelId,
        enabled: current?.enabled !== false,
        status: "ready",
        capabilities,
        weaknesses: keepProfile ? stringList(current.weaknesses) : [],
        roles: keepProfile ? stringList(current.roles) : pendingRoles(capabilities),
        description: keepProfile ? text(current.description) : text(model?.description, "正在让模型生成能力画像。"),
        descriptionSource: keepProfile ? current.descriptionSource : "inferred",
        visionLevel: keepProfile
          ? (current.visionLevel === "full-vision" ? "full-vision" : "none")
          : (capabilities.includes("vision") ? "full-vision" : "none"),
        profileStatus: keepProfile
          ? (current.profileStatus || "ready")
          : (current?.profileStatus === "error" && input?.retryProfiles !== true ? "error" : "pending"),
        ...(keepProfile && typeof current.profiledAt === "string" ? { profiledAt: current.profiledAt } : {}),
        ...(current?.profileStatus === "error" && input?.retryProfiles !== true && typeof current.profileError === "string" ? { profileError: current.profileError } : {}),
        lastCheckedAt: now,
      };
      harnessRoutes.push(route);
    }
  }

  for (const [provider, message] of failures) {
    for (const route of previous.values()) {
      if (route?.source !== "harness" || route.provider !== provider || harnessRoutes.some((item) => item.id === route.id)) continue;
      harnessRoutes.push({ ...route, status: "error", enabled: false, statusReason: message, lastCheckedAt: now });
    }
  }

  registry.routes = [
    ...registry.routes.filter((route) => route?.source !== "harness"),
    ...harnessRoutes,
  ];
  saveRegistryState(root, registry);
  return { state: publicRegistryState(root), synced: harnessRoutes.length };
}

export function updateRegistryRoute(root, input) {
  const registry = loadRegistryState(root);
  const index = registry.routes.findIndex((route) => route?.id === input?.id);
  if (index === -1) throw new Error("模型路线不存在；请重新验证 Runtime。");
  const current = registry.routes[index];
  const editsProfile = input.capabilities !== undefined || input.roles !== undefined || typeof input.description === "string";
  if (input.enabled === true && current.status !== "ready") {
    throw new Error(current.statusReason || "该路线未通过启动验证，暂时不能打开。");
  }
  if (current.source === "cli" && typeof input.cliModel === "string" && input.cliModel.trim()) {
    if (!Array.isArray(current.cliModels) || !current.cliModels.includes(input.cliModel.trim())) {
      throw new Error("该 CLI 模型不在启动时验证得到的可选列表中。");
    }
  }
  const next = {
    ...current,
    ...(typeof input.enabled === "boolean" ? { enabled: input.enabled } : {}),
    ...(typeof input.displayName === "string" ? { displayName: input.displayName.trim() || current.model } : {}),
    ...(typeof input.sourceLabel === "string" ? { sourceLabel: input.sourceLabel.trim() || current.source } : {}),
    ...(input.capabilities !== undefined ? { capabilities: stringList(input.capabilities) } : {}),
    ...(input.weaknesses !== undefined ? { weaknesses: stringList(input.weaknesses) } : {}),
    ...(input.roles !== undefined ? { roles: stringList(input.roles) } : {}),
    ...(typeof input.description === "string" ? { description: input.description.trim() } : {}),
    ...(current.source === "cli" && typeof input.cliModel === "string"
      ? (input.cliModel.trim()
        ? { cliModel: input.cliModel.trim() }
        : { cliModel: undefined })
      : {}),
    ...(editsProfile ? { descriptionSource: "user", profileStatus: "ready", profileError: undefined } : {}),
  };
  registry.routes[index] = next;
  saveRegistryState(root, registry);
  return next;
}

function requireReadyRoute(registry, id, predicate, label) {
  const route = registry.routes.find((candidate) => candidate?.id === id);
  if (!route) throw new Error(`${label}不存在，请重新验证 Runtime。`);
  if (route.status !== "ready" || route.enabled === false) {
    throw new Error(route.statusReason || `${label}尚未通过验证或已关闭。`);
  }
  if (!predicate(route)) throw new Error(`${label}类型不符合要求。`);
  return route;
}

export function updateRegistryPreferences(root, input) {
  const registry = loadRegistryState(root);
  const next = { ...registry.preferences };
  if (typeof input?.primaryRouteId === "string") {
    const id = input.primaryRouteId.trim();
    requireReadyRoute(registry, id, (route) => route.source === "harness" || route.source === "api", "主模型");
    next.primaryRouteId = id;
  }
  if (typeof input?.visionRouteId === "string") {
    const id = input.visionRouteId.trim();
    requireReadyRoute(registry, id, (route) => route.visionLevel === "full-vision", "视觉模型");
    next.visionRouteId = id;
  }
  if (input?.visionMode === "model" || input?.visionMode === "ocr") next.visionMode = input.visionMode;
  if (input?.ocrTool === "mineru") next.ocrTool = input.ocrTool;
  if (typeof input?.primeAutoWorkflow === "boolean") next.primeAutoWorkflow = input.primeAutoWorkflow;
  registry.preferences = next;
  saveRegistryState(root, registry);
  return next;
}

export function applyPreferencesToHarness(root, dshHome) {
  const registry = loadRegistryState(root);
  const primary = registry.routes.find((route) => (
    route?.id === registry.preferences?.primaryRouteId
    && route.status === "ready"
    && route.enabled !== false
    && (route.source === "harness" || route.source === "api")
  ));
  if (!primary) return null;
  const settingsPath = join(dshHome, "settings.yaml");
  const statePath = join(root, ".opends-bridge.json");
  const state = readBridgeState(statePath);
  const settingsText = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "";
  const current = readModelSelection(settingsText);
  const target = {
    provider: primary.runtimeProvider || primary.provider,
    model: primary.runtimeModel || primary.model,
    reasoningEffort: current?.reasoningEffort || state.previousModel?.reasoningEffort || "high",
  };
  writeFileSync(settingsPath, writeModelSelection(settingsText, {
    provider: "opends-vision",
    model: target.model,
    reasoningEffort: target.reasoningEffort,
  }), "utf8");
  writeFileSync(statePath, `${JSON.stringify({ ...state, enabled: true, previousModel: target }, null, 2)}\n`, "utf8");
  return target;
}
