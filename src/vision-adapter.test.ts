import { describe, expect, it } from "vitest";
import {
  createUserMessage,
  type ContentBlock,
  type GenerateOptions,
  type LlmRuntime,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm";
import { VisionBridgeAdapter } from "./vision-adapter.js";
import { countImages } from "./vision.js";

const image = {
  type: "image",
  attachment: {
    attachmentId: "vision-route-image",
    mediaType: "image/png",
    bytes: 4,
    width: 1,
    height: 1,
  },
} as unknown as ContentBlock;

function streamOf(chunks: readonly StreamChunk[]): AsyncIterable<StreamChunk> {
  return (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
}

describe("first-class vision route", () => {
  it("advertises image input while preserving DeepSeek reasoning metadata", async () => {
    const runtime = {
      listModels: async () => [{
        provider: "deepseek-official",
        id: "deepseek-v4-flash",
        name: "DeepSeek-V4-Flash",
        inputModalities: ["text"],
      }],
      resolveModelInfo: async () => ({
        provider: "deepseek-official",
        id: "deepseek-v4-flash",
        name: "DeepSeek-V4-Flash",
        inputModalities: ["text"],
        reasoning: {
          efforts: [{ id: "high", name: "High" }],
          defaultEffort: "high",
        },
      }),
      providerRetryPolicy: () => undefined,
      stream: () => streamOf([]),
    } as unknown as LlmRuntime;
    const adapter = new VisionBridgeAdapter({ llm: runtime }, runtime, {
      route: "opends-vision",
      primaryProvider: "deepseek-official",
      provider: "opends-bridge",
      model: "kimi-k3",
      maxTokens: 512,
      cacheEntries: 8,
    });

    const listed = await adapter.listModels("opends-vision");
    const resolved = await adapter.resolveModel("opends-vision", "deepseek-v4-flash");

    expect(adapter.providerInfo("opends-vision").name).toContain("DeepSeek + kimi-k3");
    expect(listed[0]).toMatchObject({
      provider: "opends-vision",
      inputModalities: ["text", "image"],
    });
    expect(resolved).toMatchObject({
      provider: "opends-vision",
      inputModalities: ["text", "image"],
      reasoning: { defaultEffort: "high" },
    });
  });

  it("uses Kimi for the image and delegates an image-free observation to DeepSeek", async () => {
    let deepseekRequest: GenerateOptions | undefined;
    const runtime = {
      listModels: async () => [],
      resolveModelInfo: async () => ({
        provider: "deepseek-official",
        id: "deepseek-v4-flash",
        name: "DeepSeek-V4-Flash",
      }),
      providerRetryPolicy: () => undefined,
      stream(options: GenerateOptions) {
        if (options.provider === "opends-bridge") {
          return streamOf([
            { type: "text-delta", index: 0, text: "A red square." },
            { type: "finish", reason: { kind: "stop" } },
          ]);
        }
        deepseekRequest = options;
        return streamOf([
          { type: "text-delta", index: 0, text: "It is a red square." },
          { type: "finish", reason: { kind: "stop" } },
        ]);
      },
    } as unknown as LlmRuntime;
    const adapter = new VisionBridgeAdapter({ llm: runtime }, runtime, {
      route: "opends-vision",
      primaryProvider: "deepseek-official",
      provider: "opends-bridge",
      model: "kimi-k3",
      maxTokens: 512,
      cacheEntries: 8,
    });
    const message = createUserMessage({
      source: { kind: "user" },
      content: [{ type: "text", text: "What is this?" }, image],
    });
    const chunks: StreamChunk[] = [];
    for await (const chunk of adapter.stream({
      provider: "opends-vision",
      model: "deepseek-v4-flash",
      messages: [message],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({ type: "text-delta", index: 0, text: "It is a red square." });
    expect(deepseekRequest?.provider).toBe("deepseek-official");
    expect(countImages(deepseekRequest?.messages[0].content ?? [])).toBe(0);
    expect(deepseekRequest?.messages[0].content).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "text", text: expect.stringContaining("A red square.") }),
    ]));
  });
});
