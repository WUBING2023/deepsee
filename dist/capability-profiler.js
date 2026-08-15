import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { extname, dirname } from "node:path";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { BlockAssembler, createUserMessage, } from "@deepseek-ai/dsh-llm";
import { normalizeRegistry } from "./model-registry.js";
import { claudeArgv, parseClaudeOutput } from "./claude-cli-provider.js";
function unique(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
function looseJsonObject(text) {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
    const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0] || "";
    try {
        const value = JSON.parse(candidate);
        if (typeof value !== "object" || value === null || Array.isArray(value))
            throw new Error("能力画像不是 JSON 对象。");
        return value;
    }
    catch {
        // Capability profiles are advisory metadata. Recover the two requested
        // fields when a model emits nearly-valid JSON instead of asking the user
        // to configure the same information by hand.
        const strengthsBody = candidate.match(/["'“”]?strengths["'“”]?\s*[:：]\s*\[([\s\S]*?)(?:\]|$)/i)?.[1] || "";
        const strengths = strengthsBody
            .split(/[,，、;；\n]/)
            .map((item) => item
            .replace(/\\["']/g, "")
            .replace(/^[\s"'“”‘’]+|[\s"'“”‘’}]+$/g, "")
            .trim())
            .filter(Boolean)
            .slice(0, 4);
        const rawVision = candidate.match(/["'“”]?vision["'“”]?\s*[:：]\s*(true|false|是|否)/i)?.[1]?.toLowerCase();
        if (strengths.length === 0)
            throw new Error("模型返回的能力画像无法解析。");
        return { strengths, vision: rawVision === "true" || rawVision === "是" };
    }
}
export function parseCapabilityProfile(text, info) {
    const value = looseJsonObject(text);
    const strengths = unique((Array.isArray(value.strengths) ? value.strengths : [value.strengths])
        .filter((item) => typeof item === "string")
        .slice(0, 4));
    if (strengths.length === 0)
        throw new Error("模型没有返回擅长能力。");
    const joined = strengths.join(" ").toLowerCase();
    const declaredVision = typeof value.vision === "boolean" ? value.vision : false;
    const vision = Array.isArray(info?.inputModalities)
        ? info.inputModalities.includes("image")
        : declaredVision;
    const capabilities = unique([
        "text",
        ...strengths,
        ...(info?.reasoning || /reason|logic|推理|逻辑/.test(joined) ? ["reasoning"] : []),
        ...(/code|program|software|编码|代码|编程|开发/.test(joined) ? ["coding"] : []),
        ...(/tool|agent|工具|代理|执行/.test(joined) ? ["tools"] : []),
        ...(/long.?context|document|长上下文|长文|文档/.test(joined) ? ["long-context"] : []),
        ...(vision ? ["vision"] : []),
    ]);
    const roles = unique([
        "executor",
        ...(capabilities.includes("reasoning") ? ["reasoning", "review"] : []),
        ...(capabilities.includes("coding") ? ["coding"] : []),
        ...(capabilities.includes("vision") ? ["vision", "document"] : []),
        ...(/write|content|写作|文案|创作/.test(joined) ? ["writing"] : []),
    ]);
    return { strengths, vision, capabilities, roles, description: strengths.join("、") };
}
function textBlocks(blocks) {
    const visible = blocks
        .filter((block) => block.type === "text")
        .map((block) => block.text.trim())
        .filter(Boolean)
        .join("\n");
    if (visible)
        return visible;
    return blocks
        .filter((block) => block.type === "reasoning")
        .map((block) => block.text.trim())
        .filter(Boolean)
        .join("\n");
}
export async function requestCapabilityProfile(llm, route, signal) {
    const provider = route.runtimeProvider || route.provider;
    const model = route.runtimeModel || route.model;
    const info = await llm.resolveModelInfo(provider, model, signal);
    const lowEffort = info.reasoning?.efforts.find((effort) => effort.id === "low")?.id;
    const request = createUserMessage({
        source: { kind: "plugin", plugin: "opends-bridge" },
        content: [{
                type: "text",
                text: "与市场上多数大模型相比，你最擅长哪三类任务？你能否直接读取图片输入？只返回一行 JSON：{\"strengths\":[\"能力1\",\"能力2\",\"能力3\"],\"vision\":true或false}",
            }],
    });
    const assembler = new BlockAssembler();
    for await (const chunk of llm.stream({
        provider,
        model,
        messages: [request],
        system: "你正在生成简短、诚实的模型能力元数据。不要夸大能力，不要解释，只输出 JSON。",
        maxTokens: 512,
        ...(lowEffort ? { reasoningEffort: lowEffort } : {}),
        signal,
    }))
        assembler.push(chunk);
    const finish = assembler.finish;
    if (finish.kind === "error" || finish.kind === "aborted")
        throw new Error(finish.failure.message);
    return parseCapabilityProfile(textBlocks(assembler.blocks()), info);
}
const PROFILE_PROMPT = "与市场上多数大模型相比，你最擅长哪三类任务？你能否直接读取图片输入？只返回一行 JSON：{\"strengths\":[\"能力1\",\"能力2\",\"能力3\"],\"vision\":true或false}";
function commandArgv(executable, args) {
    const env = { ...scrubbedParentEnv(), NO_COLOR: "1", FORCE_COLOR: "0" };
    if (process.platform === "win32" && extname(executable).toLowerCase() !== ".exe") {
        env.OPENDS_PROFILE_EXECUTABLE = `"${executable}"`;
        return {
            argv: [process.env.ComSpec || "cmd.exe", "/d", "/v:off", "/s", "/c", "%OPENDS_PROFILE_EXECUTABLE%", ...args],
            env,
        };
    }
    return { argv: [executable, ...args], env };
}
async function requestCliCapabilityProfile(ctx, registryFile, route, signal) {
    if (!route.executable)
        throw new Error("CLI 路由缺少可执行文件。");
    let invocation;
    if (route.id === "cli:claude-code") {
        invocation = claudeArgv(route.executable, route.cliModel || undefined);
    }
    else if (route.id === "cli:codex") {
        invocation = commandArgv(route.executable, [
            "exec",
            "--skip-git-repo-check",
            ...(route.cliModel ? ["--model", route.cliModel] : []),
            "--sandbox", "read-only",
            "--ephemeral",
            "-",
        ]);
    }
    else {
        throw new Error(`CLI ${route.id} 暂无能力画像适配器。`);
    }
    const child = ctx.subprocess.spawn({
        argv: invocation.argv,
        cwd: dirname(registryFile),
        env: invocation.env,
        signal,
        graceMs: 3_000,
        stdio: {
            stdin: { data: PROFILE_PROMPT },
            stdout: { maxBytes: 1024 * 1024 },
            stderr: { maxBytes: 1024 * 1024 },
        },
    });
    const timer = setTimeout(() => child.terminate(), 120_000);
    try {
        const outcome = await child.done;
        const stdout = child.collected.stdout?.readFrom(0).text || "";
        const stderr = child.collected.stderr?.readFrom(0).text.trim() || "";
        if (outcome.exitCode !== 0) {
            throw new Error(`${route.id} 能力画像失败（exit ${String(outcome.exitCode)}）${stderr ? `：${stderr.slice(-1200)}` : ""}`);
        }
        const response = route.id === "cli:claude-code" ? parseClaudeOutput(stdout) : stdout.trim();
        return parseCapabilityProfile(response);
    }
    finally {
        clearTimeout(timer);
    }
}
function readRegistry(path) {
    if (!path || !existsSync(path))
        return { version: 1, routes: [] };
    try {
        return normalizeRegistry(JSON.parse(readFileSync(path, "utf8")));
    }
    catch {
        return { version: 1, routes: [] };
    }
}
function writeRegistry(path, registry) {
    writeFileSync(path, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
}
function updateRoute(path, id, patch) {
    const registry = readRegistry(path);
    registry.routes = registry.routes.map((route) => route.id === id ? { ...route, ...patch } : route);
    writeRegistry(path, registry);
}
export function installCapabilityProfiler(ctx, registryFile) {
    if (!registryFile)
        return;
    let busy = false;
    const controller = new AbortController();
    const tick = async () => {
        if (busy || controller.signal.aborted)
            return;
        const registry = readRegistry(registryFile);
        const route = registry.routes.find((candidate) => (candidate.enabled !== false
            && candidate.status === "ready"
            && candidate.profileStatus === "pending"
            && Boolean(candidate.runtimeProvider || candidate.provider)));
        if (!route)
            return;
        busy = true;
        updateRoute(registryFile, route.id, { profileStatus: "profiling", profileError: undefined });
        try {
            const reported = route.source === "cli"
                ? await requestCliCapabilityProfile(ctx, registryFile, route, controller.signal)
                : await requestCapabilityProfile(ctx.llm, route, controller.signal);
            const profile = route.source === "cli"
                ? {
                    ...reported,
                    vision: route.visionLevel === "full-vision",
                    capabilities: unique([
                        ...route.capabilities,
                        ...reported.capabilities,
                    ].filter((capability) => capability !== "vision" || route.visionLevel === "full-vision")),
                    roles: unique([
                        ...route.roles,
                        ...reported.roles,
                    ].filter((role) => !new Set(["vision", "document"]).has(role) || route.visionLevel === "full-vision")),
                }
                : reported;
            updateRoute(registryFile, route.id, {
                capabilities: profile.capabilities,
                roles: profile.roles,
                description: profile.description,
                descriptionSource: "verified",
                visionLevel: profile.vision ? "full-vision" : "none",
                profileStatus: "ready",
                profiledAt: new Date().toISOString(),
                profileError: undefined,
            });
        }
        catch (error) {
            updateRoute(registryFile, route.id, {
                profileStatus: "error",
                profileError: error instanceof Error ? error.message : String(error),
            });
        }
        finally {
            busy = false;
        }
    };
    ctx.effect(() => {
        const timer = setInterval(() => void tick(), 2500);
        void tick();
        return () => {
            clearInterval(timer);
            controller.abort();
        };
    }, "opends: automatic model capability profiler");
}
