import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  disableVisionSelection,
  enableVisionSelection,
  readBridgeState,
} from "./model-selection.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const statePath = join(root, ".opends-bridge.json");
const legacyStatePath = join(root, ".opends-runtime-hub.json");
const dshHome = process.env.DSH_HOME ?? join(root, ".dsh");
const settingsPath = join(dshHome, "settings.yaml");
const action = process.argv[2] ?? "status";

function readStateFile(path) {
  if (!existsSync(path)) return null;
  try {
    const state = readBridgeState(path);
    return { ...state, enabled: state.enabled !== false };
  } catch {
    return null;
  }
}

function readState() {
  return readStateFile(statePath) ?? readStateFile(legacyStatePath) ?? { enabled: true };
}

if (action === "enable" || action === "install") {
  const selected = enableVisionSelection(settingsPath, statePath);
  console.log("DeepSee Bridge: enabled");
  console.log("Default model: " + selected.provider + " / " + selected.model);
} else if (action === "disable" || action === "uninstall") {
  const restored = disableVisionSelection(settingsPath, statePath);
  console.log("DeepSee Bridge: disabled (configuration preserved)");
  console.log("Default model restored: " + restored.provider + " / " + restored.model);
} else if (action === "status") {
  console.log(`DeepSee Bridge: ${readState().enabled ? "enabled" : "disabled"}`);
  console.log(`State: ${statePath}`);
} else {
  console.error("Usage: opends-bridge <enable|disable|status>");
  process.exitCode = 2;
}
