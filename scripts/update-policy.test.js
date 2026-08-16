import { describe, expect, it } from "vitest";
import {
  assessDeepSeeUpdateCompatibility,
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
  version: "0.6.0-alpha.7",
  main: "./dist/index.js",
  deepsee: {
    installSpec: "github:WUBING2023/deepsee#main",
    update: { protocol: 1, minimumUpdaterVersion: "0.6.0-alpha.6" },
  },
};

describe("DeepSee update policy", () => {
  it("orders stable and prerelease SemVer versions correctly", () => {
    expect(compareSemVer("0.6.0-alpha.6", "0.6.0-alpha.5")).toBe(1);
    expect(compareSemVer("0.6.0-alpha.10", "0.6.0-alpha.9")).toBe(1);
    expect(compareSemVer("0.6.0", "0.6.0-rc.9")).toBe(1);
    expect(compareSemVer("0.6.0-alpha.6+build.2", "0.6.0-alpha.6+build.1")).toBe(0);
    expect(parseSemVer("1.2.3-beta.2")).toMatchObject({ major: 1, minor: 2, patch: 3 });
    expect(() => parseSemVer("1.2.3-beta.01")).toThrow("数字标识");
    expect(() => parseSemVer("999999999999999999.2.3")).toThrow("过大");
  });

  it("rejects malformed or non-official package manifests", () => {
    expect(validateDeepSeeManifest(manifest)).toBe(manifest);
    expect(() => validateDeepSeeManifest({ ...manifest, name: "lookalike" })).toThrow("包身份");
    expect(() => validateDeepSeeManifest({ ...manifest, deepsee: { installSpec: "github:attacker/repo" } })).toThrow("官方安装来源");
    expect(() => validateDeepSeeManifest({ ...manifest, version: "latest" })).toThrow("版本号");
    expect(() => validateDeepSeeManifest({ ...manifest, deepsee: { ...manifest.deepsee, update: { protocol: 0 } } })).toThrow("协议版本");
  });

  it("pins manifests and archives to a validated Git commit", () => {
    const ref = "a".repeat(40);
    expect(validateDeepSeeSourceRef(ref.toUpperCase())).toBe(ref);
    expect(deepSeeUpdateManifestUrl(ref)).toContain(`/${ref}/package.json`);
    expect(deepSeeUpdateArchiveUrl(ref)).toContain(`/archive/${ref}.zip`);
    expect(() => validateDeepSeeSourceRef("main")).toThrow("SHA");
    expect(validateDeepSeeSourceRef("b".repeat(64))).toBe("b".repeat(64));
  });

  it("fails closed when a future package requires a newer update protocol", () => {
    expect(assessDeepSeeUpdateCompatibility("0.6.0-alpha.7", manifest)).toEqual({ compatible: true });
    expect(assessDeepSeeUpdateCompatibility("0.6.0-alpha.5", manifest)).toMatchObject({ compatible: false });
    expect(assessDeepSeeUpdateCompatibility("0.6.0-alpha.7", {
      ...manifest,
      deepsee: { ...manifest.deepsee, update: { protocol: 2 } },
    })).toMatchObject({ compatible: false });
  });

  it("checks no more than once during the default cache window", () => {
    const now = Date.parse("2026-08-16T12:00:00.000Z");
    expect(updateIsStale("2026-08-16T11:00:00.000Z", now, 6 * 60 * 60 * 1000)).toBe(false);
    expect(updateIsStale("2026-08-16T05:00:00.000Z", now, 6 * 60 * 60 * 1000)).toBe(true);
    expect(updateIsStale(undefined, now)).toBe(true);
  });
});
