#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveNpxInvocation } from "./npx-command.mjs";
import { DEFAULT_INSTALL_TIMEOUT_MS, parseNonNegativeInteger } from "./install-policy.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dshBin = join(root, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
const dshSpec = `@deepseek-ai/dsh@${manifest.peerDependencies["@deepseek-ai/dsh"]}`;
const local = process.argv.includes("--local");
const dshHome = local ? join(root, ".dsh") : process.env.DSH_HOME;
const env = { ...process.env, ...(dshHome ? { DSH_HOME: dshHome } : {}) };
const timeoutValue = process.env.DEEPSEE_UNINSTALL_TIMEOUT_MS ?? process.env.DEEPSEE_INSTALL_TIMEOUT_MS;
const timeoutMs = timeoutValue === undefined
  ? DEFAULT_INSTALL_TIMEOUT_MS
  : parseNonNegativeInteger(timeoutValue, "uninstall timeout");

for (const profile of ["web", "headless"]) {
  const profileManifest = join(dshHome || join(process.env.USERPROFILE || "", ".dsh"), "profiles", profile, "package.json");
  if (!existsSync(profileManifest)) continue;
  const current = JSON.parse(readFileSync(profileManifest, "utf8"));
  if (!current.dependencies?.[manifest.name]) continue;
  const localDsh = existsSync(dshBin);
  const argv = ["plugin", "--profile", profile, "remove", manifest.name];
  const npx = resolveNpxInvocation(["--yes", dshSpec, ...argv]);
  const result = spawnSync(localDsh ? process.execPath : npx.command, localDsh ? [dshBin, ...argv] : npx.args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
    shell: false,
    ...(timeoutMs > 0 ? { timeout: timeoutMs } : {}),
  });
  if (result.error?.code === "ETIMEDOUT") {
    throw new Error(`Timed out while removing DeepSee from the ${profile} profile. Set DEEPSEE_UNINSTALL_TIMEOUT_MS=0 to disable the limit.`);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Could not remove DeepSee from the ${profile} profile (exit ${String(result.status)}).`);
}

console.log("DeepSee was removed from the DSH profiles. User settings under $DSH_HOME/deepsee were preserved.");
