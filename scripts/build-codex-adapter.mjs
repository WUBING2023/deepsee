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
writeFileSync(outputPath, source, "utf8");
