#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveNpxPackageInvocation } from "./npx-command.mjs";
import { DEFAULT_INSTALL_TIMEOUT_MS, parseNonNegativeInteger } from "./install-policy.mjs";
import { pluginGroupPackages, readPluginGroup, removeOwnedPrimePreset } from "./plugin-group.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dshBin = join(root, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
const dshSpec = `@deepseek-ai/dsh@${manifest.deepsee?.harnessRuntime || manifest.peerDependencies?.["@deepseek-ai/dsh"]}`;
const local = process.argv.includes("--local");
const dshHome = local ? join(root, ".dsh") : process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || homedir(), ".dsh");
const env = { ...process.env, ...(dshHome ? { DSH_HOME: dshHome } : {}) };
const timeoutValue = process.env.DEEPSEE_UNINSTALL_TIMEOUT_MS ?? process.env.DEEPSEE_INSTALL_TIMEOUT_MS;
const timeoutMs = timeoutValue === undefined
  ? DEFAULT_INSTALL_TIMEOUT_MS
  : parseNonNegativeInteger(timeoutValue, "uninstall timeout");

const group = readPluginGroup(manifest);
const packageNames = pluginGroupPackages(manifest);

for (const profile of ["web", "headless"]) {
  const profileManifest = join(dshHome, "profiles", profile, "package.json");
  if (!existsSync(profileManifest)) continue;
  const current = JSON.parse(readFileSync(profileManifest, "utf8"));
  for (const packageName of packageNames) {
    if (!current.dependencies?.[packageName]) continue;
    const localDsh = existsSync(dshBin);
    const argv = ["plugin", "--profile", profile, "remove", packageName];
    const npx = resolveNpxPackageInvocation(dshSpec, "dsh", argv);
    const result = spawnSync(localDsh ? process.execPath : npx.command, localDsh ? [dshBin, ...argv] : npx.args, {
      cwd: process.cwd(), env, stdio: "inherit", windowsHide: true, shell: false,
      ...(timeoutMs > 0 ? { timeout: timeoutMs } : {}),
    });
    if (result.error?.code === "ETIMEDOUT") throw new Error(`Timed out while removing ${packageName} from ${profile}.`);
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Could not remove ${packageName} from ${profile} (exit ${String(result.status)}).`);
  }
}

const presetRemoved = removeOwnedPrimePreset(dshHome);
console.log(`DeepSee plugin group removed (${group.components.map((component) => component.id).join(", ")}).`);
if (presetRemoved) console.log("The DeepSee-owned Prime preset was removed.");
console.log("User model metadata and OCR installations under $DSH_HOME/deepsee were preserved.");
