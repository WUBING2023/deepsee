#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveExecutableInvocation } from "./npx-command.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const contract = JSON.parse(readFileSync(join(root, "product-release.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function render(template) {
  return template
    .replaceAll("{name}", contract.product.name)
    .replaceAll("{slug}", contract.product.slug)
    .replaceAll("{version}", contract.product.version)
    .replaceAll("{channel}", contract.product.channel)
    .replaceAll("{owner}", contract.github.owner)
    .replaceAll("{repository}", contract.github.repository);
}

if (manifest.name !== "@wubing2023/deepsee") throw new Error("Unexpected package identity.");
if (manifest.version !== contract.product.version) {
  throw new Error(`package.json (${manifest.version}) and product-release.json (${contract.product.version}) disagree.`);
}

const tag = render(contract.release.tagTemplate);
const assetName = render(contract.release.assetNameTemplate);
const releaseDir = join(root, dirname(contract.release.artifactGlob));
const artifact = join(releaseDir, assetName);
const checksumFile = `${artifact}.sha256`;

mkdirSync(releaseDir, { recursive: true });
for (const name of readdirSync(releaseDir)) {
  if (/^deepsee-.*\.tgz(?:\.sha256)?$/i.test(name)) unlinkSync(join(releaseDir, name));
}

const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const relativeArtifact = `release/${assetName}`;
const packInvocation = resolveExecutableInvocation(pnpm, ["pack", "--out", relativeArtifact]);
const packed = spawnSync(packInvocation.command, packInvocation.args, {
  cwd: root,
  encoding: "utf8",
  stdio: "inherit",
});
if (packed.error) throw packed.error;
if (packed.status !== 0 || !existsSync(artifact)) {
  throw new Error(`pnpm pack failed with exit code ${packed.status ?? "unknown"}.`);
}

const bytes = readFileSync(artifact);
const sha256 = createHash("sha256").update(bytes).digest("hex");
writeFileSync(checksumFile, `${sha256}  ${assetName}\n`, "utf8");

const releaseBase = `${contract.github.releaseBaseUrl}/download/${tag}`;
const publicPackageSpec = `${releaseBase}/${assetName}`;
const websiteManifest = {
  version: contract.product.version,
  channel: contract.product.channel,
  tag,
  assetName,
  sizeBytes: statSync(artifact).size,
  sha256,
  downloadUrl: `${releaseBase}/${assetName}`,
  sha256Url: `${releaseBase}/${assetName}.sha256`,
  releaseUrl: `${contract.github.releaseBaseUrl}/tag/${tag}`,
  sourceUrl: `${contract.github.sourceUrl}/tree/${tag}`,
  installCommand: `npm exec --yes --package=${publicPackageSpec} -- deepsee install`,
  requirements: {
    node: manifest.engines.node,
    harness: manifest.deepsee.harnessRuntime,
    platforms: ["Windows", "macOS", "Linux"]
  },
  license: contract.product.license,
  generatedAt: new Date().toISOString(),
};
const websiteManifestPath = join(root, contract.website.manifestPath);
mkdirSync(dirname(websiteManifestPath), { recursive: true });
writeFileSync(websiteManifestPath, `${JSON.stringify(websiteManifest, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ artifact: relativeArtifact, sha256, sizeBytes: bytes.length }, null, 2));
