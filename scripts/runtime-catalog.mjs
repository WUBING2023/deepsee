import { homedir } from "node:os";
import { join } from "node:path";

export const MANAGED_RUNTIME_IDS = Object.freeze(["gemini"]);

const catalog = Object.freeze([
  Object.freeze({
    id: "gemini",
    routeId: "cli:gemini",
    label: "Gemini CLI",
    vendor: "Google",
    command: "gemini",
    packageSpec: "@google/gemini-cli@latest",
    minimumNodeMajor: 20,
    bestFor: "代码、推理与 Google 生态任务",
    installHint: "优先使用 npm 安装官方稳定版；失败时下载 GitHub Release 的官方单文件 bundle。",
    authHint: "安装后首次使用可能需要在终端运行 gemini auth login。",
    docsUrl: "https://geminicli.com/docs/get-started/installation/",
  }),
]);

export function getManagedRuntimeDefinition(id) {
  const definition = catalog.find((item) => item.id === id);
  if (!definition) throw new Error(`不存在的 Runtime：${String(id || "")}`);
  return definition;
}

export function defaultManagedRuntimeRoot(id, env = process.env, platform = process.platform) {
  getManagedRuntimeDefinition(id);
  const base = platform === "win32"
    ? join(env.LOCALAPPDATA || join(homedir(), "AppData", "Local"), "DeepSee", "Runtimes")
    : join(env.XDG_DATA_HOME || join(homedir(), ".local", "share"), "deepsee", "runtimes");
  return join(base, id);
}

export function publicManagedRuntimeCatalog(env = process.env, platform = process.platform) {
  return catalog.map((definition) => ({
    id: definition.id,
    routeId: definition.routeId,
    label: definition.label,
    vendor: definition.vendor,
    bestFor: definition.bestFor,
    installHint: definition.installHint,
    authHint: definition.authHint,
    docsUrl: definition.docsUrl,
    defaultInstallPath: defaultManagedRuntimeRoot(definition.id, env, platform),
  }));
}
