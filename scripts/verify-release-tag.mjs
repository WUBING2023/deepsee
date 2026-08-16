#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const contract = JSON.parse(readFileSync(join(root, "product-release.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const expectedTag = contract.release.tagTemplate.replaceAll("{version}", contract.product.version);
const actualTag = process.env.GITHUB_REF_NAME || process.argv[2] || "";

if (manifest.version !== contract.product.version) throw new Error("Package and release contract versions disagree.");
if (actualTag && actualTag !== expectedTag) throw new Error(`Expected tag ${expectedTag}, got ${actualTag}.`);

const notesPath = contract.release.notesPathTemplate.replaceAll("{version}", contract.product.version);
if (!existsSync(join(root, notesPath))) throw new Error(`Release notes not found: ${notesPath}`);

console.log(JSON.stringify({ ok: true, version: contract.product.version, tag: expectedTag, notesPath }, null, 2));
