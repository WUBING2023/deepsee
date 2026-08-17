import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { modelCapabilityDefaults } from "./model-capability-catalog.mjs";
import { readBridgeState, readModelSelection, writeModelSelection } from "./model-selection.mjs";

export const REGISTRY_FILE = ".opends-models.json";

function stringList(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,，]/);
  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
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

function modalityList(model, direction) {
  const candidates = direction === "input"
    ? [model?.inputModalities, model?.input_modalities, model?.modalities?.input]
    : [model?.outputModalities, model?.output_modalities, model?.modalities?.output];
  const value = candidates.find(Array.isArray);
  return Array.isArray(value) ? stringList(value) : undefined;
}

function pendingCapabilities(model, defaults) {
  const description = text(model?.description).toLowerCase();
  const inputModalities = modalityList(model, "input");
  const outputModalities = modalityList(model, "output");
  const capabilities = [...(defaults?.capabilities || []), "text"];
  if (model?.reasoning || /reason|推理/.test(description)) capabilities.push("reasoning");
  if (model?.toolCall || model?.tool_call || model?.supportsTools || model?.supports_tools) capabilities.push("tools");
  if (inputModalities?.includes("image")) capabilities.push("vision");
  if (outputModalities?.includes("image")) capabilities.push("image-generation");
  if (inputModalities?.includes("audio")) capabilities.push("audio-input");
  if (inputModalities?.includes("video")) capabilities.push("video-input");
  if (outputModalities?.includes("audio")) capabilities.push("audio-generation");
  if (outputModalities?.includes("video")) capabilities.push("video-generation");
  if (!inputModalities && /vision|image understanding|multimodal|视觉|图像理解|多模态/.test(description)) capabilities.push("vision");
  if (!outputModalities && /image generation|text.to.image|图像生成|生图/.test(description)) capabilities.push("image-generation");
  const normalized = [...new Set(capabilities)];
  if (inputModalities && !inputModalities.includes("image")) {
    return normalized.filter((capability) => capability !== "vision");
  }
  if (outputModalities && !outputModalities.includes("image")) {
    return normalized.filter((capability) => capability !== "image-generation");
  }
  return normalized;
}

function pendingRoles(capabilities, outputModalities) {
  const textOutput = !Array.isArray(outputModalities)
    || outputModalities.length === 0
    || outputModalities.includes("text");
  return [...new Set([
    ...(textOutput ? ["executor"] : []),
    ...(capabilities.includes("reasoning") ? ["reasoning", "review"] : []),
    ...(capabilities.includes("coding") ? ["coding"] : []),
    ...(capabilities.includes("vision") ? ["vision", "document"] : []),
    ...(capabilities.includes("image-generation") ? ["image-generation", "design"] : []),
    ...(capabilities.includes("writing") ? ["writing"] : []),
  ])];
}

function supportsTextOutput(route) {
  if (!route) return false;
  return !Array.isArray(route.outputModalities)
    || route.outputModalities.length === 0
    || route.outputModalities.includes("text");
}

function cliRuntimeId(route) {
  if (route?.source !== "cli") return "";
  return text(route.cliRuntimeId, text(route.id).replace(/@\d+$/, ""));
}

export function loadRegistryState(root) {
  const path = join(root, REGISTRY_FILE);
  if (!existsSync(path)) return { version: 1, routes: [], desktopApps: [], preferences: {} };
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return {
      version: 1,
      routes: Array.isArray(value?.routes) ? value.routes : [],
      desktopApps: Array.isArray(value?.desktopApps) ? value.desktopApps : [],
      preferences: value?.preferences && typeof value.preferences === "object" ? value.preferences : {},
    };
  } catch {
    return { version: 1, routes: [], desktopApps: [], preferences: {} };
  }
}

