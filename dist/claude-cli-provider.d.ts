import type { Context } from "@deepseek-ai/cordis";
export declare function parseClaudeOutput(stdout: string): string;
export declare function claudeArgv(executable: string, model: string | undefined): {
    argv: string[];
    env: NodeJS.ProcessEnv;
};
export declare function installClaudeCliProvider(ctx: Context): Promise<void>;
