import type { Context } from "@deepseek-ai/cordis";
export declare function balancedWorkflowReason(text: string): string | undefined;
export declare function installBalancedWorkflowTrigger(ctx: Context, automaticWorkflowEnabled: () => boolean): void;