export function saveRegistryState(root, registry) {
  const path = join(root, REGISTRY_FILE);
  writeFileSync(path, `${JSON.stringify({
    version: 1,
    routes: Array.isArray(registry.routes) ? registry.routes : [],
    desktopApps: Array.isArray(registry.desktopApps) ? registry.desktopApps : [],
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
    if (!provider || provider === "opends-vision" || provider === "opends-bridge" || provider.startsWith("opends-api-") || provider.startsWith("deepsee-cli-")) continue;
    const sourceLabel = text(group?.name, provider);
    for (const model of (Array.isArray(group?.models) ? group.models : []).slice(0, 200)) {
      const modelId = text(model?.id);
      if (!modelId) continue;
      const id = `harness:${provider}:${modelId}`;
      const current = previous.get(id);
      const userProfile = current?.descriptionSource === "user";
      const verifiedProfile = current?.descriptionSource === "verified"
        && current?.profileStatus === "ready"
        && !hasPlaceholderProfile(current);
      const keepProfile = userProfile || verifiedProfile;
      const defaults = modelCapabilityDefaults(root, provider, modelId);
      const inputModalities = modalityList(model, "input") || defaults?.inputModalities;
      const outputModalities = modalityList(model, "output") || defaults?.outputModalities;
      const inferredCapabilities = pendingCapabilities(model, defaults);
      const capabilities = userProfile
        ? stringList(current.capabilities)
        : (verifiedProfile
          ? [...new Set([...stringList(current.capabilities), ...inferredCapabilities])]
          : inferredCapabilities);
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
        ...(inputModalities ? { inputModalities } : {}),
        ...(outputModalities ? { outputModalities } : {}),
        capabilities,
        weaknesses: keepProfile ? stringList(current.weaknesses) : [],
        roles: userProfile
          ? stringList(current.roles)
          : (verifiedProfile
            ? [...new Set([...stringList(current.roles), ...pendingRoles(capabilities, outputModalities)])]
            : pendingRoles(capabilities, outputModalities)),
        description: keepProfile
          ? text(current.description)
          : text(model?.description, defaults?.description || "正在让模型生成能力画像。"),
        descriptionSource: keepProfile ? current.descriptionSource : "inferred",
        visionLevel: userProfile
          ? (current.visionLevel === "full-vision" ? "full-vision" : "none")
          : (capabilities.includes("vision") ? "full-vision" : "none"),
        profileStatus: keepProfile
          ? (current.profileStatus || "ready")
          : (supportsTextOutput({ outputModalities })
            ? (current?.profileStatus === "error" && input?.retryProfiles !== true ? "error" : "pending")
            : "ready"),
        ...(keepProfile && typeof current.profiledAt === "string" ? { profiledAt: current.profiledAt } : {}),
        ...(defaults ? {
          catalogModelId: defaults.catalogModelId,
          catalogSource: defaults.catalogSource,
          catalogSourceUrl: defaults.catalogSourceUrl,
          catalogUpdatedAt: defaults.catalogUpdatedAt,
        } : {}),
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
  const ready = (id) => registry.routes.find((route) => (
    route?.id === id && route.status === "ready" && route.enabled !== false
  ));
  if (!supportsTextOutput(ready(registry.preferences?.primaryRouteId))) {
    const primary = registry.routes.find((route) => (
      route?.status === "ready"
      && route.enabled !== false
      && (route.source === "harness" || route.source === "api")
      && supportsTextOutput(route)
    ));
    if (primary) registry.preferences.primaryRouteId = primary.id;
  }
  if (ready(registry.preferences?.visionRouteId)?.visionLevel !== "full-vision") {
    const vision = registry.routes.find((route) => (
      route?.status === "ready" && route.enabled !== false && route.visionLevel === "full-vision"
    ));
    if (vision) {
      registry.preferences.visionRouteId = vision.id;
      registry.preferences.visionMode = "model";
    }
  }
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
    const nextModel = input.cliModel.trim();
    if (!Array.isArray(current.cliModels) || !current.cliModels.includes(nextModel)) {
      throw new Error("该 CLI 模型不在启动时验证得到的可选列表中。");
    }
    const runtimeId = cliRuntimeId(current);
    if (registry.routes.some((route) => (
      route?.id !== current.id && cliRuntimeId(route) === runtimeId && route.cliModel === nextModel
    ))) {
      throw new Error("该订阅模型已经添加，不能重复使用同一个模型。");
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
        ? { cliModel: input.cliModel.trim(), status: "ready", statusReason: undefined }
        : { cliModel: undefined })
      : {}),
    ...(editsProfile ? { descriptionSource: "user", profileStatus: "ready", profileError: undefined } : {}),
  };
  registry.routes[index] = next;
  saveRegistryState(root, registry);
  return next;
}

export function addRegistryCliModel(root, input) {
  const registry = loadRegistryState(root);
  const requestedRuntimeId = text(input?.runtimeRouteId);
  const runtimeRoutes = registry.routes.filter((route) => cliRuntimeId(route) === requestedRuntimeId);
  const base = runtimeRoutes.find((route) => route.id === requestedRuntimeId) || runtimeRoutes[0];
  if (!base || base.source !== "cli") throw new Error("订阅 Runtime 不存在；请重新验证后再添加模型。");
  if (base.status !== "ready") throw new Error(base.statusReason || "订阅 Runtime 尚未通过验证。");
  const model = text(input?.model);
  if (!model || !Array.isArray(base.cliModels) || !base.cliModels.includes(model)) {
    throw new Error("该模型不在订阅 Runtime 验证得到的可选列表中。");
  }
  if (runtimeRoutes.some((route) => route.cliModel === model)) {
    throw new Error("该订阅模型已经添加。");
  }
  const ids = new Set(registry.routes.map((route) => route?.id));
  let sequence = 2;
  while (ids.has(`${requestedRuntimeId}@${sequence}`)) sequence += 1;
  const route = {
    ...base,
    id: `${requestedRuntimeId}@${sequence}`,
    cliRuntimeId: requestedRuntimeId,
    cliModel: model,
    enabled: true,
    status: "ready",
    statusReason: undefined,
    lastCheckedAt: new Date().toISOString(),
  };
  registry.routes.push(route);
  saveRegistryState(root, registry);
  return route;
}

export function removeRegistryCliModel(root, input) {
  const registry = loadRegistryState(root);
  const id = text(input?.id);
  const index = registry.routes.findIndex((route) => route?.id === id);
  if (index === -1) throw new Error("订阅模型不存在；请重新验证 Runtime。");
  const route = registry.routes[index];
  if (route.source !== "cli") throw new Error("只有订阅 Runtime 模型可以在这里移除。");
  const runtimeId = cliRuntimeId(route);
  const siblings = registry.routes.filter((candidate) => cliRuntimeId(candidate) === runtimeId);
  if (id === runtimeId || siblings.length <= 1) {
    throw new Error("初始模型必须保留；可以更换它，或先添加其他模型。");
  }
  registry.routes.splice(index, 1);
  if (registry.preferences?.primaryRouteId === id) {
    const fallback = siblings.find((candidate) => candidate.id !== id && candidate.status === "ready" && candidate.enabled !== false)
      || siblings.find((candidate) => candidate.id !== id);
    registry.preferences.primaryRouteId = fallback?.id;
  }
  saveRegistryState(root, registry);
  return route;
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

export function cliRuntimeProviderId(routeId) {
  const slug = String(routeId || "")
    .replace(/^cli:/i, "")
    .replace(/@\d+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug) throw new Error(`CLI 路线 ${routeId} 无法生成 Harness provider id。`);
  return `deepsee-cli-${slug}`;
}

export function updateRegistryPreferences(root, input) {
  const registry = loadRegistryState(root);
  const next = { ...registry.preferences };
  if (typeof input?.primaryRouteId === "string") {
    const id = input.primaryRouteId.trim();
    requireReadyRoute(registry, id, (route) => (
      (route.source === "harness" || route.source === "api" || route.source === "cli") && supportsTextOutput(route)
    ), "主模型");
    next.primaryRouteId = id;
  }
  if (typeof input?.visionRouteId === "string") {
    const id = input.visionRouteId.trim();
    requireReadyRoute(registry, id, (route) => route.visionLevel === "full-vision", "视觉模型");
    next.visionRouteId = id;
  }
  if (input?.visionMode === "model" || input?.visionMode === "ocr") next.visionMode = input.visionMode;
  if (["mineru", "paddleocr", "rapidocr"].includes(input?.ocrTool)) next.ocrTool = input.ocrTool;
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
    && (route.source === "harness" || route.source === "api" || route.source === "cli")
    && supportsTextOutput(route)
  ));
  if (!primary) return null;
  const settingsPath = join(dshHome, "settings.yaml");
  const statePath = join(root, ".opends-bridge.json");
  const state = readBridgeState(statePath);
  const settingsText = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "";
  const current = readModelSelection(settingsText);
  const target = {
    provider: primary.source === "cli" ? cliRuntimeProviderId(primary.id) : primary.runtimeProvider || primary.provider,
    model: primary.source === "cli"
      ? primary.cliModel || primary.cliModels?.[0] || primary.model
      : primary.runtimeModel || primary.model,
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
