import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const DEFAULT_INSTALL_TIMEOUT_MS = 15 * 60_000;
export const DEFAULT_INSTALL_RETRIES = 1;

function optionValue(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} requires a value`);
  }
  return value;
}

export function parseNonNegativeInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return parsed;
}

export function resolveInstallOptions(args, env = process.env) {
  const timeoutValue = optionValue(args, "--timeout-ms") ?? env.DEEPSEE_INSTALL_TIMEOUT_MS;
  const retriesValue = optionValue(args, "--retries") ?? env.DEEPSEE_INSTALL_RETRIES;
  const profileValue = optionValue(args, "--profile") ?? "all";
  const supportedProfiles = ["web", "headless"];
  const fromFolder = args.includes("--from-folder");

  if (fromFolder && args.includes("--local")) {
    throw new Error("--from-folder cannot be combined with the development-only --local option");
  }
  if (fromFolder && args.includes("--spec")) {
    throw new Error("--from-folder cannot be combined with --spec");
  }

  if (profileValue !== "all" && !supportedProfiles.includes(profileValue)) {
    throw new Error("--profile must be web, headless, or all");
  }

  return {
    timeoutMs: timeoutValue === undefined
      ? DEFAULT_INSTALL_TIMEOUT_MS
      : parseNonNegativeInteger(timeoutValue, "install timeout"),
    retries: retriesValue === undefined
      ? DEFAULT_INSTALL_RETRIES
      : parseNonNegativeInteger(retriesValue, "install retries"),
    profiles: profileValue === "all" ? supportedProfiles : [profileValue],
    force: args.includes("--force"),
    fromFolder,
  };
}

export function formatDuration(timeoutMs) {
  if (timeoutMs === 0) return "no timeout";
  if (timeoutMs % 60_000 === 0) return `${timeoutMs / 60_000} minute(s)`;
  if (timeoutMs % 1_000 === 0) return `${timeoutMs / 1_000} second(s)`;
  return `${timeoutMs} ms`;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

export function inspectProfileInstall(dshHome, profile, packageName, expectedVersion) {
  const profileRoot = join(dshHome, "profiles", profile);
  const profileManifestPath = join(profileRoot, "package.json");
  if (!existsSync(profileManifestPath)) {
    return { current: false, registered: false, reason: "profile not initialized" };
  }

  const profileManifest = readJson(profileManifestPath);
  if (!profileManifest) {
    return { current: false, registered: false, reason: "profile manifest unreadable" };
  }

  const dependency = profileManifest.dependencies?.[packageName];
  const active = profileManifest.dsh?.profile?.bundles?.includes(packageName) === true;
  const packageManifestPath = join(profileRoot, "node_modules", ...packageName.split("/"), "package.json");
  const installedManifest = existsSync(packageManifestPath) ? readJson(packageManifestPath) : undefined;
  const installedVersion = installedManifest?.version;
  const registered = Boolean(dependency && active);
  const current = registered && installedVersion === expectedVersion;

  return {
    current,
    registered,
    dependency,
    installedVersion,
    reason: current
      ? `installed (${installedVersion})`
      : registered
        ? `registered, installed version ${installedVersion ?? "unknown"}`
        : "not installed",
  };
}

export function runWithRetries(run, retries) {
  const maximumAttempts = retries + 1;
  let result;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    result = run(attempt, maximumAttempts);
    if (!result?.error && result?.status === 0) {
      return { ok: true, result, attempts: attempt };
    }
  }
  return { ok: false, result, attempts: maximumAttempts };
}

export function describeInstallFailure(profile, result, timeoutMs) {
  if (result?.error?.code === "ETIMEDOUT") {
    return [
      `${profile} profile installation exceeded ${formatDuration(timeoutMs)}.`,
      "Re-run the same command to resume; profiles already installed at this DeepSee version are skipped.",
      "For a slower machine, set DEEPSEE_INSTALL_TIMEOUT_MS to a larger value, or 0 to disable the limit.",
    ].join(" ");
  }
  if (result?.error) {
    return `${profile} profile installation could not start: ${result.error.message}`;
  }
  return `${profile} profile installation exited with code ${String(result?.status ?? "unknown")}.`;
}
