import { describe, expect, it } from "vitest";
import { basename, dirname } from "node:path";
import { executableCandidates, findExecutable } from "./runtime-locator.mjs";

describe("runtime locator", () => {
  it("expands Windows PATHEXT without spawning a process", () => {
    expect(executableCandidates("claude", {
      platform: "win32",
      pathValue: "C:\\Tools;D:\\Apps",
      pathExtValue: ".EXE;.CMD",
    })).toEqual([
      "C:\\Tools\\claude.EXE",
      "C:\\Tools\\claude.CMD",
      "C:\\Tools\\claude",
      "D:\\Apps\\claude.EXE",
      "D:\\Apps\\claude.CMD",
      "D:\\Apps\\claude",
    ]);
  });

  it("finds the current Node executable from an explicit directory", () => {
    expect(findExecutable(basename(process.execPath), {
      platform: process.platform,
      pathValue: dirname(process.execPath),
    })).toBe(process.execPath);
  });
});
