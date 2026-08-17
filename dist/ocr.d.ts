import type { Context } from "@deepseek-ai/cordis";
import type { UserMessage } from "@deepseek-ai/dsh-llm";
export interface MinerUConfig {
    executable: string;
    timeoutMs?: number;
}
export type OCRTool = "mineru" | "paddleocr" | "rapidocr";
export interface LocalOCRConfig extends MinerUConfig {
    tool: OCRTool;
}
export declare function describeImagesWithMinerU(ctx: Pick<Context, "attachments">, message: UserMessage, config: MinerUConfig, signal?: AbortSignal): Promise<string>;
export declare function describeImagesWithLocalOCR(ctx: Pick<Context, "attachments">, message: UserMessage, config: LocalOCRConfig, signal?: AbortSignal): Promise<string>;
