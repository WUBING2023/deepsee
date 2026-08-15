import { existsSync, readFileSync } from "node:fs";

export type ModelSource = "harness" | "api" | "cli" | "ocr";
export type ModelStatus = "ready" | "installed" | "unavailable" | "error";
export type VisionLevel = "none" | "ocr-only" | "full-vision";
export type DescriptionSource = "declared" | "verified" | "inferred" | "user";

export interface ModelRoute {
  id: string;
  source: ModelSource;
  provider: string;
  model: string;
  /** User-facing model name; never changes the runtime model id. */
  displayName?: string;
  /** User-facing source label; never changes the runtime provider. */
  sourceLabel?: string;
  /** Harness LLM adapter used when this route is selected for a child agent. */
  runtimeProvider?: string;
  /** Harness model id used when it differs from the public registry model name. */
  runtimeModel?: string;
  /** Models exposed by an authenticated local CLI runtime. */
  cliModels?: string[];
  /** User-selected CLI model; absence means the CLI's own default. */
  cliModel?: string;
  enabled: boolean;
  status: ModelStatus;
  capabilities: string[];
  weaknesses: string[];
  roles: string[];
  description: string;
  descriptionSource: DescriptionSource;
  visionLevel: VisionLevel;
  credentialRef?: string;
  executable?: string;
  lastCheckedAt?: string;
  /** Automatic self-description lifecycle for Harness-managed models. */
  profileStatus?: "pending" | "profiling" | "ready" | "error";
  profiledAt?: string;
  profileError?: string;
  /** Short user-facing explanation when startup verification did not pass. */
  statusReason?: string;
}

export interface ModelRegistryPreferences {
  primaryRouteId?: string;
  visionRouteId?: string;
  reviewPolicy?: "prefer-different" | "require-different" | "same-allowed";
  primeAutoWorkflow?: boolean;
  visionMode?: "model" | "ocr";
  ocrTool?: "mineru";
}

export interface ModelRouteOverride {
  id: string;
  enabled: boolean;
  displayName?: string;
  sourceLabel?: string;
  capabilities: string[];
  weaknesses: string[];
  roles: string[];
  description: string;
}

export interface ModelRegistryFile {
  version: 1;
  routes: ModelRoute[];
  preferences?: ModelRegistryPreferences;
}

export interface ModelRouteQuery {
  capability?: string;
  role?: string;
  includeUnavailable?: boolean;
}

const SOURCE_VALUES = new Set<ModelSource>(["harness", "api", "cli", "ocr"]);
const STATUS_VALUES = new Set<ModelStatus>(["ready", "installed", "unavailable", "error"]);
const VISION_VALUES = new Set<VisionLevel>(["none", "ocr-only", "full-vision"]);
const DESCRIPTION_VALUES = new Set<DescriptionSource>(["declared", "verified", "inferred", "user"]);

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim().toLowerCase()))];
}

function normalizeRoute(value: unknown): ModelRoute | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const route = value as Partial<ModelRoute>;
  if (
    typeof route.id !== "string" || route.id.trim().length === 0
    || typeof route.provider !== "string" || route.provider.trim().length === 0
    || typeof route.model !== "string" || route.model.trim().length === 0
    || !SOURCE_VALUES.has(route.source as ModelSource)
    || !STATUS_VALUES.has(route.status as ModelStatus)
  ) return undefined;

  const visionLevel = VISION_VALUES.has(route.visionLevel as VisionLevel)
    ? route.visionLevel as VisionLevel
    : "none";
  const descriptionSource = DESCRIPTION_VALUES.has(route.descriptionSource as DescriptionSource)
    ? route.descriptionSource as DescriptionSource
    : "inferred";

  return {
    id: route.id.trim(),
    source: route.source as ModelSource,
    provider: route.provider.trim(),
    model: route.model.trim(),
    ...(typeof route.displayName === "string" && route.displayName.trim()
      ? { displayName: route.displayName.trim() }
      : {}),
    ...(typeof route.sourceLabel === "string" && route.sourceLabel.trim()
      ? { sourceLabel: route.sourceLabel.trim() }
      : {}),
    ...(typeof route.runtimeProvider === "string" && route.runtimeProvider.trim()
      ? { runtimeProvider: route.runtimeProvider.trim() }
      : {}),
    ...(typeof route.runtimeModel === "string" && route.runtimeModel.trim()
      ? { runtimeModel: route.runtimeModel.trim() }
      : {}),
    ...(stringArray(route.cliModels).length > 0 ? { cliModels: stringArray(route.cliModels) } : {}),
    ...(typeof route.cliModel === "string" && route.cliModel.trim()
      ? { cliModel: route.cliModel.trim().toLowerCase() }
      : {}),
    enabled: route.enabled !== false,
    status: route.status as ModelStatus,
    capabilities: stringArray(route.capabilities),
    weaknesses: stringArray(route.weaknesses),
    roles: stringArray(route.roles),
    description: typeof route.description === "string" ? route.description.trim() : "",
    descriptionSource,
    visionLevel,
    ...(typeof route.credentialRef === "string" && route.credentialRef.trim()
      ? { credentialRef: route.credentialRef.trim() }
      : {}),
    ...(typeof route.executable === "string" && route.executable.trim()
      ? { executable: route.executable.trim() }
      : {}),
    ...(typeof route.lastCheckedAt === "string" && route.lastCheckedAt.trim()
      ? { lastCheckedAt: route.lastCheckedAt.trim() }
      : {}),
    ...(new Set(["pending", "profiling", "ready", "error"]).has(route.profileStatus || "")
      ? { profileStatus: route.profileStatus as ModelRoute["profileStatus"] }
      : {}),
    ...(typeof route.profiledAt === "string" && route.profiledAt.trim()
      ? { profiledAt: route.profiledAt.trim() }
      : {}),
    ...(typeof route.profileError === "string" && route.profileError.trim()
      ? { profileError: route.profileError.trim() }
      : {}),
    ...(typeof route.statusReason === "string" && route.statusReason.trim()
      ? { statusReason: route.statusReason.trim() }
      : {}),
  };
}

