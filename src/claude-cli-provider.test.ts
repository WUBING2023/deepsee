import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { ResolvedSubagentStartRequest } from "@deepseek-ai/dsh-subagent";
import { claudeArgv, claudeTraceEvents, prepareClaudeTask } from "./claude-cli-provider.js";

describe("Claude Code image transport", () => {
  it("encodes Harness image attachments into Claude Code's native stream-json input", async () => {
    const readImage = vi.fn(async () => ({
      ref: { mediaType: "image/png" },
      data: Buffer.from([137, 80, 78, 71]),
    }));
    const request = {
      prompt: [{ type: "text", text: "Describe this image." }, {
        type: "image",
        attachment: { attachmentId: "image-1", mediaType: "image/png" },
      }],
      signal: new AbortController().signal,
    } as unknown as ResolvedSubagentStartRequest;
    const prepared = await prepareClaudeTask({ attachments: { readImage } } as unknown as Pick<Context, "attachments">, request);
    expect(readImage).toHaveBeenCalledTimes(1);
    expect(prepared.streamJson).toBe(true);
    expect(JSON.parse(prepared.stdin)).toMatchObject({
      type: "user",
      message: {
        content: [
          { type: "text", text: "Describe this image." },
          { type: "image", source: { type: "base64", media_type: "image/png", data: "iVBORw==" } },
        ],
      },
    });
    expect(claudeArgv("claude.exe", "sonnet", true).argv).toEqual(expect.arrayContaining([
      "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
      "--include-partial-messages", "--forward-subagent-text", "--model", "sonnet",
    ]));
  });

  it("uses the streaming protocol for text-only work so execution events are not lost", async () => {
    const request = {
      prompt: [{ type: "text", text: "Implement the feature." }],
      signal: new AbortController().signal,
    } as unknown as ResolvedSubagentStartRequest;
    const prepared = await prepareClaudeTask({ attachments: {} } as unknown as Pick<Context, "attachments">, request);
    expect(prepared.streamJson).toBe(true);
    expect(JSON.parse(prepared.stdin)).toMatchObject({ type: "user", message: { content: [{ type: "text", text: "Implement the feature." }] } });
  });

  it("maps public Claude tool and progress messages to the neutral execution trace", () => {
    expect(claudeTraceEvents({
      type: "assistant",
      message: {
        id: "message-1",
        content: [
          { type: "text", text: "I will inspect the project." },
          { type: "tool_use", id: "tool-1", name: "Write", input: { file_path: "poster.svg" } },
          { type: "thinking", thinking: "private reasoning must not be forwarded" },
        ],
      },
    })).toEqual([
      expect.objectContaining({ type: "agent.summary", summary: "I will inspect the project." }),
      expect.objectContaining({ type: "agent.tool", title: "调用 Write", artifacts: ["poster.svg"] }),
    ]);
  });
});
