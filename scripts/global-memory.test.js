import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadGlobalMemory, publicGlobalMemory } from "./global-memory.mjs";

const roots = [];

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function fixture() {
  const root = join(process.cwd(), `.tmp-global-memory-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  roots.push(root);
  mkdirSync(join(root, ".claude"), { recursive: true });
  mkdirSync(join(root, ".codex"), { recursive: true });
  mkdirSync(join(root, ".dsh"), { recursive: true });
  return root;
}

describe("global user memory", () => {
  it("imports Claude and Codex memory while leaving Harness native memory unduplicated", () => {
    const home = fixture();
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "CLAUDE_MEMORY_SENTINEL\n", "utf8");
    writeFileSync(join(home, ".codex", "AGENTS.md"), "CODEX_MEMORY_SENTINEL\n", "utf8");
    writeFileSync(join(home, ".dsh", "AGENTS.md"), "HARNESS_NATIVE_SENTINEL\n", "utf8");

    const memory = loadGlobalMemory({ home, dshHome: join(home, ".dsh") });
    expect(memory.imported).toBe(2);
    expect(memory.prompt).toContain("CLAUDE_MEMORY_SENTINEL");
    expect(memory.prompt).toContain("CODEX_MEMORY_SENTINEL");
    expect(memory.prompt).not.toContain("HARNESS_NATIVE_SENTINEL");
    expect(memory.files.find((file) => file.source === "DeepSeek Harness")).toMatchObject({ native: true });
  });

  it("deduplicates identical memory and never exposes its text in public state", () => {
    const home = fixture();
    writeFileSync(join(home, ".claude", "CLAUDE.md"), "PRIVATE_MEMORY_SENTINEL\n", "utf8");
    writeFileSync(join(home, ".codex", "AGENTS.md"), "PRIVATE_MEMORY_SENTINEL\n", "utf8");

    const memory = loadGlobalMemory({ home });
    expect(memory.imported).toBe(1);
    expect(JSON.stringify(publicGlobalMemory(memory))).not.toContain("PRIVATE_MEMORY_SENTINEL");
  });

  it("does not expose an absolute custom config path outside the user home", () => {
    const home = fixture();
    const external = `${home}-external`;
    roots.push(external);
    mkdirSync(external, { recursive: true });
    writeFileSync(join(external, "CLAUDE.md"), "EXTERNAL_MEMORY_SENTINEL\n", "utf8");

    const state = publicGlobalMemory(loadGlobalMemory({ home, claudeHome: external }));
    expect(state.files[0]?.path).toBe("CLAUDE.md");
    expect(state.files[0]?.path).not.toContain(home);
  });
});
