import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getManagedRuntimeExecutable,
  getManagedRuntimeStatus,
  validateRuntimeInstallPath,
  writeManagedRuntimeState,
} from "./runtime-manager.mjs";

describe("managed Runtime installation state", () => {
  it("accepts an empty absolute folder and rejects an unrelated non-empty folder", () => {
    const root = mkdtempSync(join(tmpdir(), "deepsee-runtime-"));
    const empty = join(root, "gemini");
    mkdirSync(empty);
    expect(validateRuntimeInstallPath(empty, "gemini", { stateRoot: root })).toBe(empty);

    const occupied = join(root, "occupied");
    mkdirSync(occupied);
    writeFileSync(join(occupied, "user.txt"), "keep", "utf8");
    expect(() => validateRuntimeInstallPath(occupied, "gemini", { stateRoot: root })).toThrow("不是空目录");
  });

  it("publishes a verified managed executable to Runtime discovery", () => {
    const root = mkdtempSync(join(tmpdir(), "deepsee-runtime-"));
    const installPath = join(root, "gemini");
    mkdirSync(installPath);
    const executable = join(installPath, "gemini.cmd");
    writeFileSync(executable, "@echo off\r\n", "utf8");
    writeFileSync(join(installPath, ".deepsee-runtime.json"), JSON.stringify({ id: "gemini" }), "utf8");
    writeManagedRuntimeState(root, "gemini", { status: "ready", installPath, executable, progress: 100 });

    expect(getManagedRuntimeStatus(root, "gemini")).toMatchObject({ status: "ready", managed: true, executable });
    expect(getManagedRuntimeExecutable(root, "cli:gemini")).toBe(executable);
  });
});
