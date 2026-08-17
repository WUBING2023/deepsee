import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe.runIf(process.platform === "win32")("managed Runtime worker", () => {
  it("installs and verifies Gemini through the isolated official npm prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "deepsee-runtime-worker-"));
    const bin = join(root, "bin");
    const installPath = join(root, "runtime", "gemini");
    const stateRoot = join(root, "state");
    writeFileSync(join(root, "placeholder"), "", "utf8");
    mkdirSync(bin, { recursive: true });
    mkdirSync(stateRoot, { recursive: true });
    writeFileSync(join(bin, "npm.cmd"), [
      "@echo off",
      "setlocal enabledelayedexpansion",
      "set PREFIX=",
      ":loop",
      "if \"%~1\"==\"\" goto done",
      "if \"%~1\"==\"--prefix\" set PREFIX=%~2",
      "shift",
      "goto loop",
      ":done",
      "if \"%PREFIX%\"==\"\" exit /b 4",
      "if not exist \"%PREFIX%\" mkdir \"%PREFIX%\"",
      "> \"%PREFIX%\\gemini.cmd\" echo @echo off",
      ">> \"%PREFIX%\\gemini.cmd\" echo echo 0.53.0",
      "exit /b 0",
      "",
    ].join("\r\n"), "utf8");

    const result = spawnSync(process.execPath, [join(process.cwd(), "scripts", "install-runtime-worker.mjs"), stateRoot, "gemini", installPath], {
      cwd: process.cwd(),
      env: { ...process.env, OPENDS_RUNTIME_INSTALL: "gemini", PATH: bin, Path: bin, PATHEXT: ".CMD;.EXE" },
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
    });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(existsSync(join(installPath, "gemini.cmd"))).toBe(true);
    const state = JSON.parse(readFileSync(join(stateRoot, ".opends-tools", "runtimes", "gemini", "state.json"), "utf8"));
    expect(state).toMatchObject({ status: "ready", progress: 100, installMethod: "npm · 官方稳定版" });
  });
});
