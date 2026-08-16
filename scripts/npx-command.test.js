import { describe, expect, it } from "vitest";

import { resolveExecutableInvocation, resolveNpxInvocation } from "./npx-command.mjs";

describe("npx command resolution", () => {
  it("runs npm's JavaScript entry directly when available", () => {
    const invocation = resolveNpxInvocation(["--yes", "example"], {
      platform: "win32",
      execPath: "C:\\node\\node.exe",
      npmExecPath: "C:\\node\\node_modules\\npm\\bin\\npm-cli.js",
      existsSync: (path) => path.endsWith("npx-cli.js"),
    });
    expect(invocation.command).toBe("C:\\node\\node.exe");
    expect(invocation.args).toEqual([
      "C:\\node\\node_modules\\npm\\bin\\npx-cli.js",
      "--yes",
      "example",
    ]);
  });

  it("falls back to cmd without asking Node to spawn a batch file", () => {
    const invocation = resolveNpxInvocation(["--yes", "example"], {
      platform: "win32",
      execPath: "C:\\custom\\node.exe",
      npmExecPath: "",
      comSpec: "C:\\Windows\\System32\\cmd.exe",
      existsSync: () => false,
    });
    expect(invocation.command).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(invocation.args).toEqual(["/d", "/s", "/c", "call", "npx.cmd", "--yes", "example"]);
  });

  it("runs an existing Windows DSH batch shim through cmd", () => {
    const invocation = resolveExecutableInvocation("C:\\Users\\test\\AppData\\Roaming\\npm\\dsh.cmd", ["web"], {
      platform: "win32",
      comSpec: "C:\\Windows\\System32\\cmd.exe",
    });
    expect(invocation.command).toBe("C:\\Windows\\System32\\cmd.exe");
    expect(invocation.args).toEqual([
      "/d", "/s", "/c", "call",
      "C:\\Users\\test\\AppData\\Roaming\\npm\\dsh.cmd",
      "web",
    ]);
  });

  it("runs native executables directly", () => {
    expect(resolveExecutableInvocation("C:\\tools\\dsh.exe", ["web"], { platform: "win32" })).toEqual({
      command: "C:\\tools\\dsh.exe",
      args: ["web"],
    });
  });
});
