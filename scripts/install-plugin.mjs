#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveNpxInvocation } from "./npx-command.mjs";
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
const dshSpec = `@deepseek-ai/dsh@${manifest.peerDependencies["@deepseek-ai/dsh"]}`;
const args = process.argv.slice(2);
const local = args.includes("--local");
const specIndex = args.indexOf("--spec");
const explicitSpec = specIndex >= 0 ? args[specIndex + 1] : undefined;
const publicInstallSpec = manifest.deepsee?.installSpec || `${manifest.name}@${manifest.version}`;
const spec = explicitSpec || (local ? `file:${root}` : publicInstallSpec);
const dshHome = local
  ? join(root, ".dsh")
  : process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || homedir(), ".dsh");
const env = { ...process.env, DSH_HOME: dshHome };
const options = resolveInstallOptions(args, env);

if (!existsSync(join(root, "dist", "index.js"))) {
  throw new Error("DeepSee has not been built. Run `pnpm run build:plugin` first.");
}

function runDsh(argv, profile) {
  const localDsh = existsSync(dshBin);
  const npx = resolveNpxInvocation(["--yes", dshSpec, ...argv]);
  const command = localDsh ? process.execPath : npx.command;
  const commandArgs = localDsh ? [dshBin, ...argv] : npx.args;
  const outcome = runWithRetries((attempt, maximumAttempts) => {
    console.log(`\n[DeepSee] Installing ${profile} profile (attempt ${attempt}/${maximumAttempts}, timeout: ${formatDuration(options.timeoutMs)})...`);
    const result = spawnSync(command, commandArgs, {
      cwd: process.cwd(),
      env,
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
  }, options.retries);
  if (!outcome.ok) {
    throw new Error(describeInstallFailure(profile, outcome.result, options.timeoutMs));
  }
}

console.log(`[DeepSee] DSH_HOME: ${dshHome}`);
console.log(`[DeepSee] Profiles: ${options.profiles.join(", ")}`);

for (const profile of options.profiles) {
  const before = inspectProfileInstall(dshHome, profile, manifest.name, manifest.version);
  if (before.current && !options.force) {
    console.log(`[DeepSee] ${profile} profile already has DeepSee ${manifest.version}; skipping.`);
    continue;
  }
  runDsh(["plugin", "--profile", profile, "add", spec], profile);
  const after = inspectProfileInstall(dshHome, profile, manifest.name, manifest.version);
  if (!after.registered) {
    throw new Error(`${profile} profile command completed but DeepSee was not registered. Run the installer again with --force.`);
  }
  console.log(`[DeepSee] ${profile} profile ready (${after.installedVersion ?? after.dependency}).`);
}

console.log("\nDeepSee is installed in the selected DSH profiles.");
console.log("The configuration service is embedded in the plugin host; no companion process or port is used.");
console.log("Start Web: npx --yes github:WUBING2023/deepsee web");
console.log("Check installation: npx --yes github:WUBING2023/deepsee doctor");
console.log("Uninstall and keep settings: npx --yes github:WUBING2023/deepsee uninstall");
