#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { stageFolderPackage } from "./folder-install.mjs";
import { resolveExecutableInvocation, resolveNpxInvocation } from "./npx-command.mjs";
import { findExecutable } from "./runtime-locator.mjs";
import {
  describeInstallFailure,
  formatDuration,
  inspectProfileInstall,
  resolveInstallOptions,
  runWithRetries,
} from "./install-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dshBin = join(root, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
const dshSpec = `@deepseek-ai/dsh@${manifest.deepsee?.harnessRuntime || manifest.peerDependencies["@deepseek-ai/dsh"]}`;
const args = process.argv.slice(2);
const local = args.includes("--local");
const specIndex = args.indexOf("--spec");
const explicitSpec = specIndex >= 0 ? args[specIndex + 1] : undefined;
const publicInstallSpec = manifest.deepsee?.installSpec || `${manifest.name}@${manifest.version}`;
const legacyPackageAliases = Array.isArray(manifest.deepsee?.legacyPackageAliases)
  ? manifest.deepsee.legacyPackageAliases.filter((value) => typeof value === "string" && value.trim())
  : [];
const dshHome = local
  ? join(root, ".dsh")
  : process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || homedir(), ".dsh");
const env = {
  ...process.env,
  DSH_HOME: dshHome,
  NO_UPDATE_NOTIFIER: "1",
  npm_config_update_notifier: "false",
};
const options = resolveInstallOptions(args, env);

