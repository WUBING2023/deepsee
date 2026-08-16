import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_INSTALL_RETRIES,
  DEFAULT_INSTALL_TIMEOUT_MS,
  describeInstallFailure,
  inspectProfileInstall,
  resolveInstallOptions,
  runWithRetries,
} from "./install-policy.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("DeepSee install policy", () => {
  it("uses slow-machine-safe defaults", () => {
    expect(resolveInstallOptions([], {})).toEqual({
      timeoutMs: DEFAULT_INSTALL_TIMEOUT_MS,
      retries: DEFAULT_INSTALL_RETRIES,
      profiles: ["web", "headless"],
      force: false,
      fromFolder: false,
    });
    expect(DEFAULT_INSTALL_TIMEOUT_MS).toBe(900_000);
    expect(DEFAULT_INSTALL_RETRIES).toBe(1);
  });

  it("accepts CLI overrides and allows disabling the timeout", () => {
    expect(resolveInstallOptions([
      "--profile", "web",
      "--timeout-ms", "0",
      "--retries", "3",
      "--force",
    ], {})).toEqual({
      timeoutMs: 0,
      retries: 3,
      profiles: ["web"],
      force: true,
      fromFolder: false,
    });
  });

  it("accepts extracted-folder installation without development or spec overrides", () => {
    expect(resolveInstallOptions(["--from-folder"], {})).toMatchObject({ fromFolder: true });
    expect(() => resolveInstallOptions(["--from-folder", "--local"], {})).toThrow("--local");
    expect(() => resolveInstallOptions(["--from-folder", "--spec", "example"], {})).toThrow("--spec");
  });

  it("uses environment overrides and rejects invalid values", () => {
    expect(resolveInstallOptions([], {
      DEEPSEE_INSTALL_TIMEOUT_MS: "1200000",
      DEEPSEE_INSTALL_RETRIES: "2",
    })).toMatchObject({ timeoutMs: 1_200_000, retries: 2 });
    expect(() => resolveInstallOptions(["--timeout-ms", "-1"], {})).toThrow("non-negative integer");
    expect(() => resolveInstallOptions(["--profile", "custom"], {})).toThrow("web, headless, or all");
  });

  it("retries a timed-out idempotent command and then succeeds", () => {
    const calls = [];
    const result = runWithRetries((attempt) => {
      calls.push(attempt);
      return attempt === 1
        ? { status: null, error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }) }
        : { status: 0 };
    }, 1);
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(calls).toEqual([1, 2]);
  });

  it("returns an actionable timeout explanation", () => {
    const message = describeInstallFailure("web", {
      status: null,
      error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
    }, 900_000);
    expect(message).toContain("15 minute(s)");
    expect(message).toContain("resume");
    expect(message).toContain("DEEPSEE_INSTALL_TIMEOUT_MS");
  });

  it("recognizes only a registered matching installed version as current", () => {
    const root = mkdtempSync(join(tmpdir(), "deepsee-install-policy-"));
    temporaryRoots.push(root);
    const profileRoot = join(root, "profiles", "web");
    const packageRoot = join(profileRoot, "node_modules", "@wubing2023", "deepsee");
    mkdirSync(packageRoot, { recursive: true });
    writeFileSync(join(profileRoot, "package.json"), JSON.stringify({
      dependencies: { "@wubing2023/deepsee": "github:WUBING2023/deepsee#main" },
      dsh: { profile: { bundles: ["@wubing2023/deepsee"] } },
    }));
    writeFileSync(join(packageRoot, "package.json"), JSON.stringify({ version: "0.6.0-alpha.5" }));

    expect(inspectProfileInstall(root, "web", "@wubing2023/deepsee", "0.6.0-alpha.5")).toMatchObject({
      current: true,
      registered: true,
      installedVersion: "0.6.0-alpha.5",
    });
    expect(inspectProfileInstall(root, "web", "@wubing2023/deepsee", "0.6.0-alpha.6")).toMatchObject({
      current: false,
      registered: true,
    });
  });
});
