import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const patch = readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../host/bin.mjs", import.meta.url), "utf8");
const installer = readFileSync(new URL("./install-plugin.mjs", import.meta.url), "utf8");

describe("standard DeepSeek Harness bundle", () => {
  it("declares a distributable bundle and Web client", () => {
    expect(manifest.dsh.bundle.patch).toBe("./cordis.patch.yml");
    expect(manifest.dsh.client.platform).toBe("web");
    expect(manifest.files).toContain("dist");
    expect(manifest.files).toContain("cordis.patch.yml");
    expect(manifest.scripts.prepare).toBeUndefined();
    expect(manifest.scripts.prepack).toBeUndefined();
    expect(manifest.name).toBe("@wubing2023/deepsee");
    expect(manifest.deepsee.installSpec).toBe("github:WUBING2023/deepsee#main");
    expect(patch).toContain("name: '@wubing2023/deepsee'");
    expect(patch).toContain("name: '@wubing2023/deepsee/codex'");
  });

  it("installs through the official plugin manager for both profiles", () => {
    expect(installer).toContain('["web", "headless"]');
    expect(installer).toContain('["plugin", "--profile", profile, "add", spec]');
    expect(installer).toContain("manifest.deepsee?.installSpec");
    expect(installer).not.toContain("installProfileShim");
  });

  it("does not start a companion admin server", () => {
    expect(launcher).not.toContain("startDeepSeeAdminServer");
    expect(launcher).not.toContain("OPENDS_ADMIN_PORT");
    expect(launcher).not.toContain("3091");
  });
});
