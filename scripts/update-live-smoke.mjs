#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkDeepSeeUpdate,
  getDeepSeeUpdateStatus,
  startDeepSeeUpdate,
} from "./update-manager.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const keep = process.argv.includes("--keep");
const scratchParent = join(root, ".tmp-update-live");
mkdirSync(scratchParent, { recursive: true });
const scratch = mkdtempSync(join(scratchParent, "run-"));
const stateRoot = join(scratch, "state");
const dshHome = join(scratch, "dsh");
const installedPackage = join(scratch, "installed-package");
mkdirSync(stateRoot, { recursive: true });
mkdirSync(dshHome, { recursive: true });
mkdirSync(installedPackage, { recursive: true });

function previousPrereleaseVersion(version) {
  const match = version.match(/^(\d+\.\d+\.\d+-[0-9A-Za-z.-]*?)(\d+)$/);
  if (!match || Number(match[2]) <= 0) {
    throw new Error(`Cannot derive a previous smoke-test version from ${version}.`);
  }
  return `${match[1]}${Number(match[2]) - 1}`;
}

function readWorkerLog(name) {
  const target = join(stateRoot, ".opends-update", name);
  return existsSync(target) ? readFileSync(target, "utf8").trim() : "";
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

const previousVersion = previousPrereleaseVersion(manifest.version);
writeFileSync(join(installedPackage, "package.json"), `${JSON.stringify({
  ...manifest,
  version: previousVersion,
}, null, 2)}\n`, "utf8");

let succeeded = false;
try {
  console.log(`[DeepSee live update smoke] ${previousVersion} -> ${manifest.version}`);
  const available = await checkDeepSeeUpdate(stateRoot, installedPackage, { timeoutMs: 30_000 });
  if (available.status !== "available" || available.latestVersion !== manifest.version) {
    throw new Error(`Published update was not discovered: ${JSON.stringify(available)}`);
  }

  const started = startDeepSeeUpdate(stateRoot, installedPackage, dshHome);
  if (started.status !== "updating") {
    throw new Error(`Updater did not start: ${JSON.stringify(started)}`);
  }

  const deadline = Date.now() + 20 * 60_000;
  let status = started;
  while (Date.now() < deadline) {
    await sleep(1_000);
    status = getDeepSeeUpdateStatus(stateRoot, installedPackage);
    if (!["updating", "checking"].includes(status.status)) break;
  }
  if (status.status !== "restart-required") {
    const stdout = readWorkerLog("update.stdout.log");
    const stderr = readWorkerLog("update.stderr.log");
    throw new Error([
      `Updater did not finish successfully: ${JSON.stringify(status)}`,
      stdout ? `stdout:\n${stdout}` : "",
      stderr ? `stderr:\n${stderr}` : "",
    ].filter(Boolean).join("\n"));
  }

  const profiles = {};
  for (const profile of ["web", "headless"]) {
    const packageManifest = join(dshHome, "profiles", profile, "node_modules", "@wubing2023", "deepsee", "package.json");
    if (!existsSync(packageManifest)) throw new Error(`${profile} profile did not install DeepSee.`);
    const installed = JSON.parse(readFileSync(packageManifest, "utf8"));
    if (installed.version !== manifest.version) {
      throw new Error(`${profile} profile installed ${installed.version}, expected ${manifest.version}.`);
    }
    profiles[profile] = installed.version;
  }

  succeeded = true;
  console.log(JSON.stringify({
    ok: true,
    previousVersion,
    latestVersion: manifest.version,
    status: status.status,
    profiles,
  }, null, 2));
} finally {
  if (succeeded && !keep) {
    rmSync(scratch, { recursive: true, force: true });
    try {
      rmdirSync(scratchParent);
    } catch {
      // Preserve the parent when another smoke run or diagnostic artifact exists.
    }
  } else {
    console.log(`[DeepSee live update smoke] Evidence kept at ${scratch}`);
  }
}
