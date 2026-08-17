import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MODEL_CATALOG_FILE = ".deepsee-model-catalog.json";
export const MODEL_CATALOG_URL = "https://models.dev/models.json";
export const MODEL_CATALOG_HOME = "https://models.dev/";

const CACHE_VERSION = 1;
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 2_500;
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const MAX_MODELS = 10_000;
const refreshes = new Map();
const lastErrors = new Map();

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function list(value) {
  return Array.isArray(value)
    ? [...new Set(value.map((item) => text(item).toLowerCase()).filter(Boolean))]
    : [];
}

function boolean(value) {
  return value === true;
}

function finiteInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function normalizeCatalogModel(id, value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const modelId = text(value.id || id).toLowerCase();
  if (!modelId || modelId.length > 240 || !modelId.includes("/")) return undefined;
  const input = list(value.modalities?.input);
  const output = list(value.modalities?.output);
  if (input.length === 0 && output.length === 0) return undefined;
  const context = finiteInteger(value.limit?.context);
  const outputLimit = finiteInteger(value.limit?.output);
  return {
    id: modelId,
    name: text(value.name).slice(0, 160),
    description: text(value.description).slice(0, 500),
    family: text(value.family).slice(0, 120),
    attachment: boolean(value.attachment),
    reasoning: boolean(value.reasoning),
    toolCall: boolean(value.tool_call),
    structuredOutput: boolean(value.structured_output),
    modalities: { input, output },
    limit: {
      ...(context !== undefined ? { context } : {}),
      ...(outputLimit !== undefined ? { output: outputLimit } : {}),
    },
    releaseDate: text(value.release_date).slice(0, 32),
    lastUpdated: text(value.last_updated).slice(0, 32),
  };
}

export function normalizeModelsDevCatalog(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Models.dev 返回的模型目录不是 JSON 对象。");
  }
  const entries = value.models && typeof value.models === "object" && !Array.isArray(value.models)
    ? value.models
    : value;
  const models = {};
  for (const [id, model] of Object.entries(entries).slice(0, MAX_MODELS)) {
    const normalized = normalizeCatalogModel(id, model);
    if (normalized) models[normalized.id] = normalized;
  }
  if (Object.keys(models).length < 10) throw new Error("Models.dev 返回的有效模型数量过少。");
  return models;
}

function cachePath(root) {
  return join(root, MODEL_CATALOG_FILE);
}

export function loadModelCapabilityCatalog(root) {
  const path = cachePath(root);
  if (!existsSync(path)) return undefined;
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    if (value?.version !== CACHE_VERSION || value?.source?.id !== "models.dev") return undefined;
    if (!value.models || typeof value.models !== "object" || Array.isArray(value.models)) return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function fresh(cache, maxAgeMs, now) {
  const fetchedAt = Date.parse(cache?.fetchedAt || "");
  return Number.isFinite(fetchedAt) && now - fetchedAt < maxAgeMs;
}

export function getModelCatalogStatus(root, options = {}) {
  const cache = loadModelCapabilityCatalog(root);
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const modelCount = cache ? Object.keys(cache.models).length : 0;
  const error = lastErrors.get(cachePath(root));
  return {
    source: "Models.dev",
    sourceUrl: MODEL_CATALOG_HOME,
    license: "MIT",
    status: cache ? (fresh(cache, maxAgeMs, now) ? "ready" : "stale") : (error ? "error" : "empty"),
    modelCount,
    fetchedAt: cache?.fetchedAt,
    ...(error ? { message: error } : {}),
  };
}

export async function refreshModelCapabilityCatalog(root, options = {}) {
  const path = cachePath(root);
  const existing = loadModelCapabilityCatalog(root);
  const now = options.now ?? Date.now();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  if (!options.force && fresh(existing, maxAgeMs, now)) return existing;
  if (refreshes.has(path)) return refreshes.get(path);

  const operation = (async () => {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== "function") throw new Error("当前 Node.js 不支持模型目录更新。");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchImpl(MODEL_CATALOG_URL, {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": "DeepSee model capability initializer",
        },
        signal: controller.signal,
      });
      if (!response?.ok) throw new Error(`Models.dev 请求失败（HTTP ${String(response?.status || "unknown")}）。`);
      const declaredLength = Number(response.headers?.get?.("content-length") || 0);
      if (declaredLength > MAX_RESPONSE_BYTES) throw new Error("Models.dev 模型目录超过安全大小限制。");
      const body = await response.text();
      if (Buffer.byteLength(body, "utf8") > MAX_RESPONSE_BYTES) throw new Error("Models.dev 模型目录超过安全大小限制。");
      const models = normalizeModelsDevCatalog(JSON.parse(body));
      const cache = {
        version: CACHE_VERSION,
        source: {
          id: "models.dev",
          name: "Models.dev",
          url: MODEL_CATALOG_HOME,
          dataUrl: MODEL_CATALOG_URL,
          license: "MIT",
        },
        fetchedAt: new Date(now).toISOString(),
        models,
      };
      writeFileSync(path, `${JSON.stringify(cache)}\n`, "utf8");
      lastErrors.delete(path);
      return cache;
    } catch (error) {
      const message = error instanceof Error && error.name === "AbortError"
        ? "Models.dev 更新超时；继续使用本地能力信息。"
        : (error instanceof Error ? error.message : String(error));
      lastErrors.set(path, message);
      if (existing) return existing;
      throw new Error(message);
    } finally {
      clearTimeout(timer);
    }
  })();
  refreshes.set(path, operation);
  try {
    return await operation;
  } finally {
    refreshes.delete(path);
  }
}

