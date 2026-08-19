import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installPrimePreset } from "./prime-preset.mjs";

const roots = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "deepsee-prime-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("DeepSee Prime balanced Workflow policy", () => {
  it("prefers Workflow for two independent streams and multi-model comparison without requiring vision", () => {
    const root = fixture();
    installPrimePreset(root, { hasReadyVision: false, autoWorkflow: true });
    const composition = readFileSync(join(root, ".agent-presets", "prime", "agent.cordis.yml"), "utf8");

    expect(composition).toContain("two or more genuinely independent workstreams");
    expect(composition).toContain("explicit comparison between models or approaches");
    expect(composition).toContain("use different enabled model routes when at least two suitable routes are available");
    expect(composition).toContain("read targeted ranges or diffs instead of rereading whole files");
    expect(composition).toContain("after two failed retries on the same check reassess the root cause");
    expect(composition).toContain("must not disable text, code, research, or document Workflows");
    expect(composition).not.toContain("three or more independent workstreams");
  });

  it("keeps automatic orchestration off when the user disables it", () => {
    const root = fixture();
    installPrimePreset(root, { hasReadyVision: true, autoWorkflow: false });
    const composition = readFileSync(join(root, ".agent-presets", "prime", "agent.cordis.yml"), "utf8");

    expect(composition).toContain("Automatic Workflow selection is disabled");
  });
});
