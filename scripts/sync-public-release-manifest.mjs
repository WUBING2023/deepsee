#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = process.cwd();
const artifact = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Usage: sync-public-release-manifest <downloaded-release-artifact>");
const contract = JSON.parse(readFileSync(join(root, "product-release.json"), "utf8"));
const manifestPath = join(root, contract.website.manifestPath);
const website = JSON.parse(readFileSync(manifestPath, "utf8"));
const assetName = basename(artifact);
const expectedAsset = contract.release.assetNameTemplate.replaceAll("{version}", contract.product.version);
if (assetName !== expectedAsset) throw new Error(`Unexpected public release asset: ${assetName}`);

const checksumLine = readFileSync(`${artifact}.sha256`, "utf8").trim();
const expected = checksumLine.split(/\s+/)[0]?.toLowerCase();
const actual = createHash("sha256").update(readFileSync(artifact)).digest("hex");
if (!expected || expected !== actual) throw new Error("The public Release checksum does not match its asset.");

const next = {
  ...website,
  version: contract.product.version,
  tag: `v${contract.product.version}`,
  assetName,
  sizeBytes: statSync(artifact).size,
  sha256: actual,
  verifiedPublicReleaseAt: new Date().toISOString(),
};
writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ok: true, assetName, sha256: actual, sizeBytes: next.sizeBytes }));
