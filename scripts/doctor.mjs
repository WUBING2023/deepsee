#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrateLegacyConnections, scrubLegacyDotEnv } from "./model-connections.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dshHome = process.env.DSH_HOME || join(process.env.USERPROFILE || process.env.HOME || root, ".dsh");
const stateRoot = join(dshHome, "deepsee");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function hasCommand(command) {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ".bat", ".ps1", ""] : [""];
  return (process.env.PATH ?? "").split(delimiter).some((directory) => {
    const clean = directory.replace(/^"|"$/g, "");
    return extensions.some((extension) => existsSync(join(clean, `${command}${extension}`)));
  });
}

function bundleStatus(profile) {
  const path = join(dshHome, "profiles", profile, "package.json");
  if (!existsSync(path)) return "profile not initialized";
  try {
    const profileManifest = JSON.parse(readFileSync(path, "utf8"));
    const dependency = profileManifest.dependencies?.[manifest.name];
    const active = profileManifest.dsh?.profile?.bundles?.includes(manifest.name);
    return dependency && active ? `installed (${dependency})` : "run deepsee install";
  } catch {
    return "profile manifest unreadable";
  }
}

function harnessModelStatus() {
  const settings = join(dshHome, "settings.yaml");
  return existsSync(settings) ? "native Harness settings present" : "configure in Harness Settings > Models";
}

const scrub = process.argv.includes("--scrub-legacy-secrets");
const connectionMigration = migrateLegacyConnections(stateRoot, { scrub });
const dotenvMigration = scrubLegacyDotEnv(root, { scrub });
const removed = connectionMigration.secretsRemoved + dotenvMigration.secretsRemoved;
const detected = (connectionMigration.detectedSecrets || 0) + (dotenvMigration.detectedSecrets || 0);

console.log("DeepSee plugin group doctor");
console.table([
  { check: "Node.js", status: process.version },
  { check: "pnpm", status: hasCommand("pnpm") ? "available" : "not found" },
  { check: "Built plugin", status: existsSync(join(root, "dist", "index.js")) ? "present" : "run pnpm run build:plugin" },
  { check: "Web profile", status: bundleStatus("web") },
  { check: "Headless profile", status: bundleStatus("headless") },
  { check: "Provider credentials", status: harnessModelStatus() },
  { check: "Legacy secret migration", status: removed > 0
    ? `${removed} local secret entr${removed === 1 ? "y" : "ies"} removed`
    : detected > 0 ? `${detected} inactive entr${detected === 1 ? "y" : "ies"} detected; use --scrub-legacy-secrets` : "clean" },
]);
console.log(`Components: ${(manifest.deepsee?.pluginGroup?.components || []).map((item) => item.id).join(", ") || "manifest missing"}`);
console.log(`DSH_HOME: ${dshHome}`);
console.log("DeepSee never reads or prints provider keys. Credential changes are made only in Harness Settings > Models.");
