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
source = `import { existsSync, readFileSync } from "node:fs";\nimport { homedir } from "node:os";\nimport { basename, isAbsolute, join } from "node:path";\nimport { recordExecutionTrace } from "../scripts/execution-trace.mjs";\n${source}`;
source = replaceRequired(source,
  "var CodexAppServerWire = class {\n\tinput;\n\ttransport;",
  "var CodexAppServerWire = class {\n\tinput;\n\ttransport;\n\ttrace;",
  "Codex wire trace field");
source = replaceRequired(source,
  "constructor(input, output) {\n\t\tthis.input = input;",
  "constructor(input, output, trace) {\n\t\tthis.input = input;\n\t\tthis.trace = trace;",
  "Codex wire trace constructor");
source = replaceRequired(source,
  "\thandleNotification(method, params) {\n\t\tif (method === \"turn/started\") {",
  `\tforwardTrace(method, params) {
\t\ttry {
\t\t\tif (method === "turn/plan/updated" && Array.isArray(params.plan)) {
\t\t\t\tthis.trace({ type: "agent.plan", eventId: "codex-plan", title: "Codex 执行计划", summary: params.plan.map((step) => \`\${step.status || "pending"} · \${step.step || ""}\`).join("\\n") });
\t\t\t\treturn;
\t\t\t}
\t\t\tif (method === "item/reasoning/summaryTextDelta" && typeof params.delta === "string") {
\t\t\t\tthis.trace({ type: "agent.summary", eventId: \`codex-reasoning-\${params.itemId || "current"}-\${params.summaryIndex || 0}\`, append: true, title: "Codex 推理摘要", summary: params.delta });
\t\t\t\treturn;
\t\t\t}
\t\t\tif (method !== "item/started" && method !== "item/completed") return;
\t\t\tconst item = params.item;
\t\t\tif (!item || typeof item !== "object") return;
\t\t\tconst completed = method === "item/completed";
\t\t\tconst status = completed ? (item.status === "failed" ? "failed" : "completed") : "running";
\t\t\tif (item.type === "commandExecution") {
\t\t\t\tthis.trace({ type: "agent.tool", eventId: \`codex-command-\${item.id || "unknown"}-\${completed ? "end" : "start"}\`, title: completed ? "命令执行完成" : "执行命令", summary: typeof item.command === "string" ? item.command : Array.isArray(item.command) ? item.command.join(" ") : "", detail: completed ? item.aggregatedOutput || "" : "", status });
\t\t\t} else if (item.type === "fileChange") {
\t\t\t\tconst artifacts = Array.isArray(item.changes) ? item.changes.map((change) => change?.path).filter((path) => typeof path === "string") : [];
\t\t\t\tthis.trace({ type: completed ? "agent.artifact" : "agent.tool", eventId: \`codex-file-\${item.id || "unknown"}-\${completed ? "end" : "start"}\`, title: completed ? "文件变更已完成" : "正在修改文件", summary: artifacts.join("\\n"), artifacts, status });
\t\t\t} else if (item.type === "imageView") {
\t\t\t\tthis.trace({ type: "agent.tool", eventId: \`codex-image-\${item.id || "unknown"}\`, title: "读取图片", summary: item.path || "", path: item.path, status });
\t\t\t} else if (item.type === "mcpToolCall" || item.type === "dynamicToolCall" || item.type === "webSearch") {
\t\t\t\tthis.trace({ type: "agent.tool", eventId: \`codex-tool-\${item.id || "unknown"}-\${completed ? "end" : "start"}\`, title: item.tool || item.query || item.type, detail: item.error ? String(item.error) : "", status });
\t\t\t} else if (item.type === "agentMessage" && completed && item.phase === "commentary" && typeof item.text === "string") {
\t\t\t\tthis.trace({ type: "agent.progress", eventId: \`codex-commentary-\${item.id || "unknown"}\`, title: "Codex 进度", summary: item.text, status: "completed" });
\t\t\t}
\t\t} catch {}
\t}
\thandleNotification(method, params) {
\t\tthis.forwardTrace(method, params);
\t\tif (method === "turn/started") {`,
  "Codex notification trace mapper");
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
  `const inputs = await taskInput(request.prompt, spec.readImage, request.signal);
\tconst runId = SessionId(randomUUID());
\tconst traceBase = { childId: String(runId), parentSessionId: String(request.parent.id), provider: "codex", model: spec.model || "default", cwd: spec.cwd };
\tconst trace = (event) => recordExecutionTrace({ ...traceBase, ...event });`,
  "Codex image task preparation");
source = replaceRequired(source,
  "wire.runTurn(texts, runAbort.signal)",
  "wire.runTurn(inputs, runAbort.signal)",
  "Codex image turn call");
source = replaceRequired(source,
  "const wire = new CodexAppServerWire(child.stdout, child.stdin);",
  "const wire = new CodexAppServerWire(child.stdout, child.stdin, trace);",
  "Codex trace wire");
source = replaceRequired(source,
  "await Promise.race([wire.startThread(spec.cwd, request.signal, spec.model), processFailure]);",
  `await Promise.race([wire.startThread(spec.cwd, request.signal, spec.model), processFailure]);
\t\ttrace({ type: "run.started", eventId: "codex-start", title: "Codex 已开始执行", status: "running" });`,
  "Codex trace start");
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
source = replaceRequired(source,
  `const result = settleRunResult({
\t\tattempt: () => Promise.race([wire.runTurn(inputs, runAbort.signal), processFailure]),
\t\tcollectOutput,
\t\tcancelled: () => runAbort.signal.aborted,
\t\tonError: spec.onError,
\t\tsignal: request.signal,
\t\tonAbort
\t});`,
  `const settledResult = settleRunResult({
\t\tattempt: () => Promise.race([wire.runTurn(inputs, runAbort.signal), processFailure]),
\t\tcollectOutput,
\t\tcancelled: () => runAbort.signal.aborted,
\t\tonError: spec.onError,
\t\tsignal: request.signal,
\t\tonAbort
\t});
\tconst result = settledResult.then((value) => {
\t\tconst output = value.output.filter((block) => block.type === "text" || block.type === "reasoning").map((block) => block.text).join("\\n").trim();
\t\ttrace({ type: value.stopReason === "completed" ? "run.completed" : "run.failed", eventId: "codex-end", title: value.stopReason === "completed" ? "Codex 已完成" : \`Codex 已结束：\${value.stopReason}\`, summary: output, output, status: value.stopReason === "completed" ? "completed" : value.stopReason === "aborted" ? "cancelled" : "failed" });
\t\treturn value;
\t});`,
  "Codex trace settlement");
source = replaceRequired(source,
  "id: SessionId(randomUUID()),\n\t\tresult,",
  "id: runId,\n\t\tresult,",
  "Codex stable trace run id");
writeFileSync(outputPath, source, "utf8");
