import { describe, expect, it } from "vitest";
import {
  compareSemVer,
  deepSeeUpdateArchiveUrl,
  deepSeeUpdateManifestUrl,
  parseSemVer,
  updateIsStale,
  validateDeepSeeManifest,
  validateDeepSeeSourceRef,
} from "./update-policy.mjs";

const manifest = {
  name: "@wubing2023/deepsee",
  version: "0.6.0-alpha.6",
  main: "./dist/index.js",
  deepsee: { installSpec: "github:WUBING2023/deepsee#main" },
};

describe("DeepSee update policy", () => {
  it("orders stable and prerelease SemVer versions correctly", () => {
    expect(compareSemVer("0.6.0-alpha.6", "0.6.0-alpha.5")).toBe(1);
    expect(compareSemVer("0.6.0-alpha.10", "0.6.0-alpha.9")).toBe(1);
    expect(compareSemVer("0.6.0", "0.6.0-rc.9")).toBe(1);
    expect(compareSemVer("0.6.0-alpha.6+build.2", "0.6.0-alpha.6+build.1")).toBe(0);
    expect(parseSemVer("1.2.3-beta.2")).toMatchObject({ major: 1, minor: 2, patch: 3 });
  });

  it("rejects malformed or non-official package manifests", () => {
    expect(validateDeepSeeManifest(manifest)).toBe(manifest);
    expect(() => validateDeepSeeManifest({ ...manifest, name: "lookalike" })).toThrow("包身份");
    expect(() => validateDeepSeeManifest({ ...manifest, deepsee: { installSpec: "github:attacker/repo" } })).toThrow("官方安装来源");
    expect(() => validateDeepSeeManifest({ ...manifest, version: "latest" })).toThrow("版本号");
  });

  it("pins manifests and archives to a validated Git commit", () => {
    const ref = "a".repeat(40);
    expect(validateDeepSeeSourceRef(ref.toUpperCase())).toBe(ref);
    expect(deepSeeUpdateManifestUrl(ref)).toContain(`/${ref}/package.json`);
    expect(deepSeeUpdateArchiveUrl(ref)).toContain(`/archive/${ref}.zip`);
    expect(() => validateDeepSeeSourceRef("main")).toThrow("SHA");
  });

  it("checks no more than once during the default cache window", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    expect(updateIsStale("2026-08-16T11:00:00.000Z", now, 6 * 60 * 60 * 1000)).toBe(false);
    expect(updateIsStale("2026-08-16T05:00:00.000Z", now, 6 * 60 * 60 * 1000)).toBe(true);
    expect(updateIsStale(undefined, now)).toBe(true);
  });
});