function resolveProfileStoreDir(profile) {
  const modulesMetadata = join(dshHome, "profiles", profile, "node_modules", ".modules.yaml");
  if (!existsSync(modulesMetadata)) return undefined;
  const source = readFileSync(modulesMetadata, "utf8");
  try {
    const parsed = JSON.parse(source);
    if (typeof parsed.storeDir === "string" && parsed.storeDir.trim()) return parsed.storeDir;
  } catch {
    // pnpm has emitted both JSON and YAML variants of this file across releases.
  }
  const yamlStoreDir = source.match(/^storeDir:\s*["']?(.+?)["']?\s*$/m)?.[1]?.trim();
  return yamlStoreDir || undefined;
}

function profileUsesPackage(profile, packageName) {
  const profileManifest = join(dshHome, "profiles", profile, "package.json");
  if (!existsSync(profileManifest)) return false;
  try {
    const profilePackage = JSON.parse(readFileSync(profileManifest, "utf8"));
    return Boolean(profilePackage.dependencies?.[packageName])
      || profilePackage.dsh?.profile?.bundles?.includes(packageName) === true;
  } catch {
    return false;
  }
}

if (!existsSync(join(root, "dist", "index.js"))) {
  throw new Error("DeepSee has not been built. Run `pnpm run build:plugin` first.");
}

const stagedFolder = options.fromFolder
  ? stageFolderPackage(root, dshHome, manifest, { replace: options.force })
  : undefined;
const spec = explicitSpec || (stagedFolder ? `file:${stagedFolder}` : local ? `file:${root}` : publicInstallSpec);

function resolveDshRunners(argv) {
  const localDsh = existsSync(dshBin);
  const npx = resolveNpxInvocation(["--yes", "--prefer-offline", "--no-audit", "--no-fund", dshSpec, "--", ...argv]);
  if (localDsh) {
    return [{ label: "bundled DSH CLI", command: process.execPath, args: [dshBin, ...argv] }];
  }
  const runners = [];
  if (options.fromFolder) {
    const installedDsh = findExecutable("dsh");
    if (installedDsh) {
      runners.push({ label: "existing DSH CLI", ...resolveExecutableInvocation(installedDsh, argv) });
    }
  }
  runners.push({ label: `pinned ${dshSpec}`, command: npx.command, args: npx.args });
  return runners;
}

function runDsh(argv, profile, actionLabel = `Installing ${profile} profile`) {
  const runners = resolveDshRunners(argv);
  const profileStoreDir = resolveProfileStoreDir(profile);
  const profileEnv = profileStoreDir
    ? { ...env, pnpm_config_store_dir: profileStoreDir }
    : env;
  if (profileStoreDir) {
    console.log(`[DeepSee] Reusing the existing ${profile} pnpm store: ${profileStoreDir}`);
  }
  let finalOutcome;
  for (let runnerIndex = 0; runnerIndex < runners.length; runnerIndex += 1) {
    const runner = runners[runnerIndex];
    const isLastRunner = runnerIndex === runners.length - 1;
    const retries = isLastRunner ? options.retries : 0;
    const outcome = runWithRetries((attempt, maximumAttempts) => {
      console.log(`\n[DeepSee] ${actionLabel} with ${runner.label} (attempt ${attempt}/${maximumAttempts}, timeout: ${formatDuration(options.timeoutMs)})...`);
      const result = spawnSync(runner.command, runner.args, {
        cwd: process.cwd(),
        env: profileEnv,
        stdio: "inherit",
        windowsHide: true,
        shell: false,
        ...(options.timeoutMs > 0 ? { timeout: options.timeoutMs } : {}),
      });
      if ((result.error || result.status !== 0) && attempt < maximumAttempts) {
        console.warn(`[DeepSee] ${describeInstallFailure(profile, result, options.timeoutMs)}`);
        console.warn("[DeepSee] Retrying safely with the same idempotent DSH plugin command...");
      }
      return result;
    }, retries);
    if (outcome.ok) return;
    finalOutcome = outcome;
    if (!isLastRunner) {
      console.warn(`[DeepSee] Existing DSH CLI did not complete the install; falling back to ${runners[runnerIndex + 1].label}.`);
    }
  }
  throw new Error(describeInstallFailure(profile, finalOutcome?.result, options.timeoutMs));
}

console.log(`[DeepSee] DSH_HOME: ${dshHome}`);
console.log(`[DeepSee] Profiles: ${options.profiles.join(", ")}`);
if (stagedFolder) console.log(`[DeepSee] ZIP package staged at: ${stagedFolder}`);

for (const profile of options.profiles) {
  for (const legacyPackage of legacyPackageAliases) {
    if (!profileUsesPackage(profile, legacyPackage)) continue;
    runDsh(
      ["plugin", "--profile", profile, "remove", legacyPackage],
      profile,
      `Removing legacy package alias ${legacyPackage} from ${profile}`,
    );
    console.log(`[DeepSee] Removed legacy package alias ${legacyPackage} from ${profile}.`);
  }
  const before = inspectProfileInstall(dshHome, profile, manifest.name, manifest.version);
  if (before.current && !options.force) {
    console.log(`[DeepSee] ${profile} profile already has DeepSee ${manifest.version}; skipping.`);
    continue;
  }
  if (before.registered && options.force) {
    runDsh(
      ["plugin", "--profile", profile, "remove", manifest.name],
      profile,
      `Refreshing ${profile} profile`,
    );
  }
  runDsh(["plugin", "--profile", profile, "add", spec], profile);
  const after = inspectProfileInstall(dshHome, profile, manifest.name, manifest.version);
  if (!after.current) {
    throw new Error(`${profile} profile command completed but DeepSee ${manifest.version} was not activated (found ${after.installedVersion ?? after.dependency ?? "nothing"}). Re-run the same command to resume safely.`);
  }
  console.log(`[DeepSee] ${profile} profile ready (${after.installedVersion ?? after.dependency}).`);
}

console.log("\nDeepSee is installed in the selected DSH profiles.");
console.log("The configuration service is embedded in the plugin host; no companion process or port is used.");
if (stagedFolder) {
  const stagedCli = join(stagedFolder, "scripts", "cli.mjs");
  console.log(`Start Web: node "${stagedCli}" web`);
  console.log(`Check installation: node "${stagedCli}" doctor`);
  console.log(`Uninstall and keep settings: node "${stagedCli}" uninstall`);
} else {
  console.log("Start Web: npx --yes github:WUBING2023/deepsee web");
  console.log("Check installation: npx --yes github:WUBING2023/deepsee doctor");
  console.log("Uninstall and keep settings: npx --yes github:WUBING2023/deepsee uninstall");
}
