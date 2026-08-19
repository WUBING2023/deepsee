import { describe, expect, it, vi } from "vitest";
import type { Context } from "@deepseek-ai/cordis";
import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { balancedWorkflowReason, installBalancedWorkflowTrigger, workflowReasoningGuidance, workflowReasoningProfile } from "./workflow-policy.js";

describe("balanced automatic Workflow policy", () => {
  it("recognizes comparison, implementation-review, and divided synthesis without matching a single-track task", () => {
    expect(balancedWorkflowReason("让两个不同模型分别检查实现和文档，然后比较结论")).toContain("comparison");
    expect(balancedWorkflowReason("先完成海报设计，然后由另一个角色独立核验成品")).toContain("review");
    expect(balancedWorkflowReason("分别研究两个方向，最后汇总结论")).toContain("workstreams");
    expect(balancedWorkflowReason("请修复这个函数中的边界错误")).toBeUndefined();
  });

  it("uses soft reasoning profiles without imposing a hard cutoff", () => {
    expect(workflowReasoningProfile("快速比较两个模型")).toBe("focused");
    expect(workflowReasoningProfile("彻底完成复杂的长期迁移")).toBe("deep");
    const guidance = workflowReasoningGuidance("实现并复核功能");
    expect(guidance).toContain("Reasoning profile: balanced");
    expect(guidance).toContain("not a hard runtime, token, step, or agent limit");
  });

  it("injects a mandatory native Workflow decision only into an enabled top-level Prime request", async () => {
    let preStep;
    const restrict = vi.fn(() => vi.fn());
    const ctx = {
      on: vi.fn((_event, listener) => { preStep = listener; }),
    } as unknown as Context;
    installBalancedWorkflowTrigger(ctx, () => true);
    const message = createUserMessage({
      content: [{ type: "text", text: "让两个不同模型分别检查代码和文档，然后比较结论" }],
      source: { kind: "user" },
    });
    const next = vi.fn(async () => ({ kind: "enter" as const, messages: [message] }));
    expect(preStep).toBeTypeOf("function");
    const decision = await preStep!({
      agent: { id: "main", ctx: { tools: { restrict } }, session: { header: { agentPreset: "prime" } } },
    }, next);

    expect(decision.messages[0]).toBe(message);
    expect(decision.messages[1].source).toMatchObject({
      kind: "plugin",
      plugin: "deepsee",
      form: "notice",
      summary: "DeepSee 已为此任务选择多模型 Workflow",
    });
    expect(decision.messages[1].content[0].text).toContain("MUST use the native workflow tool");
    expect(decision.messages[1].content[0].text).toContain("two different enabled model routes");
    expect(decision.messages[1].content[0].text).toContain("Reasoning profile: balanced");
    expect(restrict).toHaveBeenCalledWith({ allow: ["opends_list_models", "workflow"] });
  });

  it("does not force Workflow in Standard mode", async () => {
    let preStep;
    const ctx = {
      on: vi.fn((_event, listener) => { preStep = listener; }),
    } as unknown as Context;
    installBalancedWorkflowTrigger(ctx, () => true);
    const message = createUserMessage({
      content: [{ type: "text", text: "让两个不同模型分别检查后比较" }],
      source: { kind: "user" },
    });
    const original = { kind: "enter" as const, messages: [message] };
    expect(preStep).toBeTypeOf("function");
    const decision = await preStep!({
      agent: { session: { header: { agentPreset: "standard" } } },
    }, async () => original);
    expect(decision).toBe(original);
  });
});
