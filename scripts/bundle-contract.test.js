import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const patch = readFileSync(new URL("../cordis.patch.yml", import.meta.url), "utf8");
const launcher = readFileSync(new URL("../host/bin.mjs", import.meta.url), "utf8");
const installer = readFileSync(new URL("./install-plugin.mjs", import.meta.url), "utf8");
const installPolicy = readFileSync(new URL("./install-policy.mjs", import.meta.url), "utf8");
const folderInstaller = readFileSync(new URL("./folder-install.mjs", import.meta.url), "utf8");
const mineruManager = readFileSync(new URL("./mineru-manager.mjs", import.meta.url), "utf8");
const mineruWorker = readFileSync(new URL("./install-mineru-worker.mjs", import.meta.url), "utf8");
const updateManager = readFileSync(new URL("./update-manager.mjs", import.meta.url), "utf8");
const updateWorker = readFileSync(new URL("./update-worker.mjs", import.meta.url), "utf8");

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
    expect(manifest.dependencies["@deepseek-ai/dsh-sdk-protocol"]).toBe("^0.1.0-rc.6");
    expect(manifest.peerDependencies["@deepseek-ai/dsh-sdk-protocol"]).toBeUndefined();
    expect(manifest.peerDependencies["@deepseek-ai/dsh"]).toBe("^0.1.0-rc.6");
    expect(manifest.deepsee.harnessRuntime).toBe("0.1.0-rc.6");
    expect(manifest.engines.node).toBe(">=24");
    expect(manifest.deepsee.installSpec).toBe("github:WUBING2023/deepsee#main");
    expect(manifest.deepsee.legacyPackageAliases).toContain("deepsee-harness");
    expect(manifest.deepsee.update).toEqual({ protocol: 1, minimumUpdaterVersion: "0.6.0-alpha.6" });
    expect(patch).toContain("name: '@wubing2023/deepsee'");
    expect(patch).toContain("name: '@wubing2023/deepsee/codex'");
    expect(patch).toContain("instructionFileCandidates: [AGENTS.md, CLAUDE.md, agent.md]");
  });

  it("installs through the official plugin manager for both profiles", () => {
    expect(installPolicy).toContain('["web", "headless"]');
    expect(installer).toContain("for (const profile of options.profiles)");
    expect(installer).toContain('["plugin", "--profile", profile, "add", spec]');
    expect(installer).toContain("manifest.deepsee?.installSpec");
    expect(installer).toContain('"--prefer-offline"');
    expect(installer).toContain('dshSpec, "--", ...argv');
    expect(launcher).toContain('dshSpec, "--", ...process.argv.slice(2)');
    expect(launcher).toContain('findExecutable("dsh")');
    expect(launcher).toContain('manifest.deepsee?.harnessRuntime');
    expect(installer).toContain("resolveInstallOptions");
    expect(installer).toContain("runWithRetries");
    expect(installer).toContain("inspectProfileInstall");
    expect(installer).toContain("stageFolderPackage");
    expect(installer).toContain("resolveProfileStoreDir");
    expect(installer).toContain("npm_config_store_dir");
    expect(installer).toContain("profileUsesPackage");
    expect(installer).toContain('"remove", legacyPackage');
    expect(installer).toContain('NO_UPDATE_NOTIFIER: "1"');
    expect(installPolicy).toContain('args.includes("--from-folder")');
    expect(folderInstaller).toContain('join(dshHome, "deepsee", "packages")');
    expect(installer).not.toContain("timeout: 180_000");
    expect(readFileSync(new URL("./cli.mjs", import.meta.url), "utf8")).toContain("Installation failed / 安装失败");
    expect(installer).not.toContain("installProfileShim");
  });

  it("allows the Codex provider to reuse a verified Desktop app-server executable", () => {
    const builder = readFileSync(new URL("./build-codex-adapter.mjs", import.meta.url), "utf8");
    expect(builder).toContain("resolveDeepSeeCodexExecutable");
    expect(builder).toContain('item?.id === "cli:codex"');
    expect(builder).toContain('route?.status === "ready"');
  });

  it("does not start a companion admin server", () => {
    expect(launcher).not.toContain("startDeepSeeAdminServer");
    expect(launcher).not.toContain("OPENDS_ADMIN_PORT");
    expect(launcher).not.toContain("3091");
  });

  it("installs MinerU through an automatic fallback chain", () => {
    expect(mineruManager).not.toContain('if (!findExecutable("uv"))');
    expect(mineruWorker).toContain("discoverCompatiblePythonRuntimes");
    expect(mineruWorker).toContain("下载并校验便携 UV 压缩包");
    expect(mineruWorker).toContain("下载并解压 MinerU 官方源码 ZIP");
    expect(mineruWorker).toContain("verifySha256");
    const strategyFlow = mineruWorker.slice(mineruWorker.indexOf("function installPackage"));
    expect(strategyFlow.indexOf("系统 UV")).toBeLessThan(strategyFlow.indexOf("便携 UV"));
    expect(strategyFlow.indexOf("便携 UV")).toBeLessThan(strategyFlow.indexOf("官方源码 ZIP"));
  });

  it("checks and installs updates through the verified ZIP installer", () => {
    expect(updateManager).toContain("queueDeepSeeUpdateCheck");
    expect(updateManager).toContain("startDeepSeeUpdate");
    expect(updateWorker).toContain("deepSeeUpdateArchiveUrl");
    expect(updateManager).toContain("DEEPSEE_UPDATE_REF_URL");
    expect(updateWorker).toContain('"--from-folder"');
    expect(updateWorker).toContain('"1800000"');
    expect(updateWorker).not.toContain('"--force"');
    expect(updateManager).toContain("acquireDeepSeeUpdateLock");
    expect(updateWorker).toContain("claimDeepSeeUpdateLock");
    expect(updateWorker).toContain("validateDeepSeeManifest");
  });
});
