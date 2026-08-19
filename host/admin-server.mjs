import { migrateLegacyConnections, scrubLegacyDotEnv } from "../scripts/model-connections.mjs";
import {
  addRegistryCliModel,
  applyPreferencesToHarness,
  publicRegistryState,
  removeRegistryCliModel,
  syncHarnessModels,
  updateRegistryPreferences,
  updateRegistryRoute,
} from "../scripts/registry-state.mjs";
import {
  getModelCatalogStatus,
  refreshModelCapabilityCatalog,
} from "../scripts/model-capability-catalog.mjs";
import { discoverDeepSeeRuntimes, discoverWorkspaceInstructions, resolveDeepSeePaths } from "../scripts/runtime-discovery.mjs";
import { loadGlobalMemory, publicGlobalMemory } from "../scripts/global-memory.mjs";
import { getOCRStatus, getOCRToolsState, startOCRInstall, uninstallOCR } from "../scripts/ocr-manager.mjs";
import { getManagedRuntimesState, startManagedRuntimeInstall } from "../scripts/runtime-manager.mjs";
import {
  checkDeepSeeUpdate,
  getDeepSeeUpdateStatus,
  queueDeepSeeUpdateCheck,
  startDeepSeeUpdate,
} from "../scripts/update-manager.mjs";
import { readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import {
  configureExecutionTrace,
  listExecutionTraces,
  resolveExecutionArtifact,
} from "../scripts/execution-trace.mjs";

export const DEEPSEE_API_PREFIX = "/api/deepsee";

function requestIsSameOrigin(req) {
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (typeof origin !== "string" || !req.headers.host) return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function send(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(body);
}

const ARTIFACT_CONTENT_TYPES = {
  ".avif": "image/avif",
  ".bmp": "image/bmp",
  ".csv": "text/csv; charset=utf-8",
  ".gif": "image/gif",
  ".htm": "text/html; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp",
  ".xml": "application/xml; charset=utf-8",
};

function sendArtifact(res, artifact) {
  const stat = statSync(artifact.path);
  const body = readFileSync(artifact.path);
  res.writeHead(200, {
    "content-type": ARTIFACT_CONTENT_TYPES[extname(artifact.path).toLowerCase()] || "application/octet-stream",
    "content-length": stat.size,
    "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(artifact.name)}`,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
  });
  res.end(body);
}

async function readJson(req) {
  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    throw new Error("请求必须使用 application/json。");
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("请求内容过大。");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new Error("请求不是有效 JSON。");
  }
}

function routePath(req) {
  const url = new URL(req.url || "/", "http://deepsee.local");
  return url.pathname.startsWith(DEEPSEE_API_PREFIX)
    ? url.pathname.slice(DEEPSEE_API_PREFIX.length) || "/"
    : url.pathname;
}

export function createDeepSeeAdminHandler(options = {}) {
  const paths = resolveDeepSeePaths(options);
  const { packageRoot, stateRoot, dshHome } = paths;
  migrateLegacyConnections(stateRoot, { registryFile: paths.registryFile });
  scrubLegacyDotEnv(packageRoot);
  configureExecutionTrace(stateRoot);
  const state = () => {
    const registry = publicRegistryState(stateRoot);
    const selectedVision = registry.routes.find((route) => (
      route.id === registry.preferences?.visionRouteId
      && route.status === "ready"
      && route.enabled !== false
      && route.visionLevel === "full-vision"
    ));
    return {
      ...registry,
      initialization: {
        vision: selectedVision ? { id: selectedVision.id, name: selectedVision.displayName || selectedVision.model } : null,
        localRuntimes: registry.routes
          .filter((route) => route.source === "cli" && route.status === "ready")
          .map((route) => ({
            id: route.id,
            name: route.displayName || route.model,
            cliModels: route.cliModels || [],
            ...(route.desktopAppId ? { desktopAppId: route.desktopAppId } : {}),
          })),
        desktopApps: registry.desktopApps || [],
        instructions: {
          ...discoverWorkspaceInstructions(options.cwd || process.cwd()),
          global: publicGlobalMemory(loadGlobalMemory({
            dshHome,
            env: options.env || process.env,
            ...(options.home ? { home: options.home } : {}),
          })),
        },
      },
      tools: {
        ocr: getOCRToolsState(stateRoot),
        mineru: getOCRStatus(stateRoot, "mineru"),
        runtimes: getManagedRuntimesState(stateRoot, { env: options.env || process.env }),
      },
      update: getDeepSeeUpdateStatus(stateRoot, packageRoot),
      modelCatalog: getModelCatalogStatus(stateRoot),
    };
  };

  return async (req, res) => {
    try {
      if (!requestIsSameOrigin(req)) return send(res, 403, { error: "origin_not_allowed" });
      const path = routePath(req);
      const url = new URL(req.url || "/", "http://deepsee.local");
      if (req.method === "GET" && path === "/v1/traces") {
        const childIds = (url.searchParams.get("children") || "").split(",").map((id) => id.trim()).filter(Boolean).slice(0, 64);
        return send(res, 200, { traces: listExecutionTraces(childIds) });
      }
      const artifactMatch = path.match(/^\/v1\/artifacts\/([^/]+)\/([^/]+)$/);
      if (req.method === "GET" && artifactMatch) {
        const artifact = resolveExecutionArtifact(decodeURIComponent(artifactMatch[1]), decodeURIComponent(artifactMatch[2]));
        if (!artifact) return send(res, 404, { error: "artifact_not_found" });
        return sendArtifact(res, artifact);
      }
      if (req.method === "GET" && path === "/v1/models") {
        if (!options.disableUpdateCheck) {
          void queueDeepSeeUpdateCheck(stateRoot, packageRoot, { fetchImpl: options.updateFetch });
        }
        if (!options.disableCatalogRefresh) {
          void refreshModelCapabilityCatalog(stateRoot, {
            fetchImpl: options.catalogFetch,
            timeoutMs: options.catalogTimeoutMs,
          }).catch(() => undefined);
        }
        return send(res, 200, state());
      }
      if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("allow", "GET, POST");
        return send(res, 405, { error: "method_not_allowed" });
      }
      if (req.method === "POST" && path === "/v1/models") {
        await readJson(req);
        return send(res, 410, {
          error: "native_harness_credentials_required",
          message: "DeepSee 不再接收或保存 API Key。请在 DeepSeek Harness 的“设置 → 模型”中添加供应商，然后返回深见点击验证。",
        });
      }
      if (req.method === "POST" && path === "/v1/harness/models") {
        const input = await readJson(req);
        if (!options.disableCatalogRefresh) {
          await refreshModelCapabilityCatalog(stateRoot, {
            fetchImpl: options.catalogFetch,
            timeoutMs: options.catalogTimeoutMs,
          }).catch(() => undefined);
        }
        const result = syncHarnessModels(stateRoot, input);
        return send(res, 200, {
          ...result,
          message: `已从 Harness 同步 ${result.synced} 个模型；未读取或复制 API Key。`,
          restartRequired: true,
        });
      }
      if (req.method === "POST" && path === "/v1/routes") {
        const route = updateRegistryRoute(stateRoot, await readJson(req));
        return send(res, 200, { route, state: state(), restartRequired: true });
      }
      if (req.method === "POST" && path === "/v1/cli-models") {
        const route = addRegistryCliModel(stateRoot, await readJson(req));
        return send(res, 201, { route, state: state(), restartRequired: true });
      }
      if (req.method === "POST" && path === "/v1/cli-models/remove") {
        const route = removeRegistryCliModel(stateRoot, await readJson(req));
        return send(res, 200, { route, state: state(), restartRequired: true });
      }
      if (req.method === "POST" && path === "/v1/preferences") {
        const input = await readJson(req);
        const preferences = updateRegistryPreferences(stateRoot, input);
        applyPreferencesToHarness(stateRoot, dshHome);
        let selection;
        let liveApplied = false;
        let liveError;
        if (typeof input.primaryRouteId === "string") {
          const route = state().routes.find((item) => item.id === preferences.primaryRouteId);
          if (route && typeof options.syncPrimaryModel === "function") {
            try {
              selection = await options.syncPrimaryModel(route);
              liveApplied = true;
            } catch (error) {
              liveError = error instanceof Error ? error.message : String(error);
            }
          }
        }
        return send(res, 200, {
          preferences,
          state: state(),
          restartRequired: false,
          liveApplied,
          ...(selection ? { selection } : {}),
          ...(liveError ? { liveError } : {}),
        });
      }
      if (req.method === "POST" && path === "/v1/runtimes/verify") {
        await readJson(req);
        await discoverDeepSeeRuntimes({ ...paths, cwd: process.cwd(), forceVisionProbe: true });
        return send(res, 200, { state: state(), message: "已重新验证 Harness、API、桌面应用与本机 CLI。" });
      }
      const runtimeInstall = path.match(/^\/v1\/runtimes\/(gemini)\/install$/);
      if (req.method === "POST" && runtimeInstall) {
        const input = await readJson(req);
        const install = options.runtimeInstall || startManagedRuntimeInstall;
        const runtime = install(stateRoot, runtimeInstall[1], input.installPath, {
          spawnImpl: options.runtimeSpawn,
          workerPath: options.runtimeWorkerPath,
          env: options.env || process.env,
        });
        return send(res, 202, { runtime });
      }
      if (req.method === "POST" && path === "/v1/tools/mineru/install") {
        await readJson(req);
        return send(res, 202, { tool: startOCRInstall(stateRoot, "mineru") });
      }
      if (req.method === "POST" && path === "/v1/tools/mineru/uninstall") {
        await readJson(req);
        return send(res, 200, { tool: uninstallOCR(stateRoot, "mineru") });
      }
      const ocrAction = path.match(/^\/v1\/tools\/ocr\/(mineru|paddleocr|rapidocr)\/(install|uninstall)$/);
      if (req.method === "POST" && ocrAction) {
        await readJson(req);
        const [, id, action] = ocrAction;
        const tool = action === "install" ? startOCRInstall(stateRoot, id) : uninstallOCR(stateRoot, id);
        return send(res, action === "install" ? 202 : 200, { tool });
      }
      if (req.method === "POST" && path === "/v1/update/check") {
        await readJson(req);
        const update = await checkDeepSeeUpdate(stateRoot, packageRoot, { fetchImpl: options.updateFetch });
        return send(res, 200, { update });
      }
      if (req.method === "POST" && path === "/v1/update/install") {
        await readJson(req);
        const update = startDeepSeeUpdate(stateRoot, packageRoot, dshHome, {
          spawnImpl: options.updateSpawn,
          workerPath: options.updateWorkerPath,
        });
        return send(res, 202, { update });
      }
      return send(res, 404, { error: "not_found" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /请求|模型|路线|Runtime|API|供应商|安装|卸载|更新|升级|不存在|无效/.test(message) ? 400 : 500;
      return send(res, status, { error: message });
    }
  };
}

export function installDeepSeeAdminRoute(ctx, options = {}) {
  const webServer = ctx.webServer ?? ctx.get?.("webServer");
  if (!webServer || typeof webServer.register !== "function") return false;
  const handler = createDeepSeeAdminHandler(options);
  ctx.effect(() => webServer.register({
    kind: "prefix",
    path: DEEPSEE_API_PREFIX,
    handler,
  }), "deepsee: same-origin configuration route");
  return true;
}
