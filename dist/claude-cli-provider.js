import { randomUUID } from "node:crypto";
import { extname } from "node:path";
import { NO_START_CAPABILITIES, resolveChildCwd, settleRunResult, subprocessRunHandle, } from "@deepseek-ai/dsh-subagent";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { recordExecutionTrace } from "../scripts/execution-trace.mjs";
const OUTPUT_LIMIT = 4 * 1024 * 1024;
const DISPOSE_GRACE_MS = 3_000;
export async function prepareClaudeTask(ctx, request) {
    if (request.prompt.length === 0) {
        throw new Error("opends-claude-code: the delegated task must not be empty");
    }
    const content = [];
    let hasImage = false;
    for (const block of request.prompt) {
        if (block.type === "text") {
            content.push({ type: "text", text: block.text });
            continue;
        }
        if (block.type === "image") {
            const stored = await ctx.attachments.readImage(block.attachment, request.signal);
            content.push({
                type: "image",
                source: {
                    type: "base64",
                    media_type: stored.ref.mediaType,
                    data: Buffer.from(stored.data).toString("base64"),
                },
            });
            hasImage = true;
            continue;
        }
        throw new Error(`opends-claude-code: unsupported task block ${block.type}`);
    }
    const visibleText = content.some((block) => block.type === "text" && String(block.text || "").trim());
    if (!visibleText && !hasImage)
        throw new Error("opends-claude-code: the delegated task must not be empty");
    return {
        stdin: `${JSON.stringify({ type: "user", message: { role: "user", content } })}\n`,
        streamJson: true,
    };
}
export function parseClaudeOutput(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed)
        throw new Error("opends-claude-code: Claude Code returned no output");
    const candidates = [trimmed, ...trimmed.split(/\r?\n/).reverse()];
    for (const candidate of candidates) {
        try {
            const value = JSON.parse(candidate);
            if (value.is_error === true || value.subtype === "error") {
                throw new Error(String(value.result || value.error || "Claude Code reported an error"));
            }
            if (typeof value.result === "string" && value.result.trim())
                return value.result.trim();
            if (typeof value.text === "string" && value.text.trim())
                return value.text.trim();
        }
        catch (error) {
            if (error instanceof Error && error.message.startsWith("opends-claude-code:"))
                throw error;
        }
    }
    return trimmed;
}
export function claudeArgv(executable, model, streamJson = false) {
    const args = [
        "--print",
        ...(streamJson ? [
            "--input-format", "stream-json",
            "--output-format", "stream-json",
            "--verbose",
            "--include-partial-messages",
            "--forward-subagent-text",
        ] : ["--output-format", "json"]),
        "--no-session-persistence",
        "--permission-mode", "acceptEdits",
        ...(model ? ["--model", model] : []),
    ];
    const env = { ...scrubbedParentEnv(), NO_COLOR: "1", FORCE_COLOR: "0" };
    if (process.platform === "win32" && extname(executable).toLowerCase() !== ".exe") {
        env.OPENDS_CLAUDE_EXECUTABLE = `"${executable}"`;
        return {
            argv: [process.env.ComSpec || "cmd.exe", "/d", "/v:off", "/s", "/c", "%OPENDS_CLAUDE_EXECUTABLE%", ...args],
            env,
        };
    }
    return { argv: [executable, ...args], env };
}
function traceArtifacts(input) {
    if (!input || typeof input !== "object" || Array.isArray(input))
        return [];
    const value = input;
    return ["file_path", "path", "notebook_path"]
        .map((key) => value[key])
        .filter((candidate) => typeof candidate === "string" && candidate.length > 0);
}
/** Convert Claude Code's public JSONL stream into DeepSee's provider-neutral execution trace. */
export function claudeTraceEvents(value) {
    const result = [];
    if (value.type === "system") {
        result.push({ type: "agent.progress", eventId: "claude-system", title: "Claude Code 已连接", status: "running" });
        return result;
    }
    if (value.type === "stream_event") {
        const event = value.event;
        const delta = event?.delta;
        if (event?.type === "content_block_delta" && delta?.type === "text_delta" && typeof delta.text === "string") {
            result.push({ type: "agent.summary", eventId: `claude-text-${String(event.index ?? 0)}`, append: true, summary: delta.text });
        }
        return result;
    }
    const message = value.message;
    const blocks = Array.isArray(message?.content) ? message.content : [];
    for (const raw of blocks) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw))
            continue;
        const block = raw;
        if (block.type === "text" && typeof block.text === "string" && block.text.trim()) {
            result.push({
                type: "agent.summary",
                eventId: String(message?.id || value.uuid || `claude-text-${result.length}`),
                title: "Claude Code 输出摘要",
                summary: block.text,
            });
        }
        else if (block.type === "tool_use") {
            result.push({
                type: "agent.tool",
                eventId: String(block.id || `claude-tool-${result.length}`),
                title: `调用 ${String(block.name || "工具")}`,
                detail: block.input ? JSON.stringify(block.input) : "",
                status: "running",
                artifacts: traceArtifacts(block.input),
            });
        }
        else if (block.type === "tool_result") {
            const content = typeof block.content === "string"
                ? block.content
                : Array.isArray(block.content)
                    ? block.content.map((item) => typeof item === "object" && item && "text" in item ? String(item.text) : "").filter(Boolean).join("\n")
                    : "";
            result.push({
                type: "agent.tool",
                eventId: `${String(block.tool_use_id || "unknown")}-result`,
                title: block.is_error === true ? "工具执行失败" : "工具执行完成",
                summary: content,
                status: block.is_error === true ? "failed" : "completed",
            });
        }
    }
    if (value.type === "result" && typeof value.result === "string") {
        result.push({ type: "agent.summary", eventId: "claude-result", title: "Claude Code 最终结果", summary: value.result });
    }
    return result;
}
async function startClaudeRun(ctx, request, executable) {
    const parentCwd = request.parent.session.header.cwd;
    if (parentCwd === undefined) {
        throw new Error("opends-claude-code: no working directory is available for the delegated task");
    }
    const cwd = resolveChildCwd("opends-claude-code", undefined, parentCwd);
    const { stdin, streamJson } = await prepareClaudeTask(ctx, request);
    const model = request.agentOptions?.model?.trim() || undefined;
    const { argv, env } = claudeArgv(executable, model, streamJson);
    const runId = randomUUID();
    const traceBase = {
        childId: String(runId),
        parentSessionId: String(request.parent.id),
        provider: "claude-code",
        model: model || "default",
        cwd,
    };
    const child = ctx.subprocess.spawn({
        argv,
        cwd,
        env,
        signal: request.signal,
        graceMs: DISPOSE_GRACE_MS,
        stdio: {
            stdin: { data: stdin },
            stdout: "pipe",
            stderr: { maxBytes: OUTPUT_LIMIT },
        },
    });
    recordExecutionTrace({ ...traceBase, type: "run.started", eventId: "claude-start", title: "Claude Code 已开始执行", status: "running" });
    let stdout = "";
    let pending = "";
    const stdoutDone = new Promise((resolveStream, rejectStream) => {
        const stream = child.stdout;
        if (!stream)
            return rejectStream(new Error("opends-claude-code: stdout pipe was not created"));
        const consumeLine = (line) => {
            if (!line.trim())
                return;
            try {
                const value = JSON.parse(line);
                for (const event of claudeTraceEvents(value))
                    recordExecutionTrace({ ...traceBase, ...event });
            }
            catch { }
        };
        stream.setEncoding("utf8");
        stream.on("data", (chunk) => {
            stdout = `${stdout}${chunk}`.slice(-OUTPUT_LIMIT * 4);
            pending += chunk;
            const lines = pending.split(/\r?\n/);
            pending = lines.pop() || "";
            for (const line of lines)
                consumeLine(line);
        });
        stream.once("error", rejectStream);
        stream.once("end", () => {
            consumeLine(pending);
            resolveStream();
        });
    });
    let cancelled = request.signal.aborted;
    const requestCancel = () => {
        cancelled = true;
        child.terminate();
    };
    const onAbort = () => requestCancel();
    request.signal.addEventListener("abort", onAbort, { once: true });
    const collectText = (stream) => stream === "stdout" ? stdout : child.collected.stderr?.readFrom(0).text || "";
    const collectOutput = () => {
        const text = collectText("stdout").trim();
        return text ? [{ type: "text", text }] : [];
    };
    const attempt = async () => {
        const [outcome] = await Promise.all([child.done, stdoutDone]);
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
        id: runId,
        result,
        signal: request.signal,
        onAbort,
        requestCancel,
        teardown,
    });
}
export async function installClaudeCliProvider(ctx) {
    const executable = await ctx.subprocess.resolveExecutable("claude");
    const provider = {
        name: "claude-code",
        capabilities: NO_START_CAPABILITIES,
        inheritsParentContext: false,
        start: (request) => startClaudeRun(ctx, request, executable),
    };
    ctx.subagents.registerProvider(provider);
}
