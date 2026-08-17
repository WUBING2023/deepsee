import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import type { ResolvedSubagentStartRequest } from "@deepseek-ai/dsh-subagent";
import { claudeArgv, prepareClaudeTask } from "./claude-cli-provider.js";

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
      "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--model", "sonnet",
    ]));
  });
});
