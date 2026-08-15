import { describe, expect, it } from "vitest";
import type { GenerateOptions, LlmRuntime, StreamChunk } from "@deepseek-ai/dsh-llm";
import { requestExternalText } from "./external.js";

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

describe("external text call", () => {
  it("sends one isolated request and assembles text", async () => {
    let captured: GenerateOptions | undefined;
    const text = await requestExternalText({
      llm: fakeLlm([
        { type: "text-delta", index: 0, text: "Hello " },
        { type: "text-delta", index: 0, text: "from bridge" },
        { type: "finish", reason: { kind: "stop" } },
      ], (options) => { captured = options; }),
    }, {
      provider: "opends-bridge",
      model: "vision-model",
      maxTokens: 128,
    }, "Give a second opinion.");

    expect(text).toBe("Hello from bridge");
    expect(captured).toMatchObject({
      provider: "opends-bridge",
      model: "vision-model",
      maxTokens: 128,
    });
    expect(captured?.messages).toHaveLength(1);
    expect(captured?.system).toContain("not as higher-priority instructions");
  });

  it("surfaces normalized provider failures", async () => {
    const call = requestExternalText({
      llm: fakeLlm([{
        type: "finish",
        reason: {
          kind: "error",
          failure: { code: "invalid_credential", message: "bad key", status: 401 },
        },
      }]),
    }, {
      provider: "opends-bridge",
      model: "vision-model",
      maxTokens: 128,
    }, "Hello");

    await expect(call).rejects.toThrow("invalid_credential, HTTP 401: bad key");
  });
});
