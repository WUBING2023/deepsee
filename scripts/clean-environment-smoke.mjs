import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stageFolderPackage } from "./folder-install.mjs";
import { migrateLegacyConnections } from "./model-connections.mjs";
import { getOCRDefinition, OCR_TOOL_IDS } from "./ocr-catalog.mjs";
import { publicManagedRuntimeCatalog } from "./runtime-catalog.mjs";
import { readPluginGroup } from "./plugin-group.mjs";

const root = process.cwd();
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const sandbox = mkdtempSync(join(tmpdir(), "deepsee-clean-smoke-"));

try {
  const dshHome = join(sandbox, ".dsh");
  const staged = stageFolderPackage(root, dshHome, manifest, { replace: true });
  if (!existsSync(join(staged, "dist", "index.js"))) throw new Error("folder install did not stage the built core plugin");
  if (stageFolderPackage(root, dshHome, manifest) !== staged) throw new Error("folder install is not idempotent");

  const state = join(dshHome, "deepsee");
  writeFileSync(join(state, ".opends-connections.json"), JSON.stringify({
    version: 1,
    connections: [{ provider: "fixture", model: "fixture", apiKey: "fixture-secret" }],
  }));
  const detected = migrateLegacyConnections(state);
  if (detected.detectedSecrets !== 1 || detected.secretsRemoved !== 0) throw new Error("legacy secrets were not detected safely");
  const scrubbed = migrateLegacyConnections(state, { scrub: true });
  if (scrubbed.secretsRemoved !== 1) throw new Error("explicit legacy-secret scrub failed");
  if (readFileSync(join(state, ".opends-connections.json"), "utf8").includes("fixture-secret")) throw new Error("legacy secret remained after explicit scrub");

  const group = readPluginGroup(manifest);
  if (group.components.length < 4) throw new Error("plugin group is incomplete");
  if (!OCR_TOOL_IDS.every((id) => getOCRDefinition(id)?.id === id)) throw new Error("OCR catalog is incomplete");
  if (!Array.isArray(publicManagedRuntimeCatalog(process.env, process.platform))) throw new Error("Runtime catalog failed");

  console.log(JSON.stringify({
    ok: true,
    platform: process.platform,
    version: manifest.version,
    pluginComponents: group.components.map((component) => component.id),
    ocrInstallers: OCR_TOOL_IDS,
    staged,
  }, null, 2));
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
