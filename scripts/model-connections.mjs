import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadRegistryState } from "./registry-state.mjs";
import { getMinerUStatus } from "./mineru-manager.mjs";

export const CONNECTIONS_FILE = ".opends-connections.json";

export const providerPresets = Object.freeze({
  kimi: {
    label: "Kimi",
    api: "openai-completions",
    baseURL: "https://api.moonshot.cn/v1",
    model: "kimi-k3",
    weaknesses: ["复杂代码仓库修改", "严格工具执行"],
  },
  openai: {
    label: "OpenAI",
    api: "openai-responses",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-5",
    weaknesses: ["长篇中文内容创作", "低延迟轻量任务"],
  },
  claude: {
    label: "Claude",
    api: "anthropic-messages",
    baseURL: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
    weaknesses: ["低成本批量任务", "中文营销文案"],
  },
  custom: {
    label: "兼容 API",
    api: "openai-completions",
    baseURL: "http://127.0.0.1:8000/v1",
    model: "model-id",
    weaknesses: ["能力尚未验证"],
  },
});

const supportedApis = new Set(["openai-completions", "openai-responses", "anthropic-messages"]);

function list(value) {
  const values = Array.isArray(value) ? value : String(value || "").split(/[,，]/);
  return [...new Set(values.map((item) => String(item).trim().toLowerCase()).filter(Boolean))];
}

function connectionHash(provider, model, baseURL) {
  return createHash("sha256").update(`${provider}\n${model}\n${baseURL}`).digest("hex").slice(0, 10);
}

function validateURL(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("API Base URL 无效。");
  }
  if (!new Set(["http:", "https:"]).has(parsed.protocol)) {
    throw new Error("API Base URL 必须使用 http 或 https。");
  }
  return parsed.toString().replace(/\/$/, "");
}

