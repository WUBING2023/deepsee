#!/usr/bin/env node

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const contract = JSON.parse(readFileSync(join(root, "product-release.json"), "utf8"));
const releaseDir = join(root, "release");
const artifacts = readdirSync(releaseDir).filter((name) => /^deepsee-.*\.tgz$/i.test(name));
if (artifacts.length !== 1) throw new Error(`Expected one DeepSee artifact, found ${artifacts.length}.`);

const artifactName = artifacts[0];
const artifact = join(releaseDir, artifactName);
const checksumFile = `${artifact}.sha256`;
const expectedName = contract.release.assetNameTemplate.replaceAll("{version}", contract.product.version);
if (artifactName !== expectedName) throw new Error(`Expected ${expectedName}, got ${artifactName}.`);

const digest = createHash("sha256").update(readFileSync(artifact)).digest("hex");
const checksum = readFileSync(checksumFile, "utf8").trim();
if (checksum !== `${digest}  ${artifactName}`) throw new Error("Release checksum does not match the artifact.");

const scratch = mkdtempSync(join(tmpdir(), "deepsee-release-smoke-"));
try {
  const extracted = spawnSync("tar", ["-xzf", artifact, "-C", scratch], { encoding: "utf8" });
  if (extracted.error) throw extracted.error;
  if (extracted.status !== 0) throw new Error(extracted.stderr || "Unable to extract release artifact.");

  const packageRoot = join(scratch, "package");
  const packagedManifest = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8"));
  if (packagedManifest.name !== "@wubing2023/deepsee") throw new Error("Packaged name is incorrect.");
  if (packagedManifest.version !== contract.product.version) throw new Error("Packaged version is incorrect.");

  for (const required of [
    "dist/index.js",
    "host/client.js",
    "scripts/cli.mjs",
    "scripts/install-plugin.mjs",
    "cordis.patch.yml",
    "README.md",
    "README.zh-CN.md",
    "LICENSE",
  ]) {
    if (!existsSync(join(packageRoot, required))) throw new Error(`Release artifact is missing ${required}.`);
  }

  const cli = spawnSync(process.execPath, [join(packageRoot, "scripts", "cli.mjs"), "help"], {
    cwd: packageRoot,
    encoding: "utf8",
  });
  if (cli.error) throw cli.error;
  if (cli.status !== 0 || !/DeepSee[\s\S]*install[\s\S]*web/.test(cli.stdout)) {
    throw new Error(`Packaged CLI smoke test failed.\n${cli.stdout}\n${cli.stderr}`);
  }

  const websiteManifest = JSON.parse(readFileSync(join(root, contract.website.manifestPath), "utf8"));
  if (websiteManifest.version !== contract.product.version || websiteManifest.sha256 !== digest) {
    throw new Error("Website release manifest does not match the packaged candidate.");
  }
  for (const field of ["downloadUrl", "sha256Url", "releaseUrl", "sourceUrl"]) {
    const url = new URL(websiteManifest[field]);
    if (url.protocol !== "https:" || !["github.com"].includes(url.hostname)) {
      throw new Error(`Untrusted ${field}: ${websiteManifest[field]}`);
    }
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, artifact: artifactName, sha256: digest }, null, 2));
