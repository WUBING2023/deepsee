import type { Context } from "@deepseek-ai/cordis";
import type { UserMessage } from "@deepseek-ai/dsh-llm";
export interface MinerUConfig {
    executable: string;
    timeoutMs?: number;
}
export declare function describeImagesWithMinerU(ctx: Pick<Context, "attachments">, message: UserMessage, config: MinerUConfig, signal?: AbortSignal): Promise<string>;
