import type { Context } from "@deepseek-ai/cordis";
import { createUserMessage, type UserMessage } from "@deepseek-ai/dsh-llm";

function userText(message: UserMessage): string {
  return message.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function balancedWorkflowReason(text: string): string | undefined {
  const value = text.replace(/\s+/g, " ").trim();
  if (!value) return undefined;

  const comparison = (
    /(?:不同|两个|多个|多种|各自).{0,30}(?:模型|agent|智能体|方案)/i.test(value)
    || /(?:模型|agent|智能体|方案).{0,30}(?:对比|比较|交叉验证|复核)/i.test(value)
  ) && /(?:分别|对比|比较|复核|审查|评审|核验|验证|综合|汇总)/i.test(value);
  if (comparison) return "explicit multi-model or multi-approach comparison";

  const implementationReview = /(?:实现|开发|编写|生成|设计|制作).{0,80}(?:独立)?(?:复核|审查|评审|测试|验证|核验)/i.test(value);
  if (implementationReview) return "implementation plus independent review";

  const dividedSynthesis = /(?:分别|并行|分工|各自).{0,100}(?:然后|最后|再由|汇总|综合|比较|对比)/i.test(value);
  if (dividedSynthesis) return "two or more independent workstreams followed by synthesis";

  const deliverables = ["代码", "测试", "文案", "海报", "设计", "报告", "介绍", "文档", "审查", "核验"]
    .filter((term) => value.includes(term));
  if (new Set(deliverables).size >= 3 && /(?:同时|以及|并且|然后|分别|再)/.test(value)) {
    return "multiple distinct deliverables or capability roles";
  }
  return undefined;
}

export type WorkflowReasoningProfile = "focused" | "balanced" | "deep";

export function workflowReasoningProfile(text: string): WorkflowReasoningProfile {
  const value = text.replace(/\s+/g, " ").trim();
  if (/(?:深度|全面|彻底|长期|复杂|系统性|不要停止|持续执行|deep|exhaustive|comprehensive)/i.test(value)) return "deep";
  if (/(?:简单|快速|轻量|简短|只需|仅需|focused|quick|minimal)/i.test(value)) return "focused";
  return "balanced";
}

export function workflowReasoningGuidance(text: string): string {
  const profile = workflowReasoningProfile(text);
  const detail = profile === "focused"
    ? "Use the fewest useful agents, give each a narrow role and only the files or evidence it needs, and return concise structured findings."
    : profile === "deep"
      ? "Allow broader investigation and verification where uncertainty justifies it, but checkpoint conclusions and pass summaries or artifacts instead of replaying full transcripts."
      : "Use a small set of complementary agents, avoid duplicate exploration except for intentional comparison, and have the main agent synthesize compact results.";
  return [
    `Reasoning profile: ${profile}.`,
    detail,
    "This profile is orchestration guidance, not a hard runtime, token, step, or agent limit. Never stop a productive long-running task solely because it has run for a long time; reduce repeated context and unnecessary reasoning instead.",
  ].join(" ");
}

function automaticWorkflowInstruction(reason: string, taskText: string): string {
  return [
    "[DeepSee balanced automatic Workflow decision]",
    `This Prime request matches: ${reason}. The user's Prime selection is explicit permission for a visible native Workflow.`,
    "Before any further repository inspection or task execution, you MUST use the native workflow tool. If routes are not known, call opends_list_models first; the Workflow must be the next nontrivial tool call.",
    "During this decision step only opends_list_models and workflow are available. Do not call Glob, Read, Pwsh, Bash, run_code, or any other inspection/execution tool before Workflow starts.",
    "Use at least two different enabled model routes for comparison or independent review when suitable routes exist. Pass each exact DeepSee route id as the child model and omit provider. Let the main agent synthesize agreements and disagreements.",
    workflowReasoningGuidance(taskText),
  ].join("\n");
}

function workflowContext(reason: string, taskText: string): UserMessage {
  return createUserMessage({
    content: [{ type: "text", text: automaticWorkflowInstruction(reason, taskText) }],
    source: {
      kind: "plugin",
      plugin: "deepsee",
      form: "notice",
      summary: "DeepSee 已为此任务选择多模型 Workflow",
    },
  });
}

export function installBalancedWorkflowTrigger(
  ctx: Context,
  automaticWorkflowEnabled: () => boolean,
): void {
  const injected = new Set<string>();
  const workflowGates = new Map<string, () => void>();

  const releaseGate = (agentId: string): void => {
    workflowGates.get(agentId)?.();
    workflowGates.delete(agentId);
  };

  ctx.on("tools/result", (exec) => {
    if (exec.name === "workflow" && exec.agent) releaseGate(String(exec.agent.id));
  });
  ctx.on("agent/turn-stopping", ({ agent }) => releaseGate(String(agent.id)));
  ctx.on("agent/disposed", ({ agent }) => releaseGate(String(agent.id)));

  ctx.on("agent/pre-step", async (payload, next) => {
    const decision = await next();
    if (
      decision.kind !== "enter"
      || !automaticWorkflowEnabled()
      || payload.agent.session.header.agentPreset !== "prime"
      || payload.agent.session.header.origin === "subagent"
    ) return decision;

    const messages: UserMessage[] = [];
    let changed = false;
    for (const message of decision.messages) {
      messages.push(message);
      if (message.source.kind !== "user" || injected.has(String(message.id))) continue;
      const taskText = userText(message);
      const reason = balancedWorkflowReason(taskText);
      if (!reason) continue;
      injected.add(String(message.id));
      changed = true;
      messages.push(workflowContext(reason, taskText));

      const agentId = String(payload.agent.id);
      if (!workflowGates.has(agentId)) {
        try {
          workflowGates.set(agentId, payload.agent.ctx.tools.restrict({
            allow: ["opends_list_models", "workflow"],
          }));
        } catch {
          // Older Harness builds may not expose scoped restrictions. The hidden
          // decision context remains a safe prompt-level fallback in that case.
        }
      }
    }
    return changed ? { kind: "enter" as const, messages } : decision;
  });
}
