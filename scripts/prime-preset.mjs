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
  const routingPolicy = options.autoWorkflow === false
    ? "Automatic Workflow selection is disabled. Use the native workflow tool only after an explicit user request or an approved plan marked `Execution mode: Workflow`."
    : "Selecting this preset is the user's permission for balanced automatic orchestration. Prefer the native workflow tool when a task has two or more genuinely independent workstreams, multiple deliverables or capability roles, an implementation plus independent review, an explicit comparison between models or approaches, or an approved plan marked `Execution mode: Workflow`. Keep a small or inherently sequential single-track task in the normal agent loop; difficulty alone is not a reason to add agents.";
  const visionPolicy = options.hasReadyVision
    ? ""
    : " No ready visual route is configured; this limits image work but must not disable text, code, research, or document Workflows.";
  const primePersona = [
    "    text: |-",
    "      You are a coding agent powered by the {{model}} model. Your working directory is {{cwd}}.",
    "",
    `      You are running in DeepSee Prime mode. ${routingPolicy}${visionPolicy} If model capability matters, consult \`opends_list_models\` and respect enabled routes and user-edited capability descriptions. In a Workflow, choose a listed route by setting the child agent's \`model\` option to the exact DeepSee route id; omit the child \`provider\` because the native Workflow engine is already routed through DeepSee. For comparison or independent review, use different enabled model routes when at least two suitable routes are available; use the main agent to synthesize disagreements. Keep long runs token-efficient: batch related diagnostics, read targeted ranges or diffs instead of rereading whole files, keep progress summaries concise, and after two failed retries on the same check reassess the root cause before another edit. Do not print raw test dumps unless the user needs them. Treat a null child result as failure and never bypass DeepSee by launching Codex, Claude Code, or another CLI through pwsh/bash. Never add agents merely to make a small task look sophisticated.`,
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
    "              In every completed plan, add one top-level line: `Execution mode: Loop`, `Execution mode: Subagent`, or `Execution mode: Workflow`. Choose Workflow for two or more genuinely independent workstreams, multiple deliverables or capability roles, implementation plus independent review, explicit model/approach comparison, or explicit multi-agent intent. When Workflow is selected, name each workstream's capability role. For comparison or review, consult `opends_list_models` and assign different enabled routes when at least two suitable routes exist. After approval, implementation must keep that execution mode and use the native workflow tool.",
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
