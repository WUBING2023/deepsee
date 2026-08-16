import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const patch = readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../host/bin.mjs", import.meta.url), "utf8");
const installer = readFileSync(new URL("./install-plugin.mjs", import.meta.url), "utf8");
const installPolicy = readFileSync(new URL("./install-policy.mjs", import.meta.url), "utf8");
const folderInstaller = readFileSync(new URL("./folder-install.mjs", import.meta.url), "utf8");

describe("standard DeepSeek Harness bundle", () => {
  it("declares a distributable bundle and Web client", () => {
    expect(manifest.dsh.bundle.patch).toBe("./cordis.patch.yml");
    expect(manifest.dsh.client.platform).toBe("web");
    expect(manifest.files).toContain("dist");
    expect(manifest.files).toContain("cordis.patch.yml");
    expect(manifest.scripts.prepare).toBeUndefined();
    expect(manifest.scripts.prepack).toBeUndefined();
    expect(manifest.scripts.prebuild).toBeUndefined();
    expect(manifest.scripts.build).toBeUndefined();
    expect(manifest.scripts["build:plugin"]).toContain("tsc -p tsconfig.build.json");
    expect(manifest.name).toBe("@wubing2023/deepsee");
    expect(manifest.dependencies["@deepseek-ai/dsh-sdk-protocol"]).toBe("0.1.0-rc.6");
    expect(manifest.peerDependencies["@deepseek-ai/dsh-sdk-protocol"]).toBeUndefined();
    expect(manifest.deepsee.installSpec).toBe("github:WUBING2023/deepsee#main");
    expect(patch).toContain("name: '@wubing2023/deepsee'");
    expect(patch).toContain("name: '@wubing2023/deepsee/codex'");
  });

  it("installs through the official plugin manager for both profiles", () => {
    expect(installPolicy).toContain('["web", "headless"]');
    expect(installer).toContain("for (const profile of options.profiles)");
    expect(installer).toContain('["plugin", "--profile", profile, "add", spec]');
    expect(installer).toContain("manifest.deepsee?.installSpec");
    expect(installer).toContain('resolveNpxInvocation(["--yes", dshSpec, ...argv])');
    expect(installer).toContain("resolveInstallOptions");
    expect(installer).toContain("runWithRetries");
    expect(installer).toContain("inspectProfileInstall");
    expect(installer).toContain("stageFolderPackage");
    expect(installPolicy).toContain('args.includes("--from-folder")');
    expect(folderInstaller).toContain('join(dshHome, "deepsee", "packages")');
    expect(installer).not.toContain("timeout: 180_000");
    expect(readFileSync(new URL("./cli.mjs", import.meta.url), "utf8")).toContain("Installation failed / 安装失败");
    expect(installer).not.toContain("installProfileShim");
  });

  it("does not start a companion admin server", () => {
    expect(launcher).not.toContain("startDeepSeeAdminServer");
    expect(launcher).not.toContain("OPENDS_ADMIN_PORT");
    expect(launcher).not.toContain("3091");
  });
});