function normalizeConnection(value) {
  if (!value || typeof value !== "object") return undefined;
  const provider = String(value.provider || "").trim().toLowerCase();
  const model = String(value.model || "").trim();
  const api = String(value.api || "").trim();
  const apiKey = String(value.apiKey || "");
  if (!provider || !model || !supportedApis.has(api)) return undefined;
  let baseURL;
  try {
    baseURL = validateURL(String(value.baseURL || ""));
  } catch {
    return undefined;
  }
  const hash = connectionHash(provider, model, baseURL);
  return {
    id: `connection:${hash}`,
    provider,
    providerLabel: String(value.providerLabel || provider).trim() || provider,
    model,
    displayName: String(value.displayName || model).trim() || model,
    sourceLabel: String(value.sourceLabel || value.providerLabel || provider).trim() || provider,
    api,
    baseURL,
    apiKey,
    runtimeProvider: `opends-api-${hash}`,
    apiKeyEnv: `OPENDS_PROVIDER_${hash.toUpperCase()}_API_KEY`,
    capabilities: list(value.capabilities),
    weaknesses: list(value.weaknesses),
    roles: list(value.roles),
    visionLevel: value.visionLevel === "full-vision" ? "full-vision" : "none",
    enabled: value.enabled !== false,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

export function loadConnections(root) {
  const path = join(root, CONNECTIONS_FILE);
  if (!existsSync(path)) return [];
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return (Array.isArray(value?.connections) ? value.connections : [])
      .map(normalizeConnection)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function saveConnections(root, connections) {
  const path = join(root, CONNECTIONS_FILE);
  writeFileSync(path, `${JSON.stringify({ version: 1, connections }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function addConnection(root, input) {
  const preset = providerPresets[input?.provider] || providerPresets.custom;
  const provider = String(input?.provider || "custom").trim().toLowerCase();
  const model = String(input?.model || preset.model).trim();
  const apiKey = String(input?.apiKey || "").trim();
  const api = String(input?.api || preset.api).trim();
  if (!model) throw new Error("模型 ID 不能为空。");
  if (!supportedApis.has(api)) throw new Error("不支持该 API 协议。");
  if (!apiKey && provider !== "custom") throw new Error("该供应商需要 API Key。");
  const baseURL = validateURL(String(input?.baseURL || preset.baseURL));
  const weaknesses = list(input?.weaknesses);
  const connection = normalizeConnection({
    provider,
    providerLabel: preset.label,
    model,
    displayName: input?.displayName || model,
    sourceLabel: input?.sourceLabel || preset.label,
    api,
    baseURL,
    apiKey: apiKey || "local-no-key",
    capabilities: list(input?.capabilities),
    weaknesses: weaknesses.length > 0 ? weaknesses : preset.weaknesses,
    roles: list(input?.roles),
    visionLevel: input?.visionLevel,
    enabled: input?.enabled !== false,
  });
  if (!connection) throw new Error("模型连接配置无效。");
  const existing = loadConnections(root);
  const duplicate = existing.find((item) => item.provider === connection.provider && item.model === connection.model && item.baseURL === connection.baseURL);
  const next = duplicate
    ? existing.map((item) => item.id === duplicate.id ? { ...connection, createdAt: duplicate.createdAt } : item)
    : [...existing, connection];
  saveConnections(root, next);
  return duplicate ? next.find((item) => item.id === duplicate.id) : connection;
}

export function connectionToRoute(connection) {
  return {
    id: `api:${connection.provider}:${connection.model}`,
    source: "api",
    provider: connection.provider,
    model: connection.model,
    displayName: connection.displayName,
    sourceLabel: connection.sourceLabel,
    runtimeProvider: connection.runtimeProvider,
    runtimeModel: connection.model,
    enabled: connection.enabled !== false,
    status: connection.apiKey ? "ready" : "unavailable",
    capabilities: connection.capabilities,
    weaknesses: connection.weaknesses,
    roles: connection.roles,
    description: "等待模型自动生成能力画像",
    descriptionSource: "inferred",
    visionLevel: connection.visionLevel,
    profileStatus: "pending",
    credentialRef: `env:${connection.apiKeyEnv}`,
    lastCheckedAt: new Date().toISOString(),
  };
}

export function publicConnections(root) {
  return loadConnections(root).map((connection) => connectionToRoute(connection));
}

export function updateRegistryWithConnection(root, connection) {
  const path = join(root, ".opends-models.json");
  let registry = { version: 1, routes: [], preferences: {} };
  if (existsSync(path)) {
    try {
      registry = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      // Replace a malformed local registry with a valid one.
    }
  }
  const route = connectionToRoute(connection);
  const routes = Array.isArray(registry.routes) ? registry.routes : [];
  registry.routes = routes.some((item) => item?.id === route.id)
    ? routes.map((item) => item?.id === route.id ? route : item)
    : [...routes, route];
  registry.version = 1;
  writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return route;
}

export function buildGeneratedPatch(root, env, outputPath) {
  const registry = loadRegistryState(root);
  const mineru = getMinerUStatus(root);
  const useOCR = registry.preferences?.visionMode === "ocr" && mineru.status === "ready";
  const routesById = new Map(registry.routes.map((route) => [route.id, route]));
  const routeEnabled = (id) => !routesById.has(id) || routesById.get(id)?.enabled !== false;
  const providers = [];
  for (const connection of loadConnections(root)) {
    const routeId = `api:${connection.provider}:${connection.model}`;
    if (!routeEnabled(routeId)) continue;
    env[connection.apiKeyEnv] = connection.apiKey;
    providers.push({
      routeId,
      runtimeProvider: connection.runtimeProvider,
      displayName: connection.providerLabel,
      apiKeyEnv: connection.apiKeyEnv,
      api: connection.api,
      baseURL: connection.baseURL,
      model: connection.model,
      vision: connection.visionLevel === "full-vision",
    });
  }
  const preferredVision = registry.preferences?.visionRouteId;
  const vision = providers.find((provider) => provider.routeId === preferredVision && provider.vision)
    || providers.find((provider) => provider.vision);
  const preferredPrimary = registry.routes.find((route) => (
    route.id === registry.preferences?.primaryRouteId
    && route.status === "ready"
    && route.enabled !== false
    && (route.source === "harness" || route.source === "api")
  ));
  const primaryProvider = preferredPrimary?.runtimeProvider || preferredPrimary?.provider || "deepseek-official";
  const codexAdapterReady = registry.routes.some((route) => (
    (route.cliRuntimeId || String(route.id || "").replace(/@\d+$/, "")) === "cli:codex"
    && route.status === "ready"
    && route.enabled !== false
    && route.runtimeProvider === "codex"
  ));
  const quote = (value) => JSON.stringify(String(value));
  const lines = [];
  if (providers.length > 0) {
    lines.push("- id: llm-pi-ai", "  config:", "    providers:");
  }
  for (const provider of providers) {
    lines.push(
      `      ${provider.runtimeProvider}:`,
      `        displayName: ${quote(provider.displayName)}`,
      `        apiKeyEnv: ${provider.apiKeyEnv}`,
      `        api: ${quote(provider.api)}`,
      `        baseURL: ${quote(provider.baseURL)}`,
      "        defaultContextWindow: 262144",
      `        defaultMaxTokens: ${Number(env.OPENDS_BRIDGE_MAX_TOKENS || 4096)}`,
      `        defaultInput: ${provider.vision ? "[text, image]" : "[text]"}`,
      "        models:",
      `          - id: ${quote(provider.model)}`,
      `            name: ${quote(provider.displayName)}`,
      `            input: ${provider.vision ? "[text, image]" : "[text]"}`,
    );
  }
  if (providers.length > 0) lines.push("");
  lines.push(
    "- insert:",
    ...(codexAdapterReady ? [
      "    - id: opends-subagent-codex",
      "      name: '@deepseek-ai/dsh-subagent-codex'",
      "      config: {}",
      "",
    ] : []),
    "    - id: opends-bridge",
    "      name: 'opends-bridge'",
    "      config:",
    "        enabled: true",
    `        provider: ${quote(vision?.runtimeProvider || "")}`,
    `        model: ${quote(vision?.model || "")}`,
    `        maxTokens: ${Number(env.OPENDS_BRIDGE_MAX_TOKENS || 4096)}`,
    `        autoVision: ${(useOCR || Boolean(vision && env[vision.apiKeyEnv])) && env.OPENDS_BRIDGE_AUTO_VISION !== "0"}`,
    `        allowTextTool: ${Boolean(vision && env[vision.apiKeyEnv]) && env.OPENDS_BRIDGE_TEXT_TOOL === "1"}`,
    `        targetProviders: [${quote(primaryProvider)}]`,
    `        visionCacheEntries: ${Number(env.OPENDS_BRIDGE_VISION_CACHE || 128)}`,
    "        visionRoute: opends-vision",
    `        visionMode: ${quote(useOCR ? "ocr" : "model")}`,
    `        ocrExecutable: ${quote(mineru.status === "ready" ? mineru.executable || "" : "")}`,
    `        primaryProvider: ${quote(primaryProvider)}`,
    `        registryFile: ${quote(env.OPENDS_MODEL_REGISTRY_FILE || "")}`,
    "        routeOverrides: []",
    `        primeAutoWorkflow: ${registry.preferences?.primeAutoWorkflow !== false}`,
    "",
  );
  writeFileSync(outputPath, lines.join("\n"), "utf8");
  return outputPath;
}
