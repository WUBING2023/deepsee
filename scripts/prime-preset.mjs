import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function resolveStandardPresetRoot() {
  const dshManifest = require.resolve("@deepseek-ai/dsh/package.json");
  return join(dirname(dshManifest), "config", "agent-presets", "standard");
}

export function installPrimePreset(dshHome, options = {}) {
  const sourceRoot = resolveStandardPresetRoot();
  const destinationRoot = join(dshHome, ".agent-presets", "prime");
  const sourcePath = join(sourceRoot, "agent.cordis.yml");
  if (!existsSync(sourcePath)) throw new Error("DeepSee cannot find the Harness standard preset.");

  mkdirSync(destinationRoot, { recursive: true });
  const sourceComposition = readFileSync(sourcePath, "utf8");
  const standardPersona = [
    "    text: >-",
    "      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.",
  ].join("\n");
  const routingPolicy = options.hasReadyVision
    ? "Selecting this preset is the user's permission for lightweight automatic orchestration. Keep simple, single-track tasks in the normal agent loop. Use the native workflow tool only when the task has three or more independent workstreams, clear cross-capability roles, or an approved plan marked `Execution mode: Workflow`."
    : "Keep simple and single-track tasks in the normal agent loop. DeepSee has no ready visual route yet, so do not assume image understanding. An explicit `/workflow` request may still use ready text or CLI routes.";
  const primePersona = [
    "    text: |-",
    "      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.",
    "",
    `      You are running in DeepSee Prime mode. ${routingPolicy} If model capability matters, consult \`opends_list_models\` and respect enabled routes and user-edited capability descriptions. In a Workflow, choose a listed route by setting the child agent's \`model\` option to the exact DeepSee route id; omit the child \`provider\` because the DeepSee worker performs that mapping. Prefer a different enabled route for review when useful, but never add agents merely to make a small task look sophisticated.`,
  ].join("\n");
  if (!sourceComposition.includes(standardPersona)) {
    throw new Error("DeepSee Prime preset is incompatible with this Harness persona layout.");
  }

  const planAnchor = "              Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.";
  if (!sourceComposition.includes(planAnchor)) {
    throw new Error("DeepSee Prime preset is incompatible with this Harness plan layout.");
  }
  const primePlanPolicy = [
    planAnchor,
    "",
    "              In every completed plan, add one top-level line: `Execution mode: Loop`, `Execution mode: Subagent`, or `Execution mode: Workflow`. Choose Workflow only for multiple independent workstreams or explicit multi-agent intent. When Workflow is selected, name the capability role of each workstream. After approval, implementation must keep that execution mode and use the native workflow tool; consult `opends_list_models` when assigning capability-sensitive work.",
  ].join("\n");

  const workflowWorkerAnchor = [
    "    - id: workflow-worker-thread",
    "      name: '@deepseek-ai/dsh-workflow-worker-thread'",
    "      config:",
    "        provider: spawn",
  ].join("\n");
  if (!sourceComposition.includes(workflowWorkerAnchor)) {
    throw new Error("DeepSee Prime preset is incompatible with this Harness workflow layout.");
  }

  const composition = sourceComposition
    .replace(standardPersona, primePersona)
    .replace(planAnchor, primePlanPolicy)
    .replace(workflowWorkerAnchor, workflowWorkerAnchor.replace("provider: spawn", "provider: opends"));
  writeFileSync(join(destinationRoot, "agent.cordis.yml"), composition, "utf8");
  writeFileSync(join(destinationRoot, "preset.yml"), [
    "name: Prime 模式",
    "description: 保留标准模式，并由深见按任务复杂度选择 Loop、子代理或可见 Workflow。",
    "order: 0",
    "",
  ].join("\n"), "utf8");
  return destinationRoot;
}