export function normalizeRegistry(value: unknown): ModelRegistryFile {
  if (typeof value !== "object" || value === null) return { version: 1, routes: [] };
  const input = value as Partial<ModelRegistryFile>;
  const routes: ModelRoute[] = [];
  const ids = new Set<string>();
  for (const candidate of Array.isArray(input.routes) ? input.routes : []) {
    const route = normalizeRoute(candidate);
    if (!route || ids.has(route.id)) continue;
    ids.add(route.id);
    routes.push(route);
  }
  return {
    version: 1,
    routes,
    ...(typeof input.preferences === "object" && input.preferences !== null
      ? { preferences: { ...input.preferences } }
      : {}),
  };
}

export function loadRegistryFile(path: string): ModelRegistryFile {
  if (!path || !existsSync(path)) return { version: 1, routes: [] };
  try {
    return normalizeRegistry(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { version: 1, routes: [] };
  }
}

export function queryRoutes(registry: ModelRegistryFile, query: ModelRouteQuery = {}): ModelRoute[] {
  const capability = query.capability?.trim().toLowerCase();
  const role = query.role?.trim().toLowerCase();
  return registry.routes.filter((route) => {
    if (!route.enabled) return false;
    if (!query.includeUnavailable && route.status !== "ready") return false;
    if (capability && !route.capabilities.includes(capability)) return false;
    if (role && !route.roles.includes(role)) return false;
    return true;
  });
}

export function defaultRoutes(config: {
  provider: string;
  model: string;
  primaryProvider: string;
}): ModelRoute[] {
  return [
    {
      id: `${config.primaryProvider}:default`,
      source: "harness",
      provider: config.primaryProvider,
      model: "default",
      enabled: true,
      status: "ready",
      capabilities: ["text", "reasoning", "tools"],
      weaknesses: ["原生视觉输入"],
      roles: ["primary", "reasoning", "executor"],
      description: "Harness 当前主模型路线",
      descriptionSource: "declared",
      visionLevel: "none",
    },
    {
      id: `${config.provider}:${config.model}`,
      source: "api",
      provider: config.provider,
      model: config.model,
      enabled: true,
      status: "ready",
      capabilities: ["text", "vision"],
      weaknesses: ["复杂代码仓库修改", "严格工具执行"],
      roles: ["vision", "document", "review"],
      description: "DeepSee 已配置的视觉 API",
      descriptionSource: "verified",
      visionLevel: "full-vision",
      credentialRef: "env:OPENDS_BRIDGE_API_KEY",
    },
  ];
}

export function withFallbackRoutes(registry: ModelRegistryFile, fallback: ModelRoute[]): ModelRegistryFile {
  const ids = new Set(registry.routes.map((route) => route.id));
  return {
    ...registry,
    routes: [...registry.routes, ...fallback.filter((route) => !ids.has(route.id))],
  };
}

export function applyRouteOverrides(
  registry: ModelRegistryFile,
  overrides: readonly ModelRouteOverride[],
): ModelRegistryFile {
  const byId = new Map(overrides.map((override) => [override.id, override]));
  return {
    ...registry,
    routes: registry.routes.map((route) => {
      const override = byId.get(route.id);
      if (!override) return route;
      return {
        ...route,
        enabled: override.enabled,
        ...(override.displayName?.trim() ? { displayName: override.displayName.trim() } : {}),
        ...(override.sourceLabel?.trim() ? { sourceLabel: override.sourceLabel.trim() } : {}),
        capabilities: stringArray(override.capabilities),
        weaknesses: stringArray(override.weaknesses),
        roles: stringArray(override.roles),
        description: override.description.trim(),
        descriptionSource: "user",
      };
    }),
  };
}
