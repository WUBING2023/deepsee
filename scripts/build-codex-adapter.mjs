import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourcePath = join(root, "node_modules", "@deepseek-ai", "dsh-subagent-codex", "lib", "index.js");
const outputPath = join(root, "host", "codex-provider.js");

function replaceRequired(source, search, replacement, label) {
  if (!source.includes(search)) throw new Error(`cannot build DeepSee Codex adapter: ${label} changed in Harness`);
  return source.replace(search, replacement);
}

if (!existsSync(sourcePath)) throw new Error("missing @deepseek-ai/dsh-subagent-codex");
let source = readFileSync(sourcePath, "utf8");
source = `import { existsSync, readFileSync } from "node:fs";\nimport { homedir } from "node:os";\nimport { basename, isAbsolute, join } from "node:path";\n${source}`;
source = replaceRequired(source, "async startThread(cwd, signal) {", "async startThread(cwd, signal, model) {", "startThread signature");
source = replaceRequired(source,
  'this.transport.request("thread/start", {\n\t\t\tcwd,',
  'this.transport.request("thread/start", {\n\t\t\tmodel,\n\t\t\tcwd,',
  "thread/start request");
source = replaceRequired(source,
  "wire.startThread(spec.cwd, request.signal)",
  "wire.startThread(spec.cwd, request.signal, spec.model)",
  "wire start");
source = replaceRequired(source,
  'cwd: resolveChildCwd("subagent-codex", void 0, parentCwd),',
  'cwd: resolveChildCwd("subagent-codex", void 0, parentCwd),\n\t\t\tmodel: request.agentOptions?.model,',
  "model option");
source = replaceRequired(source,
  `function codexAppServerArgv(platform = process.platform) {
\treturn platform === "win32" ? [
\t\t"cmd.exe",
\t\t"/d",
\t\t"/s",
\t\t"/c",
\t\t"codex",
\t\t"app-server",
\t\t"--stdio"
\t] : [
\t\t"codex",
\t\t"app-server",
\t\t"--stdio"
\t];
}`,
  `function resolveDeepSeeCodexExecutable() {
\tconst dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || homedir(), ".dsh");
\tconst registryPath = process.env.OPENDS_MODEL_REGISTRY_FILE || join(dshHome, "deepsee", ".opends-models.json");
\ttry {
\t\tconst registry = JSON.parse(readFileSync(registryPath, "utf8"));
\t\tconst route = Array.isArray(registry.routes) ? registry.routes.find((item) => item?.id === "cli:codex") : undefined;
\t\tconst executable = typeof route?.executable === "string" ? route.executable : "";
\t\tconst name = basename(executable).toLowerCase();
\t\tif (route?.status === "ready" && route?.enabled !== false && isAbsolute(executable) && existsSync(executable) && ["codex", "codex.exe", "codex.cmd"].includes(name)) return executable;
\t} catch {}
\treturn "codex";
}
function codexAppServerArgv(platform = process.platform) {
\tconst command = resolveDeepSeeCodexExecutable();
\tif (platform !== "win32" || (isAbsolute(command) && command.toLowerCase().endsWith(".exe"))) return [command, "app-server", "--stdio"];
\treturn ["cmd.exe", "/d", "/s", "/c", command, "app-server", "--stdio"];
}`,
  "desktop Codex executable resolution");
writeFileSync(outputPath, source, "utf8");
