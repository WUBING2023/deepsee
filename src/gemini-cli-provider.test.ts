import { describe, expect, it } from "vitest";
import { geminiArgv, parseGeminiOutput } from "./gemini-cli-provider.js";

describe("Gemini CLI provider", () => {
  it("extracts the official headless JSON response", () => {
    expect(parseGeminiOutput(JSON.stringify({ response: "完成", stats: { total_tokens: 3 } }))).toBe("完成");
    expect(() => parseGeminiOutput(JSON.stringify({ error: { message: "login required" } }))).toThrow("login required");
  });

  it("selects the requested subscription model in headless mode", () => {
    const { argv } = geminiArgv("gemini", "pro");
    expect(argv).toContain("--output-format");
    expect(argv).toContain("--approval-mode");
    expect(argv).toContain("--model");
    expect(argv).toContain("pro");
  });
});
