import { describe, expect, it } from "vitest";
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
    const directory = process.execPath.slice(0, process.execPath.lastIndexOf("\\"));
    const name = process.execPath.slice(process.execPath.lastIndexOf("\\") + 1);
    expect(findExecutable(name, {
      platform: "win32",
      pathValue: directory,
    })).toBe(process.execPath);
  });
});
