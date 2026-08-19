import type { Context } from "@deepseek-ai/cordis";
import { type ResolvedSubagentStartRequest } from "@deepseek-ai/dsh-subagent";
export declare function prepareClaudeTask(ctx: Pick<Context, "attachments">, request: ResolvedSubagentStartRequest): Promise<{
    stdin: string;
    streamJson: boolean;
}>;
export declare function parseClaudeOutput(stdout: string): string;
export declare function claudeArgv(executable: string, model: string | undefined, streamJson?: boolean): {
    argv: string[];
    env: NodeJS.ProcessEnv;
};
export interface ClaudeTraceEvent {
    type: string;
    eventId?: string;
    append?: boolean;
    status?: string;
    title?: string;
    summary?: string;
    detail?: string;
    artifacts?: string[];
}
/** Convert Claude Code's public JSONL stream into DeepSee's provider-neutral execution trace. */
export declare function claudeTraceEvents(value: Record<string, unknown>): ClaudeTraceEvent[];
export declare function installClaudeCliProvider(ctx: Context): Promise<void>;
