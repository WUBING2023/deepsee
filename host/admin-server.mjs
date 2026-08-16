import {
  addConnection,
  updateRegistryWithConnection,
} from "../scripts/model-connections.mjs";
import {
  applyPreferencesToHarness,
  publicRegistryState,
  syncHarnessModels,
  updateRegistryPreferences,
  updateRegistryRoute,
} from "../scripts/registry-state.mjs";
import { discoverDeepSeeRuntimes, discoverWorkspaceInstructions, resolveDeepSeePaths } from "../scripts/runtime-discovery.mjs";
import { getOCRStatus, getOCRToolsState, startOCRInstall, uninstallOCR } from "../scripts/ocr-manager.mjs";
import {
  checkDeepSeeUpdate,
  getDeepSeeUpdateStatus,
  queueDeepSeeUpdateCheck,
  startDeepSeeUpdate,
} from "../scripts/update-manager.mjs";

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
        instructions: discoverWorkspaceInstructions(options.cwd || process.cwd()),
      },
      tools: {
        ocr: getOCRToolsState(stateRoot),
        mineru: getOCRStatus(stateRoot, "mineru"),
      },
      update: getDeepSeeUpdateStatus(stateRoot, packageRoot),
    };
  };

  return async (req, res) => {
    try {
      if (!requestIsSameOrigin(req)) return send(res, 403, { error: "origin_not_allowed" });
      const path = routePath(req);
      if (req.method === "GET" && path === "/v1/models") {
        if (!options.disableUpdateCheck) {
          void queueDeepSeeUpdateCheck(stateRoot, packageRoot, { fetchImpl: options.updateFetch });
        }
        return send(res, 200, state());
      }
      if (req.method !== "GET" && req.method !== "POST") {
        res.setHeader("allow", "GET, POST");
        return send(res, 405, { error: "method_not_allowed" });
      }
      if (req.method === "POST" && path === "/v1/models") {
        const connection = addConnection(stateRoot, await readJson(req));
        const route = updateRegistryWithConnection(stateRoot, connection);
        const registry = publicRegistryState(stateRoot);
        if (route.visionLevel === "full-vision" && !registry.preferences?.visionRouteId) {
          updateRegistryPreferences(stateRoot, { visionRouteId: route.id });
        }
        return send(res, 201, {
          route,
          state: state(),
          restartRequired: true,
          message: "模型已同步到 DeepSee；重启 Harness 后会加入实际路由。",
        });
      }
      if (req.method === "POST" && path === "/v1/harness/models") {
        const result = syncHarnessModels(stateRoot, await readJson(req));
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
      if (req.method === "POST" && path === "/v1/preferences") {
        const preferences = updateRegistryPreferences(stateRoot, await readJson(req));
        applyPreferencesToHarness(stateRoot, dshHome);
        return send(res, 200, { preferences, state: state(), restartRequired: true });
      }
      if (req.method === "POST" && path === "/v1/runtimes/verify") {
        await readJson(req);
        await discoverDeepSeeRuntimes({ ...paths, cwd: process.cwd() });
        return send(res, 200, { state: state(), message: "已重新验证 Harness、API、桌面应用与本机 CLI。" });
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
