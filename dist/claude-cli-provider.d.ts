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
export declare function installClaudeCliProvider(ctx: Context): Promise<void>;
