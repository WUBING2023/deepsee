import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const CONNECTIONS_FILE = ".opends-connections.json";

const SECRET_FIELDS = new Set([
  "apikey",
  "api_key",
  "token",
  "secret",
  "password",
  "authorization",
]);

function hasSecretMaterial(value) {
  if (!value || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => (
    SECRET_FIELDS.has(key.toLowerCase()) || hasSecretMaterial(nested)
  ));
}

function publicMetadata(value) {
  if (!value || typeof value !== "object") return undefined;
  const metadata = {
    provider: String(value.provider || "").trim(),
    model: String(value.model || "").trim(),
    baseURL: String(value.baseURL || "").trim(),
  };
  return metadata.provider || metadata.model || metadata.baseURL ? metadata : undefined;
}

function atomicJson(path, value) {
  const temporary = `${path}.deepsee-migration`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, path);
}

function unsafeLegacyRoute(route) {
  return String(route?.runtimeProvider || "").startsWith("opends-api-")
    || String(route?.credentialRef || "").startsWith("env:OPENDS_PROVIDER_")
    || String(route?.id || "").startsWith("api:");
}

function scrubLegacyRegistry(registryFile) {
  if (!existsSync(registryFile)) return 0;
  let registry;
  try {
    registry = JSON.parse(readFileSync(registryFile, "utf8"));
  } catch {
    return 0;
  }
  const routes = Array.isArray(registry?.routes) ? registry.routes : [];
  const safeRoutes = routes.filter((route) => !unsafeLegacyRoute(route));
  const removed = routes.length - safeRoutes.length;
  if (removed === 0) return 0;
  const preferences = registry.preferences && typeof registry.preferences === "object"
    ? { ...registry.preferences }
    : {};
  if (!safeRoutes.some((route) => route?.id === preferences.primaryRouteId)) delete preferences.primaryRouteId;
  if (!safeRoutes.some((route) => route?.id === preferences.visionRouteId)) delete preferences.visionRouteId;
  atomicJson(registryFile, { ...registry, routes: safeRoutes, preferences });
  return removed;
}

/**
 * Permanently removes DeepSee's pre-alpha raw-key store. Provider credentials
 * now belong exclusively to DeepSeek Harness and are referenced by route id.
 */
export function migrateLegacyConnections(root, options = {}) {
  const path = join(root, CONNECTIONS_FILE);
  const registryFile = options.registryFile || join(root, ".opends-models.json");
  if (!existsSync(path)) {
    return { found: false, secretsRemoved: 0, routesRemoved: scrubLegacyRegistry(registryFile) };
  }

  let value;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    value = {};
  }
  if (value?.version === 2 && value?.secretMaterialRemoved === true && !hasSecretMaterial(value?.connections)) {
    return { found: true, secretsRemoved: 0, routesRemoved: scrubLegacyRegistry(registryFile), metadataCount: Array.isArray(value.connections) ? value.connections.length : 0 };
  }
  const connections = Array.isArray(value?.connections) ? value.connections : [];
  const metadata = connections.map(publicMetadata).filter(Boolean);
  const secretsRemoved = connections.filter(hasSecretMaterial).length;
  if (options.scrub !== true) {
    return {
      found: true,
      requiresUserAction: secretsRemoved > 0,
      secretsRemoved: 0,
      detectedSecrets: secretsRemoved,
      routesRemoved: 0,
      metadataCount: metadata.length,
    };
  }
  atomicJson(path, {
    version: 2,
    migratedAt: new Date().toISOString(),
    secretMaterialRemoved: true,
    message: "Legacy DeepSee credentials were removed. Reconfigure providers in DeepSeek Harness Settings > Models.",
    connections: metadata,
  });
  return {
    found: true,
    secretsRemoved,
    routesRemoved: scrubLegacyRegistry(registryFile),
    metadataCount: metadata.length,
  };
}

/** Scrubs only the DeepSee-owned legacy key; unrelated environment settings remain intact. */
export function scrubLegacyDotEnv(packageRoot, options = {}) {
  const path = join(packageRoot, ".env");
  if (!existsSync(path)) return { found: false, secretsRemoved: 0 };
  const source = readFileSync(path, "utf8");
  const detectedSecrets = (source.match(/^\s*OPENDS_BRIDGE_API_KEY\s*=\s*\S.+$/gmi) || []).length;
  if (options.scrub !== true) return { found: true, secretsRemoved: 0, detectedSecrets, requiresUserAction: detectedSecrets > 0 };
  let secretsRemoved = 0;
  const next = source.replace(/^(\s*OPENDS_BRIDGE_API_KEY\s*=).*$/gmi, (_line, prefix) => {
    secretsRemoved += 1;
    return `${prefix}`;
  });
  if (next !== source) writeFileSync(path, next, { encoding: "utf8", mode: 0o600 });
  return { found: true, secretsRemoved };
}
