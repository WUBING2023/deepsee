#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dshBin = join(root, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
const local = process.argv.includes("--local");
const dshHome = local ? join(root, ".dsh") : process.env.DSH_HOME;
const env = { ...process.env, ...(dshHome ? { DSH_HOME: dshHome } : {}) };

for (const profile of ["web", "headless"]) {
  const profileManifest = join(dshHome || join(process.env.USERPROFILE || "", ".dsh"), "profiles", profile, "package.json");
  if (!existsSync(profileManifest)) continue;
  const current = JSON.parse(readFileSync(profileManifest, "utf8"));
  if (!current.dependencies?.[manifest.name]) continue;
  const localDsh = existsSync(dshBin);
  const argv = ["plugin", "--profile", profile, "remove", manifest.name];
  const result = spawnSync(localDsh ? process.execPath : "dsh", localDsh ? [dshBin, ...argv] : argv, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
    shell: !localDsh && process.platform === "win32",
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`无法从 ${profile} profile 卸载 DeepSee。`);
}

console.log("深见 DeepSee 已从 DSH profile 卸载；$DSH_HOME/deepsee 中的用户配置仍然保留。");
