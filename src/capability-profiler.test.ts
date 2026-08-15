import { describe, expect, it } from "vitest";
import { parseCapabilityProfile } from "./capability-profiler.js";

describe("automatic capability profiling", () => {
  it("keeps the model's short self-description and derives routing tags", () => {
    const profile = parseCapabilityProfile(
      '{"strengths":["复杂推理","代码实现","长文档分析"],"vision":false}',
      { inputModalities: ["text"], reasoning: { efforts: [], defaultEffort: undefined } },
    );
    expect(profile.strengths).toEqual(["复杂推理", "代码实现", "长文档分析"]);
    expect(profile.capabilities).toEqual(expect.arrayContaining(["text", "reasoning", "coding", "long-context"]));
    expect(profile.vision).toBe(false);
  });

  it("uses adapter modality metadata as the authoritative vision signal", () => {
    const profile = parseCapabilityProfile(
      '```json\n{"strengths":["视觉理解","文档识别"],"vision":false}\n```',
      { inputModalities: ["text", "image"], reasoning: undefined },
    );
    expect(profile.vision).toBe(true);
    expect(profile.capabilities).toContain("vision");
  });

  it("recovers strengths from slightly malformed model JSON", () => {
    const profile = parseCapabilityProfile(
      '{"strengths":["复杂推理","代码生成","长文档分析"],"vision":否}',
      { inputModalities: ["text"], reasoning: undefined },
    );
    expect(profile.strengths).toEqual(["复杂推理", "代码生成", "长文档分析"]);
    expect(profile.vision).toBe(false);
  });
});
