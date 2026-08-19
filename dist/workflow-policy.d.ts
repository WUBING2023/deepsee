import type { Context } from "@deepseek-ai/cordis";
export declare function balancedWorkflowReason(text: string): string | undefined;
export type WorkflowReasoningProfile = "focused" | "balanced" | "deep";
export declare function workflowReasoningProfile(text: string): WorkflowReasoningProfile;
export declare function workflowReasoningGuidance(text: string): string;
export declare function installBalancedWorkflowTrigger(ctx: Context, automaticWorkflowEnabled: () => boolean): void;
