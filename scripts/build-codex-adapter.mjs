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
  'this.transport.request("thread/start", {\n\t\t\tmodel,\n\t\t\tcwd,\n\t\t\tapprovalPolicy: "never",\n\t\t\tsandbox: "workspace-write",\n\t\t\tconfig: {\n\t\t\t\tsandbox_workspace_write: {\n\t\t\t\t\tnetwork_access: false,\n\t\t\t\t\texclude_tmpdir_env_var: true,\n\t\t\t\t\texclude_slash_tmp: true,\n\t\t\t\t\twritable_roots: []\n\t\t\t\t}\n\t\t\t},',
  "thread/start request");
source = replaceRequired(source,
  "wire.startThread(spec.cwd, request.signal)",
  "wire.startThread(spec.cwd, request.signal, spec.model)",
  "wire start");
source = replaceRequired(source,
  "async runTurn(texts, signal) {",
  "async runTurn(inputs, signal) {",
  "runTurn image-capable signature");
source = replaceRequired(source,
  `input: texts.map((text) => ({
\t\t\t\ttype: "text",
\t\t\t\ttext,
\t\t\t\ttext_elements: []
\t\t\t}))`,
  "input: inputs",
  "turn/start image-capable input");
source = replaceRequired(source,
  `function textTask(prompt) {
\tif (prompt.length === 0) throw new Error("subagent-codex: the one-shot task must contain only text blocks");
\tconst texts = [];
\tfor (const block of prompt) {
\t\tif (block.type !== "text") throw new Error("subagent-codex: the one-shot task must contain only text blocks");
\t\ttexts.push(block.text);
\t}
\tif (texts.every((text) => text.trim().length === 0)) throw new Error("subagent-codex: the one-shot task must not be empty");
\treturn texts;
}`,
  `async function taskInput(prompt, readImage, signal) {
\tif (prompt.length === 0) throw new Error("subagent-codex: the one-shot task must not be empty");
\tconst inputs = [];
\tfor (const block of prompt) {
\t\tif (block.type === "text") {
\t\t\tinputs.push({ type: "text", text: block.text, text_elements: [] });
\t\t\tcontinue;
\t\t}
\t\tif (block.type === "image") {
\t\t\tconst stored = await readImage(block.attachment, signal);
\t\t\tinputs.push({ type: "image", url: \`data:\${stored.ref.mediaType};base64,\${Buffer.from(stored.data).toString("base64")}\` });
\t\t\tcontinue;
\t\t}
\t\tthrow new Error(\`subagent-codex: unsupported one-shot task block \${block.type}\`);
\t}
\tif (!inputs.some((input) => input.type === "image" || input.text.trim().length > 0)) throw new Error("subagent-codex: the one-shot task must not be empty");
\treturn inputs;
}`,
  "Codex image task conversion");
source = replaceRequired(source,
  "const texts = textTask(request.prompt);",
  "const inputs = await taskInput(request.prompt, spec.readImage, request.signal);",
  "Codex image task preparation");
source = replaceRequired(source,
  "wire.runTurn(texts, runAbort.signal)",
  "wire.runTurn(inputs, runAbort.signal)",
  "Codex image turn call");
source = replaceRequired(source,
  'cwd: resolveChildCwd("subagent-codex", void 0, parentCwd),',
  'cwd: resolveChildCwd("subagent-codex", void 0, parentCwd),\n\t\t\tmodel: request.agentOptions?.model,\n\t\t\treadImage: (ref, signal) => this.ctx.attachments.readImage(ref, signal),',
  "model option");
source = replaceRequired(source,
  'const inject = ["subagents", "subprocess"];',
  'const inject = ["attachments", "subagents", "subprocess"];',
  "Codex attachment service injection");
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
