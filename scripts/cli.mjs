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

if (command === "setup") {
  await import("./setup.mjs");
} else if (command === "test") {
  await import("./test-connection.mjs");
} else if (["enable", "disable", "status"].includes(command)) {
  process.argv[2] = command;
  await import("./bridge-state.mjs");
} else if (command === "install") {
  await runManagedCommand("Installation failed / 安装失败", () => import("./install-plugin.mjs"));
} else if (command === "uninstall") {
  await runManagedCommand("Uninstall failed / 卸载失败", () => import("./uninstall-plugin.mjs"));
} else if (command === "doctor") {
  await import("./doctor.mjs");
} else if (command === "web") {
  process.argv.splice(2, 1, "web");
  await import("../host/bin.mjs");
} else if (command === "official") {
  process.argv.splice(2, 1, "--official", "web", "--port", "3081");
  await import("../host/bin.mjs");
} else {
  console.log(`DeepSee

Usage: deepsee <command>

  setup     Configure one external API locally
  test      Send one minimal request to test the API
  install   One-click install into Harness Web and Headless profiles
  uninstall Remove the plugin while preserving user configuration
  enable    Enable the bridge
  disable   Disable the bridge without deleting configuration
  status    Show bridge state
  doctor    Check local configuration without printing secrets
  web       Start DeepSeek Harness Web with the bridge
  official  Start the unmodified Harness Web baseline

Install options:
  --profile <web|headless|all>  Install selected profiles (default: all)
  --timeout-ms <milliseconds>   Per-attempt timeout; 0 disables it (default: 900000)
  --retries <count>             Automatic retry count (default: 1)
  --force                       Reinstall profiles already on this version
  --from-folder                 Install the extracted ZIP into the normal DSH_HOME

Legacy alias: opends-bridge`);
}
