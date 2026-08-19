import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { pluginGroupPackages, readPluginGroup, removeOwnedPrimePreset } from "./plugin-group.mjs";

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("plugin group", () => {
  it("publishes reusable components behind one atomic package", () => {
    const manifest = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8"));
    const group = readPluginGroup(manifest);
    expect(group.installMode).toBe("atomic");
    expect(group.components.map((component) => component.id)).toEqual([
      "deepsee-core", "deepsee-codex", "deepsee-client", "deepsee-workflow-policy",
    ]);
    expect(pluginGroupPackages(manifest)).toContain("@wubing2023/deepsee");
  });

  it("removes only a Prime preset explicitly owned by DeepSee", () => {
    const dshHome = mkdtempSync(join(tmpdir(), "deepsee-group-"));
    roots.push(dshHome);
    const preset = join(dshHome, ".agent-presets", "prime");
    mkdirSync(preset, { recursive: true });
    writeFileSync(join(preset, "preset.yml"), "name: user preset\n");
    expect(removeOwnedPrimePreset(dshHome)).toBe(false);
    writeFileSync(join(preset, ".deepsee-owner.json"), JSON.stringify({ owner: "@wubing2023/deepsee" }));
    expect(removeOwnedPrimePreset(dshHome)).toBe(true);
  });
});
