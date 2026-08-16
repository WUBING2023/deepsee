import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverWorkspaceInstructions } from "./runtime-discovery.mjs";

const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deepsee-init-"));
  roots.push(root);
  mkdirSync(join(root, ".git"));
  const nested = join(root, "packages", "app");
  mkdirSync(nested, { recursive: true });
  return { root, nested };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workspace initialization discovery", () => {
  it("reports supported instruction files without returning their content", () => {
    const { root, nested } = fixture();
    writeFileSync(join(root, "CLAUDE.md"), "private project guidance");
    writeFileSync(join(nested, "AGENTS.local.md"), "more specific guidance");
    writeFileSync(join(nested, "agent.md"), "lowercase compatibility guidance");
    const result = discoverWorkspaceInstructions(nested);
    expect(result.active).toBe(true);
    expect(result.files.map((file) => file.path)).toEqual([
      "CLAUDE.md",
      "packages/app/agent.md",
      "packages/app/AGENTS.local.md",
    ]);
    expect(JSON.stringify(result)).not.toContain("private project guidance");
  });

  it("stays empty when the workspace has no instruction file", () => {
    const { nested } = fixture();
    expect(discoverWorkspaceInstructions(nested)).toMatchObject({ active: false, files: [] });
  });
});
