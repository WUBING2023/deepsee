import { accessSync, constants, existsSync, statSync } from "node:fs";
import { posix, win32 } from "node:path";

function pathApi(platform) {
  return platform === "win32" ? win32 : posix;
}

function cleanDirectory(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) return trimmed.slice(1, -1);
  return trimmed;
}

/** Build deterministic candidates without spawning `where.exe` or `which`. */
export function executableCandidates(command, options = {}) {
  const platform = options.platform ?? process.platform;
  const paths = pathApi(platform);
  const pathValue = options.pathValue ?? process.env.PATH ?? process.env.Path ?? "";
  const directories = pathValue.split(paths.delimiter).map(cleanDirectory).filter(Boolean);
  const hasExtension = paths.extname(command).length > 0;
  const suffixes = platform === "win32" && !hasExtension
    ? [
        ...(options.pathExtValue ?? process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM;.PS1")
          .split(";")
          .map((item) => item.trim())
          .filter(Boolean),
        "",
      ]
    : [""];

  const candidates = [];
  const seen = new Set();
  for (const directory of directories) {
    for (const suffix of suffixes) {
      const candidate = paths.join(directory, `${command}${suffix}`);
      const key = platform === "win32" ? candidate.toLowerCase() : candidate;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }
  }
  return candidates;
}

/** Locate an executable using filesystem checks only, safe inside restricted hosts. */
export function findExecutable(command, options = {}) {
  const platform = options.platform ?? process.platform;
  for (const candidate of executableCandidates(command, options)) {
    try {
      if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
      if (platform !== "win32") accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Broken, inaccessible and stale PATH entries are ordinary scan misses.
    }
  }
  return undefined;
}
