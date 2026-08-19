import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listExecutionTraces, recordExecutionTrace, resetExecutionTraceForTests, resolveExecutionArtifact } from "./execution-trace.mjs";

const roots = [];

function fixture() {
  const root = join(process.cwd(), ".tmp-trace-tests", String(Date.now()), String(Math.random()).slice(2));
  const workspace = join(root, "workspace");
  mkdirSync(workspace, { recursive: true });
  roots.push(root);
  resetExecutionTraceForTests(root);
  return { root, workspace };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("execution trace store", () => {
  it("merges reasoning summary deltas and exposes workspace artifacts", () => {
    const { workspace } = fixture();
    const poster = join(workspace, "poster.png");
    writeFileSync(poster, "png");
    const common = { childId: "child-1", parentSessionId: "parent", provider: "codex", model: "gpt-test", cwd: workspace };
    recordExecutionTrace({ ...common, type: "run.started", title: "Codex started" });
    recordExecutionTrace({ ...common, type: "agent.summary", eventId: "reason-1", append: true, summary: "分析需求" });
    recordExecutionTrace({ ...common, type: "agent.summary", eventId: "reason-1", append: true, summary: "并生成海报" });
    recordExecutionTrace({ ...common, type: "run.completed", summary: "已生成 `poster.png`", output: "交付 `poster.png`" });

    const [trace] = listExecutionTraces(["child-1"]);
    expect(trace.status).toBe("completed");
    expect(trace.events.find((event) => event.id === "reason-1").summary).toBe("分析需求并生成海报");
    expect(trace.artifacts).toEqual([expect.objectContaining({ name: "poster.png", relativePath: "poster.png" })]);
    expect(resolveExecutionArtifact("child-1", trace.artifacts[0].id)?.path).toBe(poster);
  });

  it("does not expose files outside the delegated workspace", () => {
    const { root, workspace } = fixture();
    const outside = join(root, "outside.pdf");
    writeFileSync(outside, "pdf");
    recordExecutionTrace({ childId: "child-2", provider: "claude-code", cwd: workspace, type: "agent.artifact", path: outside });
    expect(listExecutionTraces(["child-2"])[0].artifacts).toEqual([]);
  });

  it("keeps full trace storage private while returning compact browser payloads", () => {
    const { workspace } = fixture();
    recordExecutionTrace({
      childId: "child-3",
      provider: "codex",
      cwd: workspace,
      type: "agent.tool",
      eventId: "large-output",
      summary: "s".repeat(3_000),
      detail: "d".repeat(8_000),
    });
    const [trace] = listExecutionTraces(["child-3"]);
    expect(trace.events[0].summary.length).toBeLessThanOrEqual(1_202);
    expect(trace.events[0].detail.length).toBeLessThanOrEqual(2_002);
  });

  it("limits browser payloads to the start and most recent trace events", () => {
    const { workspace } = fixture();
    const common = { childId: "child-4", provider: "codex", cwd: workspace };
    recordExecutionTrace({ ...common, type: "run.started", eventId: "start" });
    for (let index = 0; index < 90; index += 1) {
      recordExecutionTrace({ ...common, type: "agent.tool", eventId: `tool-${index}`, summary: `tool ${index}` });
    }

    const [trace] = listExecutionTraces(["child-4"]);
    expect(trace.events).toHaveLength(60);
    expect(trace.events[0].id).toBe("start");
    expect(trace.events.at(-1).id).toBe("tool-89");
    expect(trace.events.some((event) => event.id === "tool-0")).toBe(false);
  });
});
