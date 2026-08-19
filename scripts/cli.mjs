#!/usr/bin/env node

const command = process.argv[2] ?? "help";

async function runManagedCommand(label, load) {
  try {
    await load();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\n[DeepSee] ${label}: ${message}`);
    process.exitCode = 1;
  }
}

if (["enable", "disable", "status"].includes(command)) {
  process.argv[2] = command;
  await import("./bridge-state.mjs");
} else if (command === "install") {
  await runManagedCommand("Installation failed / 安装失败", () => import("./install-plugin.mjs"));
} else if (command === "uninstall") {
  await runManagedCommand("Uninstall failed / 卸载失败", () => import("./uninstall-plugin.mjs"));
} else if (command === "doctor") {
  await import("./doctor.mjs");
} else if (command === "group") {
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { readPluginGroup } = await import("./plugin-group.mjs");
  const root = fileURLToPath(new URL("../", import.meta.url));
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  console.table(readPluginGroup(manifest).components.map(({ id, export: exportPath, description }) => ({ id, export: exportPath, description })));
} else if (command === "web") {
  process.argv.splice(2, 1, "web");
  await import("../host/bin.mjs");
} else if (command === "official") {
  process.argv.splice(2, 1, "--official", "web", "--port", "3081");
  await import("../host/bin.mjs");
} else {
  console.log(`DeepSee

Usage: deepsee <command>

  install   One-click install into Harness Web and Headless profiles
  uninstall Remove the plugin while preserving user configuration
  enable    Enable the bridge
  disable   Disable the bridge without deleting configuration
  status    Show bridge state
  doctor    Check the plugin group and native Harness credential migration
  group     List reusable components in the installed plugin group
  web       Start DeepSeek Harness Web with the bridge
  official  Start the unmodified Harness Web baseline

Install options:
  --profile <web|headless|all>  Install selected profiles (default: all)
  --timeout-ms <milliseconds>   Per-attempt timeout; 0 disables it (default: 900000)
  --retries <count>             Automatic retry count (default: 1)
  --force                       Reinstall profiles already on this version
  --from-folder                 Install the extracted ZIP into the normal DSH_HOME

Security maintenance:
  deepsee doctor --scrub-legacy-secrets
                               Permanently remove inactive pre-alpha plaintext credentials

Legacy alias: opends-bridge`);
}
