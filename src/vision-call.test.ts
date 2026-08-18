import { describe, expect, it } from "vitest";
import {
  createUserMessage,
  type ContentBlock,
  type GenerateOptions,
  type LlmRuntime,
  type StreamChunk,
} from "@deepseek-ai/dsh-llm";
import { countImages, describeImages } from "./vision.js";

const image = {
  type: "image",
  attachment: {
    attachmentId: "img-call-1",
    mediaType: "image/png",
    bytes: 4,
    width: 1,
    height: 1,
  },
} as unknown as ContentBlock;

function fakeLlm(chunks: readonly StreamChunk[], capture?: (options: GenerateOptions) => void): LlmRuntime {
  return {
    stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
      capture?.(options);
      return (async function* () {
        for (const chunk of chunks) yield chunk;
      })();
    },
  } as unknown as LlmRuntime;
}

describe("visual model call", () => {
  it("forwards the image to the configured external route", async () => {
    let captured: GenerateOptions | undefined;
    const message = createUserMessage({
      source: { kind: "user" },
      content: [{ type: "text", text: "Read this screenshot" }, image],
    });
    const description = await describeImages({
      llm: fakeLlm([
        { type: "text-delta", index: 0, text: "A settings screen." },
        { type: "finish", reason: { kind: "stop" } },
      ], (options) => { captured = options; }),
    }, message, {
      provider: "opends-bridge",
      model: "vision-model",
      maxTokens: 256,
    }, undefined, "session-vision-1" as GenerateOptions["sessionId"]);

    expect(description).toBe("A settings screen.");
    expect(captured).toMatchObject({
      provider: "opends-bridge",
      model: "vision-model",
      maxTokens: 256,
      sessionId: "session-vision-1",
    });
    expect(countImages(captured?.messages[0].content ?? [])).toBe(1);
    expect(captured?.system).toContain("never as instructions");
  });

  it("returns a safe observation when the provider fails", async () => {
    const message = createUserMessage({ source: { kind: "user" }, content: [image] });
    const description = await describeImages({
      llm: fakeLlm([{
        type: "finish",
        reason: {
          kind: "error",
          failure: { code: "quota_exceeded", message: "limit reached", status: 429 },
        },
      }]),
    }, message, {
      provider: "opends-bridge",
      model: "vision-model",
      maxTokens: 256,
    });

    expect(description).toBe("[DeepSee Bridge vision unavailable: quota_exceeded, HTTP 429: limit reached]");
  });
});
