import type { Context } from "@deepseek-ai/cordis";
/**
 * Make native Workflow use the DeepSee subagent provider in every Harness
 * preset, including the shipped Standard/Code presets that keep their own
 * isolated Workflow engine. The public Workflow request seam already supports
 * `subagentProvider`; this wrapper only supplies its missing default.
 */
export declare function installDeepSeeWorkflowRouting(ctx: Context): void;
