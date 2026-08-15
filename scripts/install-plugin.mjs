#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { resolveNpxInvocation } from "./npx-command.mjs";

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
const dshHome = local ? join(root, ".dsh") : process.env.DSH_HOME;
const env = { ...process.env, ...(dshHome ? { DSH_HOME: dshHome } : {}) };

if (!existsSync(join(root, "dist", "index.js"))) {
  throw new Error("DeepSee 尚未构建；请先运行 pnpm run build。");
}

function runDsh(argv) {
  const localDsh = existsSync(dshBin);
  const npx = resolveNpxInvocation(["--yes", dshSpec, ...argv]);
  const result = spawnSync(localDsh ? process.execPath : npx.command, localDsh ? [dshBin, ...argv] : npx.args, {
    cwd: process.cwd(),
    env,
    stdio: "inherit",
    windowsHide: true,
    shell: false,
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`dsh ${argv.join(" ")} failed with exit ${String(result.status)}`);
}

for (const profile of ["web", "headless"]) {
  runDsh(["plugin", "--profile", profile, "add", spec]);
}

console.log("\n深见 DeepSee 已按标准 DSH bundle 安装到 web 与 headless profile。");
console.log("配置服务已内嵌在插件 Host；不会启动独立端口或伴随进程。");
console.log("启动 Web：dsh web");
console.log("卸载但保留配置：deepsee uninstall");
