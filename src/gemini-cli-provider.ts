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
  if (request.prompt.length === 0) throw new Error("deepsee-gemini-cli: the delegated task must contain text");
  const texts: string[] = [];
  for (const block of request.prompt) {
    if (block.type !== "text") throw new Error("deepsee-gemini-cli: Gemini CLI tasks currently accept text blocks only");
    texts.push(block.text);
  }
  const prompt = texts.join("\n\n");
  if (!prompt.trim()) throw new Error("deepsee-gemini-cli: the delegated task must not be empty");
  return prompt;
}

export function parseGeminiOutput(stdout: string): string {
  const trimmed = stdout.trim();
  if (!trimmed) throw new Error("deepsee-gemini-cli: Gemini CLI returned no output");
  const candidates = [trimmed, ...trimmed.split(/\r?\n/).reverse()];
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate) as Record<string, unknown>;
      if (value.error) {
        const detail = typeof value.error === "string" ? value.error : JSON.stringify(value.error);
        throw new Error(`deepsee-gemini-cli: ${detail}`);
      }
      if (typeof value.response === "string" && value.response.trim()) return value.response.trim();
      if (typeof value.text === "string" && value.text.trim()) return value.text.trim();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("deepsee-gemini-cli:")) throw error;
    }
  }
  return trimmed;
}

export function geminiArgv(executable: string, model: string | undefined): { argv: string[]; env: NodeJS.ProcessEnv } {
  const args = [
    "--output-format", "json",
    "--approval-mode", "auto_edit",
    ...(model ? ["--model", model] : []),
  ];
  const env: NodeJS.ProcessEnv = { ...scrubbedParentEnv(), NO_COLOR: "1", FORCE_COLOR: "0" };
  if (process.platform === "win32" && extname(executable).toLowerCase() !== ".exe") {
    env.DEEPSEE_GEMINI_EXECUTABLE = `"${executable}"`;
    return {
      argv: [process.env.ComSpec || "cmd.exe", "/d", "/v:off", "/s", "/c", "%DEEPSEE_GEMINI_EXECUTABLE%", ...args],
      env,
    };
  }
  return { argv: [executable, ...args], env };
}

async function startGeminiRun(ctx: Context, request: ResolvedSubagentStartRequest, executable: string): Promise<SubagentRun> {
  const prompt = textTask(request);
  const parentCwd = request.parent.session.header.cwd;
  if (parentCwd === undefined) throw new Error("deepsee-gemini-cli: no working directory is available for the delegated task");
  const cwd = resolveChildCwd("deepsee-gemini-cli", undefined, parentCwd);
  const model = request.agentOptions?.model?.trim() || undefined;
  const { argv, env } = geminiArgv(executable, model);
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
      const loginHint = /auth|login|credential|sign.?in/i.test(stderr) ? " 请先运行 gemini auth login。" : "";
      throw new Error(`deepsee-gemini-cli: exited with code ${String(outcome.exitCode)}${stderr ? `: ${stderr}` : ""}${loginHint}`);
    }
    return { output: [{ type: "text", text: parseGeminiOutput(stdout) }], stopReason: "completed" };
  };
  const result = settleRunResult({
    attempt,
    collectOutput,
    cancelled: () => cancelled,
    onError: (error, stopReason) => ctx.logger.warn(`deepsee-gemini-cli: child run failed (${stopReason}): ${error.message}`),
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

export function installGeminiCliProvider(ctx: Context, executable: string): void {
  const provider: SubagentProvider = {
    name: "gemini-cli",
    capabilities: NO_START_CAPABILITIES,
    inheritsParentContext: false,
    start: (request) => startGeminiRun(ctx, request, executable),
  };
  ctx.subagents.registerProvider(provider);
}
