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
const pythonOcrWorker = readFileSync(new URL("./install-python-ocr-worker.mjs", import.meta.url), "utf8");
const downloadFallback = readFileSync(new URL("./download-fallback.mjs", import.meta.url), "utf8");
const updateManager = readFileSync(new URL("./update-manager.mjs", import.meta.url), "utf8");
const updateWorker = readFileSync(new URL("./update-worker.mjs", import.meta.url), "utf8");
const updateLiveSmoke = readFileSync(new URL("./update-live-smoke.mjs", import.meta.url), "utf8");
const pluginSource = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const ocrRunner = readFileSync(new URL("./ocr-runner.py", import.meta.url), "utf8");
const ocrSource = readFileSync(new URL("../src/ocr.ts", import.meta.url), "utf8");

describe("standard DeepSeek Harness bundle", () => {
  it("declares a distributable bundle and Web client", () => {
    expect(manifest.dsh.bundle.patch).toBe("./cordis.patch.yml");
    expect(manifest.dsh.client.platform).toBe("web");
    expect(manifest.files).toContain("dist");
    expect(manifest.files).toContain("scripts/*.py");
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
    expect(patch).toMatch(/id: workflow-worker-thread[\s\S]*?provider: opends/);
    expect(pluginSource.match(/export const inject = \[([^\]]+)\]/)?.[1]).not.toContain("agentPresets");
    expect(pluginSource).not.toContain("registerAdapter([config.visionRoute]");
    expect(pluginSource).not.toContain('runtimeProvider: "opends-bridge"');
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
    expect(installer).toContain("pnpm_config_store_dir");
    expect(installer).toContain("profileUsesPackage");
    expect(installer).toContain("installPrimePreset(dshHome");
    expect(installer).toContain("balanced Workflow policy");
    expect(installer).toContain("before.registered && options.force");
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
    expect(builder).toContain("taskInput(request.prompt, spec.readImage");
    expect(builder).toContain('inputs.push({ type: "image", url:');
    expect(builder).toContain('const inject = ["attachments", "subagents", "subprocess"]');
    expect(builder).toContain('approvalPolicy: "never"');
    expect(builder).toContain('sandbox: "workspace-write"');
    expect(builder).not.toContain('runtimeWorkspaceRoots: [cwd]');
    expect(builder).toContain('exclude_tmpdir_env_var: true');
    expect(builder).toContain('exclude_slash_tmp: true');
    expect(builder).toContain('writable_roots: []');
    expect(builder).not.toContain('sandbox: "danger-full-access"');
  });

  it("does not start a companion admin server", () => {
    expect(launcher).not.toContain("startDeepSeeAdminServer");
    expect(launcher).not.toContain("OPENDS_ADMIN_PORT");
    expect(launcher).not.toContain("3091");
  });

  it("uses the shared Harness home by default and names isolated development explicitly", () => {
    expect(manifest.scripts["start:web"]).not.toContain("--local-home");
    expect(manifest.scripts["start:headless"]).not.toContain("--local-home");
    expect(manifest.scripts["start:web:isolated"]).toContain("--local-home");
    expect(manifest.scripts["start:headless:isolated"]).toContain("--local-home");
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

  it("falls back across independent OCR download transports without skipping digest verification", () => {
    expect(downloadFallback).toContain("for (const strategy of strategies)");
    expect(downloadFallback).toContain("下载结果为空");
    expect(mineruWorker).toContain("downloadWithFallback");
    expect(mineruWorker).toContain("resolvePortableUvRelease");
    expect(pythonOcrWorker).toContain("downloadWithFallback");
    expect(pythonOcrWorker).toContain("resolvePortableUvRelease");
    expect(mineruWorker).toContain("verifySha256");
    expect(pythonOcrWorker).toContain('createHash("sha256")');
    expect(pythonOcrWorker).toContain("SHA-256 校验失败");
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
    expect(manifest.scripts["update:live-smoke"]).toBe("node ./scripts/update-live-smoke.mjs");
    expect(updateLiveSmoke).toContain('for (const profile of ["web", "headless"])');
    expect(updateLiveSmoke).toContain('status.status !== "restart-required"');
  });

  it("keeps the local OCR protocol UTF-8 on Windows consoles", () => {
    expect(ocrRunner).toContain('sys.stdout.reconfigure(encoding="utf-8"');
    expect(ocrSource).toContain('PYTHONIOENCODING: "utf-8"');
  });
});
