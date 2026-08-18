import { describe, expect, it } from "vitest";
import { createUserMessage, type ContentBlock } from "@deepseek-ai/dsh-llm";
import {
  collectVisionInput,
  countImages,
  imageAttachmentIds,
  rewriteWithVisualContext,
  stripImages,
  VisionDescriptionCache,
  visionCacheKey,
} from "./vision.js";

const image = {
  type: "image",
  attachment: {
    attachmentId: "img-1",
    mediaType: "image/png",
    bytes: 4,
    width: 1,
    height: 1,
  },
} as unknown as ContentBlock;

describe("vision bridge content handling", () => {
  it("finds and removes top-level and nested images", () => {
    const nested = {
      type: "tool-result",
      toolCallId: "call-1",
      content: [{ type: "text", text: "nested" }, image],
    } as unknown as ContentBlock;
    const content: ContentBlock[] = [{ type: "text", text: "hello" }, image, nested];

    expect(countImages(content)).toBe(2);
    expect(countImages(stripImages(content))).toBe(0);
    expect(collectVisionInput(content).map((block) => block.type)).toEqual([
      "text",
      "image",
      "text",
      "image",
    ]);
  });

  it("preserves message identity while replacing images with attributed context", () => {
    const original = createUserMessage({
      source: { kind: "user" },
      content: [{ type: "text", text: "What is shown?" }, image],
    });
    const rewritten = rewriteWithVisualContext(original, "A settings dialog.", {
      provider: "opends-bridge",
      model: "kimi-k2.5",
    });

    expect(rewritten.id).toBe(original.id);
    expect(countImages(rewritten.content)).toBe(0);
    expect(rewritten.content.at(-1)).toMatchObject({
      type: "text",
      text: expect.stringContaining("A settings dialog."),
    });
  });

  it("keeps a visual observation inside its tool-result protocol wrapper", () => {
    const original = createUserMessage({
      source: { kind: "user" },
      content: [{
        type: "tool-result",
        toolCallId: "call-read-image",
        content: [{ type: "text", text: "image result" }, image],
      } as unknown as ContentBlock],
    });
    const rewritten = rewriteWithVisualContext(original, "A poster with a blue title.", {
      provider: "deepsee-cli-codex",
      model: "gpt-5.6-sol",
    });

    expect(rewritten.content).toHaveLength(1);
    expect(rewritten.content[0]).toMatchObject({
      type: "tool-result",
      toolCallId: "call-read-image",
      content: [
        { type: "text", text: "image result" },
        { type: "text", text: expect.stringContaining("A poster with a blue title.") },
      ],
    });
    expect(countImages(rewritten.content)).toBe(0);
  });

  it("builds stable cache keys from the message, model, and attachment ids", () => {
    const message = createUserMessage({
      source: { kind: "user" },
      content: [image],
    });

    expect(imageAttachmentIds(message.content)).toEqual(["img-1"]);
    expect(visionCacheKey(message, { provider: "opends-bridge", model: "kimi-k2.5" })).toBe(
      `opends-bridge\u001fkimi-k2.5\u001f${message.id}\u001fimg-1`,
    );
  });

  it("deduplicates descriptions and evicts the oldest entry", async () => {
    const cache = new VisionDescriptionCache(2);
    let calls = 0;
    const load = async () => `description-${++calls}`;

    expect(await cache.getOrCreate("a", load)).toBe("description-1");
    expect(await cache.getOrCreate("a", load)).toBe("description-1");
    await cache.getOrCreate("b", load);
    await cache.getOrCreate("c", load);
    expect(cache.size).toBe(2);
    expect(await cache.getOrCreate("a", load)).toBe("description-4");
  });
});