function modelToken(value) {
  return text(value)
    .toLowerCase()
    .replace(/^models\//, "")
    .replace(/:(?:free|thinking|extended|online)$/i, "")
    .replace(/[^a-z0-9]+/g, "");
}

function providerCandidates(provider, model) {
  const combined = `${text(provider)} ${text(model)}`.toLowerCase();
  const candidates = [];
  if (/openai|gpt|codex/.test(combined)) candidates.push("openai");
  if (/anthropic|claude/.test(combined)) candidates.push("anthropic");
  if (/google|gemini/.test(combined)) candidates.push("google");
  if (/deepseek/.test(combined)) candidates.push("deepseek");
  if (/moonshot|kimi/.test(combined)) candidates.push("moonshotai");
  if (/alibaba|dashscope|qwen/.test(combined)) candidates.push("alibaba");
  if (/bytedance|volcengine|doubao/.test(combined)) candidates.push("bytedance");
  if (/mistral/.test(combined)) candidates.push("mistral");
  if (/xai|grok/.test(combined)) candidates.push("xai");
  if (/cohere|command-r/.test(combined)) candidates.push("cohere");
  if (/minimax/.test(combined)) candidates.push("minimax");
  if (/zhipu|bigmodel|glm|zai/.test(combined)) candidates.push("zai");
  return [...new Set(candidates)];
}

function findCatalogModel(catalog, provider, model) {
  const models = catalog?.models;
  if (!models || typeof models !== "object") return undefined;
  const rawModel = text(model).toLowerCase().replace(/^models\//, "").replace(/:(?:free|thinking|extended|online)$/i, "");
  const slash = rawModel.indexOf("/");
  const bareModel = slash >= 0 ? rawModel.slice(slash + 1) : rawModel;
  const explicit = slash >= 0 ? models[rawModel] : undefined;
  if (explicit) return explicit;
  for (const candidate of providerCandidates(provider, rawModel)) {
    const exact = models[`${candidate}/${bareModel}`];
    if (exact) return exact;
  }
  const token = modelToken(bareModel);
  if (!token) return undefined;
  const matches = Object.values(models).filter((entry) => modelToken(entry.id.split("/").slice(1).join("/")) === token);
  return matches.length === 1 ? matches[0] : undefined;
}

function catalogCapabilities(model) {
  const input = new Set(list(model?.modalities?.input));
  const output = new Set(list(model?.modalities?.output));
  const description = text(model?.description).toLowerCase();
  const capabilities = [];
  if (input.has("text") || output.has("text")) capabilities.push("text");
  if (input.has("image") && output.has("text")) capabilities.push("vision");
  if (input.has("audio")) capabilities.push("audio-input");
  if (input.has("video")) capabilities.push("video-input");
  if (input.has("pdf")) capabilities.push("document");
  if (output.has("image")) capabilities.push("image-generation");
  if (output.has("audio")) capabilities.push("audio-generation");
  if (output.has("video")) capabilities.push("video-generation");
  if (model?.reasoning) capabilities.push("reasoning");
  if (model?.toolCall) capabilities.push("tools");
  if (model?.structuredOutput) capabilities.push("structured-output");
  if ((model?.limit?.context || 0) >= 100_000) capabilities.push("long-context");
  if (/\b(code|coding|programming|software|developer)\b|代码|编程|开发/.test(description)) capabilities.push("coding");
  if (/\bocr\b|optical character|文字识别|文档识别/.test(description)) capabilities.push("ocr", "document");
  if (/image edit|editing|视觉设计|图像编辑/.test(description) && output.has("image")) capabilities.push("image-editing");
  if (/\b(search|retrieval|research)\b|检索|搜索/.test(description)) capabilities.push("search");
  if (/\brerank/.test(description)) capabilities.push("reranking");
  if (/\bembedding/.test(description)) capabilities.push("embedding");
  if (/\btranslat|翻译/.test(description)) capabilities.push("translation");
  if (/\bwriting|content creation|copywriting\b|写作|文案/.test(description)) capabilities.push("writing");
  return [...new Set(capabilities)];
}

function rolesForCapabilities(capabilities) {
  return [...new Set([
    "executor",
    ...(capabilities.includes("reasoning") ? ["reasoning", "review"] : []),
    ...(capabilities.includes("coding") ? ["coding"] : []),
    ...(capabilities.includes("vision") ? ["vision", "document"] : []),
    ...(capabilities.includes("image-generation") ? ["image-generation", "design"] : []),
    ...(capabilities.includes("writing") ? ["writing"] : []),
    ...(capabilities.includes("ocr") ? ["document"] : []),
  ])];
}

export function modelCapabilityDefaults(root, provider, model) {
  const catalog = loadModelCapabilityCatalog(root);
  const match = findCatalogModel(catalog, provider, model);
  if (!match) return undefined;
  const capabilities = catalogCapabilities(match);
  return {
    catalogModelId: match.id,
    catalogSource: "models.dev",
    catalogSourceUrl: MODEL_CATALOG_HOME,
    catalogUpdatedAt: text(match.lastUpdated) || catalog.fetchedAt,
    capabilities,
    roles: rolesForCapabilities(capabilities),
    description: text(match.description),
    inputModalities: list(match.modalities?.input),
    outputModalities: list(match.modalities?.output),
    visionLevel: capabilities.includes("vision") ? "full-vision" : "none",
  };
}
