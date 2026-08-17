import type { Context } from "@deepseek-ai/cordis";
export declare function parseGeminiOutput(stdout: string): string;
export declare function geminiArgv(executable: string, model: string | undefined): {
    argv: string[];
    env: NodeJS.ProcessEnv;
};
export declare function installGeminiCliProvider(ctx: Context, executable: string): void;
