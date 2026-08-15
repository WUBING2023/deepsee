import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
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
  const result = spawnSync("dsh", process.argv.slice(2), {
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    shell: process.platform === "win32",
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
