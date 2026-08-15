import { existsSync, readFileSync } from "node:fs";
const SOURCE_VALUES = new Set(["harness", "api", "cli", "ocr"]);
const STATUS_VALUES = new Set(["ready", "installed", "unavailable", "error"]);
const VISION_VALUES = new Set(["none", "ocr-only", "full-vision"]);
const DESCRIPTION_VALUES = new Set(["declared", "verified", "inferred", "user"]);
function stringArray(value) {
    if (!Array.isArray(value))
        return [];
    return [...new Set(value.filter((item) => typeof item === "string" && item.trim().length > 0)
            .map((item) => item.trim().toLowerCase()))];
}
function normalizeRoute(value) {
    if (typeof value !== "object" || value === null)
        return undefined;
    const route = value;
    if (typeof route.id !== "string" || route.id.trim().length === 0
        || typeof route.provider !== "string" || route.provider.trim().length === 0
        || typeof route.model !== "string" || route.model.trim().length === 0
        || !SOURCE_VALUES.has(route.source)
        || !STATUS_VALUES.has(route.status))
        return undefined;
    const visionLevel = VISION_VALUES.has(route.visionLevel)
        ? route.visionLevel
        : "none";
    const descriptionSource = DESCRIPTION_VALUES.has(route.descriptionSource)
        ? route.descriptionSource
        : "inferred";
    return {
        id: route.id.trim(),
        source: route.source,
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
        status: route.status,
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
            ? { profileStatus: route.profileStatus }
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
export function normalizeRegistry(value) {
    if (typeof value !== "object" || value === null)
        return { version: 1, routes: [] };
    const input = value;
    const routes = [];
    const ids = new Set();
    for (const candidate of Array.isArray(input.routes) ? input.routes : []) {
        const route = normalizeRoute(candidate);
        if (!route || ids.has(route.id))
            continue;
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
export function loadRegistryFile(path) {
    if (!path || !existsSync(path))
        return { version: 1, routes: [] };
    try {
        return normalizeRegistry(JSON.parse(readFileSync(path, "utf8")));
    }
    catch {
        return { version: 1, routes: [] };
    }
}
export function queryRoutes(registry, query = {}) {
    const capability = query.capability?.trim().toLowerCase();
    const role = query.role?.trim().toLowerCase();
    return registry.routes.filter((route) => {
        if (!route.enabled)
            return false;
        if (!query.includeUnavailable && route.status !== "ready")
            return false;
        if (capability && !route.capabilities.includes(capability))
            return false;
        if (role && !route.roles.includes(role))
            return false;
        return true;
    });
}
export function defaultRoutes(config) {
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
export function withFallbackRoutes(registry, fallback) {
    const ids = new Set(registry.routes.map((route) => route.id));
    return {
        ...registry,
        routes: [...registry.routes, ...fallback.filter((route) => !ids.has(route.id))],
    };
}
export function applyRouteOverrides(registry, overrides) {
    const byId = new Map(overrides.map((override) => [override.id, override]));
    return {
        ...registry,
        routes: registry.routes.map((route) => {
            const override = byId.get(route.id);
            if (!override)
                return route;
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
