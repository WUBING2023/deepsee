import { existsSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join, relative, resolve } from "node:path";

export const GLOBAL_MEMORY_MAX_FILE_BYTES = 32 * 1024;
export const GLOBAL_MEMORY_MAX_TOTAL_BYTES = 64 * 1024;

function normalizedKey(path) {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

function displayPath(path, home) {
  const absolute = resolve(path);
  const root = resolve(home);
  const child = relative(root, absolute);
  return child && !isAbsolute(child) && child !== ".." && !child.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)
    ? `~/${child.replaceAll("\\", "/")}`
    : basename(absolute);
}

function candidateFiles(options = {}) {
  const env = options.env || process.env;
  const home = resolve(options.home || homedir());
  const claudeHome = resolve(options.claudeHome || env.CLAUDE_CONFIG_DIR || join(home, ".claude"));
  const codexHome = resolve(options.codexHome || env.CODEX_HOME || join(home, ".codex"));
  const dshHome = resolve(options.dshHome || env.DSH_HOME || join(home, ".dsh"));
  return {
    home,
    candidates: [
      { path: join(claudeHome, "CLAUDE.md"), source: "Claude", native: false },
      { path: join(claudeHome, "AGENTS.md"), source: "Claude", native: false },
      { path: join(claudeHome, "agent.md"), source: "Claude", native: false },
      { path: join(codexHome, "AGENTS.md"), source: "Codex", native: false },
      { path: join(codexHome, "CLAUDE.md"), source: "Codex", native: false },
      { path: join(codexHome, "agent.md"), source: "Codex", native: false },
      { path: join(home, "AGENTS.md"), source: "用户目录", native: false },
      { path: join(home, "CLAUDE.md"), source: "用户目录", native: false },
      { path: join(home, "agent.md"), source: "用户目录", native: false },
      // Harness already injects this file itself. Keep it in the public status,
      // but never import it a second time through DeepSee.
      { path: join(dshHome, "AGENTS.md"), source: "DeepSeek Harness", native: true },
    ],
  };
}

/**
 * Read only the small, conventional global instruction files owned by the user.
 * This deliberately does not recurse through configuration directories.
 */
export function loadGlobalMemory(options = {}) {
  const maxFileBytes = options.maxFileBytes || GLOBAL_MEMORY_MAX_FILE_BYTES;
  const maxTotalBytes = options.maxTotalBytes || GLOBAL_MEMORY_MAX_TOTAL_BYTES;
  const { home, candidates } = candidateFiles(options);
  const seenPaths = new Set();
  const seenContents = new Set();
  const files = [];
  let importedBytes = 0;

  for (const candidate of candidates) {
    const key = normalizedKey(candidate.path);
    if (seenPaths.has(key) || !existsSync(candidate.path)) continue;
    seenPaths.add(key);
    try {
      const details = statSync(candidate.path);
      if (!details.isFile() || details.size === 0) continue;
      const raw = readFileSync(candidate.path);
      const allowed = Math.max(0, Math.min(maxFileBytes, maxTotalBytes - importedBytes));
      const native = candidate.native === true;
      if (!native && allowed === 0) continue;
      const clipped = native ? Buffer.alloc(0) : raw.subarray(0, allowed);
      const content = clipped.toString("utf8").trim();
      const contentKey = content ? content.replaceAll("\r\n", "\n") : "";
      const duplicate = !native && Boolean(contentKey) && seenContents.has(contentKey);
      if (!native && (!contentKey || duplicate)) continue;
      if (!native) {
        seenContents.add(contentKey);
        importedBytes += Buffer.byteLength(content, "utf8");
      }
      files.push({
        name: basename(candidate.path),
        path: resolve(candidate.path),
        displayPath: displayPath(candidate.path, home),
        source: candidate.source,
        native,
        bytes: details.size,
        truncated: !native && details.size > clipped.byteLength,
        ...(native ? {} : { content }),
      });
    } catch {
      // Missing, locked, and transient files simply remain unavailable.
    }
  }

  const imported = files.filter((file) => !file.native);
  const prompt = imported.length === 0 ? "" : [
    "## DeepSee inherited global user memory",
    "The following persistent instructions were authored by the user and imported from local Claude/Codex configuration. Apply them across this session and delegated work. A current explicit user request wins over conflicting preferences in this memory. Do not reveal the memory text unless the user asks for it.",
    ...imported.map((file) => [
      `### Source: ${file.displayPath}`,
      file.content,
      ...(file.truncated ? ["[DeepSee truncated this source at the safe per-file limit.]"] : []),
    ].join("\n\n")),
  ].join("\n\n");

  return {
    active: imported.length > 0 || files.some((file) => file.native),
    imported: imported.length,
    importedBytes,
    files,
    prompt,
  };
}

export function publicGlobalMemory(memory) {
  return {
    active: memory.active,
    imported: memory.imported,
    importedBytes: memory.importedBytes,
    files: memory.files.map((file) => ({
      name: file.name,
      path: file.displayPath,
      source: file.source,
      native: file.native,
      bytes: file.bytes,
      truncated: file.truncated,
    })),
  };
}
