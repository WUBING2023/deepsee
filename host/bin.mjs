import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolveExecutableInvocation, resolveNpxInvocation } from "../scripts/npx-command.mjs";
import { findExecutable } from "../scripts/runtime-locator.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dshSpec = `@deepseek-ai/dsh@${manifest.deepsee?.harnessRuntime || manifest.peerDependencies["@deepseek-ai/dsh"]}`;
const argv = process.argv.slice(2);
const localHomeIndex = argv.indexOf("--local-home");
if (localHomeIndex !== -1) {
  process.env.DSH_HOME ??= join(root, ".dsh");
  process.argv.splice(localHomeIndex + 2, 1);
  argv.splice(localHomeIndex, 1);
}

const officialIndex = argv.indexOf("--official");
if (officialIndex !== -1) {
  process.env.DSH_HOME = join(root, ".dsh-official");
  process.argv.splice(officialIndex + 2, 1);
  argv.splice(officialIndex, 1);
}

// `dsh web` is shorthand for the Web profile but rejects parent-launcher
// flags. Expand it before handing control to the official CLI.
if (argv[0] === "web") {
  process.argv.splice(2, 1, "--profile", "web");
}

const localDsh = join(root, "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
if (existsSync(localDsh)) {
  await import(pathToFileURL(localDsh).href);
} else {
  const installedDsh = findExecutable("dsh");
  const invocation = installedDsh
    ? resolveExecutableInvocation(installedDsh, process.argv.slice(2))
    : resolveNpxInvocation(["--yes", "--prefer-offline", "--no-audit", "--no-fund", dshSpec, "--", ...process.argv.slice(2)]);
  const result = spawnSync(invocation.command, invocation.args, {
    env: {
      ...process.env,
      NO_UPDATE_NOTIFIER: "1",
      npm_config_update_notifier: "false",
    },
    stdio: "inherit",
    windowsHide: true,
    shell: false,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
