import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import type { Context } from "@deepseek-ai/cordis";
import {
  NO_START_CAPABILITIES,
  resolveChildCwd,
  settleRunResult,
  subprocessRunHandle,
  type ResolvedSubagentStartRequest,
  type SubagentProvider,
  type SubagentResult,
  type SubagentRun,
} from "@deepseek-ai/dsh-subagent";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";

const OUTPUT_LIMIT = 4 * 1024 * 1024;
const DISPOSE_GRACE_MS = 3_000;

function textTask(request: ResolvedSubagentStartRequest): string {
  if (request.prompt.length === 0) {
    throw new Error("opends-claude-code: the delegated task must contain text");
  }
  const texts: string[] = [];
  for (const block of request.prompt) {
    if (block.type !== "text") {
      throw new Error("opends-claude-code: Claude Code tasks currently accept text blocks only");
    }
    texts.push(block.text);
  }
  const prompt = texts.join("\n\n");
  if (!prompt.trim()) throw new Error("opends-claude-code: the delegated task must not be empty");
  return prompt;
}

export function parseClaudeOutput(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("opends-claude-code: Claude Code returned no output");
  const candidates = [trimmed, ...trimmed.split(/\r?\n/).reverse()];
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as Record<string, unknown>;
      if (value.is_error === true || value.subtype === "error") {
        throw new Error(String(value.result || value.error || "Claude Code reported an error"));
      }
      if (typeof value.result === "string" && value.result.trim()) return value.result.trim();
      if (typeof value.text === "string" && value.text.trim()) return value.text.trim();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("opends-claude-code:")) throw error;
    }
  }
  return trimmed;
}

export function claudeArgv(executable: string, model: string | undefined): { argv: string[]; env: NodeJS.ProcessEnv } {
  const args = [
    "--print",
    "--output-format", "json",
    "--no-session-persistence",
    "--permission-mode", "acceptEdits",
    ...(model ? ["--model", model] : []),
  ];
  const env: NodeJS.ProcessEnv = { ...scrubbedParentEnv(), NO_COLOR: "1", FORCE_COLOR: "0" };
  if (process.platform === "win32" && extname(executable).toLowerCase() !== ".exe") {
    env.OPENDS_CLAUDE_EXECUTABLE = `"${executable}"`;
    return {
      argv: [process.env.ComSpec || "cmd.exe", "/d", "/v:off", "/s", "/c", "%OPENDS_CLAUDE_EXECUTABLE%", ...args],
      env,
    };
  }
  return { argv: [executable, ...args], env };
}

async function startClaudeRun(ctx: Context, request: ResolvedSubagentStartRequest, executable: string): Promise<SubagentRun> {
  const prompt = textTask(request);
  const parentCwd = request.parent.session.header.cwd;
  if (parentCwd === undefined) {
    throw new Error("opends-claude-code: no working directory is available for the delegated task");
  }
  const cwd = resolveChildCwd("opends-claude-code", undefined, parentCwd);
  const model = request.agentOptions?.model?.trim() || undefined;
  const { argv, env } = claudeArgv(executable, model);
  const child = ctx.subprocess.spawn({
    argv,
    cwd,
    env,
    signal: request.signal,
    graceMs: DISPOSE_GRACE_MS,
    stdio: {
      stdin: { data: prompt },
      stdout: { maxBytes: OUTPUT_LIMIT, spill: { maxBytes: OUTPUT_LIMIT * 4 } },
      stderr: { maxBytes: OUTPUT_LIMIT },
    },
  });
  let cancelled = request.signal.aborted;
  const requestCancel = () => {
    cancelled = true;
    child.terminate();
  };
  const onAbort = () => requestCancel();
  request.signal.addEventListener("abort", onAbort, { once: true });

  const collectText = (stream: "stdout" | "stderr") => child.collected[stream]?.readFrom(0).text || "";
  const collectOutput = () => {
    const text = collectText("stdout").trim();
    return text ? [{ type: "text" as const, text }] : [];
  };
  const attempt = async (): Promise<SubagentResult> => {
    const outcome = await child.done;
    const stdout = collectText("stdout");
    const stderr = collectText("stderr").trim();
    if (outcome.exitCode !== 0) {
      throw new Error(`opends-claude-code: exited with code ${String(outcome.exitCode)}${stderr ? `: ${stderr}` : ""}`);
    }
    return {
      output: [{ type: "text", text: parseClaudeOutput(stdout) }],
      stopReason: "completed",
    };
  };
  const result = settleRunResult({
    attempt,
    collectOutput,
    cancelled: () => cancelled,
    onError: (error, stopReason) => ctx.logger.warn(`opends-claude-code: child run failed (${stopReason}): ${error.message}`),
    signal: request.signal,
    onAbort,
  });
  const teardown = async () => {
    child.terminate();
    await child.waitForExit();
    await child.done.catch(() => undefined);
  };
  return subprocessRunHandle({
    id: randomUUID() as SubagentRun["id"],
    result,
    signal: request.signal,
    onAbort,
    requestCancel,
    teardown,
  });
}

export async function installClaudeCliProvider(ctx: Context): Promise<void> {
  const executable = await ctx.subprocess.resolveExecutable("claude");
  const provider: SubagentProvider = {
    name: "claude-code",
    capabilities: NO_START_CAPABILITIES,
    inheritsParentContext: false,
    start: (request) => startClaudeRun(ctx, request, executable),
  };
  ctx.subagents.registerProvider(provider);
}
