import { existsSync, readFileSync, rmSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const PRIME_OWNER_FILE = ".deepsee-owner.json";

export function readPluginGroup(manifest) {
  const group = manifest?.deepsee?.pluginGroup;
  if (!group || typeof group !== "object" || !Array.isArray(group.components) || group.components.length === 0) {
    throw new Error("DeepSee plugin-group metadata is missing.");
  }
  const ids = new Set();
  for (const component of group.components) {
    if (!component?.id || !component?.export || ids.has(component.id)) {
      throw new Error("DeepSee plugin-group components must have unique ids and exports.");
    }
    ids.add(component.id);
  }
  return group;
}

export function pluginGroupPackages(manifest) {
  const group = readPluginGroup(manifest);
  return [...new Set([
    manifest.name,
    ...(manifest.deepsee?.legacyPackageAliases || []),
    ...(group.legacyPackages || []),
  ].filter((value) => typeof value === "string" && value.trim()))];
}

export function removeOwnedPrimePreset(dshHome) {
  const presetsRoot = resolve(dshHome, ".agent-presets");
  const destination = resolve(presetsRoot, "prime");
  const boundary = relative(presetsRoot, destination);
  if (!boundary || boundary.startsWith("..") || isAbsolute(boundary)) {
    throw new Error("Refusing to remove a preset outside DSH_HOME/.agent-presets.");
  }
  const marker = join(destination, PRIME_OWNER_FILE);
  if (!existsSync(marker)) return false;
  try {
    const owner = JSON.parse(readFileSync(marker, "utf8"));
    if (owner?.owner !== "@wubing2023/deepsee") return false;
  } catch {
    return false;
  }
  rmSync(destination, { recursive: true, force: true });
  return true;
}
