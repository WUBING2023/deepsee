import { spawnSync } from "node:child_process";
import { extname } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function adapterInstalled(packageName) {
  if (!packageName) return true;
  try {
    require.resolve(`${packageName}/package.json`);
    return true;
  } catch {
    return false;
  }
}

function cleanOutput(value) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9_-]+/gi, "<redacted>")
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 240);
}

function runExecutable(executable, args, options = {}) {
  const platform = options.platform ?? process.platform;
  const common = {
    cwd: options.cwd,
    env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
    encoding: "utf8",
    windowsHide: true,
    timeout: options.timeout ?? 8000,
    ...(options.input !== undefined ? { input: options.input } : {}),
    stdio: [options.input !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
  };
  if (platform !== "win32" || extname(executable).toLowerCase() === ".exe") {
    return spawnSync(executable, args, common);
  }
  if (extname(executable).toLowerCase() === ".ps1") {
    return spawnSync("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      executable,
      ...args,
    ], common);
  }
  return spawnSync(process.env.ComSpec || "cmd.exe", [
    "/d",
    "/c",
    "call",
    executable,
    ...args,
  ], common);
}

function failed(result) {
  return Boolean(result.error) || result.signal === "SIGTERM" || result.status !== 0;
}

export const runtimeDefinitions = Object.freeze([
  {
    command: "claude",
    id: "cli:claude-code",
    provider: "anthropic",
    runtimeProvider: "claude-code",
    model: "claude-code",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    visionLevel: "full-vision",
    versionArgs: ["--version"],
    authArgs: ["auth", "status"],
    authValidator: (output) => /["']?loggedIn["']?\s*:\s*true/i.test(output),
    failureHint: "请先运行 claude auth login 完成登录。",
    capabilities: ["text", "reasoning", "tools", "coding", "vision"],
    weaknesses: ["长篇中文内容创作", "低成本批量任务"],
    roles: ["coding", "executor", "review"],
    description: "适合代码实现和代码审查；启动时验证 Claude Code 登录状态",
    adapterSupported: true,
    cliModels: ["sonnet", "opus", "haiku", "fable"],
    visionProbe: (model = "sonnet") => ({
      args: [
        "--print",
        "--input-format", "stream-json",
        "--output-format", "stream-json",
        "--verbose",
        "--no-session-persistence",
        "--permission-mode", "dontAsk",
        "--tools", "",
        "--model", model,
      ],
      input: `${JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [{
            type: "text",
            text: "Inspect the image itself. Reply with exactly one token: DEEPSEE_VISION_RED if it is red, DEEPSEE_VISION_BLUE if it is blue, or DEEPSEE_VISION_UNAVAILABLE if no image is visible.",
          }, {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAANUlEQVR4nO3QsQ0AMAzDsLT//9yeoCkbeYAN6LzZdZf3x0GSKEmUJEoSJYmSREmiJFGSaMoHo8QBPwYSAhsAAAAASUVORK5CYII=",
            },
          }],
        },
      })}\n`,
      timeout: 45_000,
      validator: (output) => /\"result\"\s*:\s*\"DEEPSEE_VISION_RED(?:\\n)?\"/i.test(output)
        && !/unsupported image|vision_unavailable/i.test(output),
      failureReason: (output) => {
        const actualModel = output.match(/\"model\"\s*:\s*\"([^\"]+)\"/i)?.[1];
        if (/DEEPSEE_VISION_UNAVAILABLE/i.test(output)) {
          return actualModel
            ? `Claude Code 当前所选模型实际路由到 ${actualModel}，该模型没有接收到图片输入，暂不能作为视觉模型。`
            : "Claude Code 当前所选模型没有接收到图片输入，暂不能作为视觉模型。";
        }
        return "Claude Code 当前账号所选模型没有通过真实图片输入验证。";
      },
    }),
  },
  {
    command: "codex",
    id: "cli:codex",
    provider: "openai",
    runtimeProvider: "codex",
    model: "codex-cli",
    inputModalities: ["text", "image"],
    outputModalities: ["text"],
    visionLevel: "full-vision",
    versionArgs: ["--version"],
    authArgs: ["login", "status"],
    failureHint: "请先运行 codex login 完成登录。",
    capabilities: ["text", "reasoning", "tools", "coding", "vision"],
    weaknesses: ["长篇中文内容创作", "低延迟轻量任务"],
    roles: ["coding", "executor", "review"],
    description: "适合仓库分析、代码实现和工具操作；启动时验证 Codex CLI 登录状态",
    adapterSupported: true,
    adapterPackage: "@wubing2023/deepsee",
  },
  {
    command: "gemini",
    id: "cli:gemini",
    provider: "google",
    runtimeProvider: "gemini-cli",
    model: "gemini-cli",
    sourceLabel: "Gemini CLI",
    versionArgs: ["--version"],
    authArgs: ["--prompt", "Reply exactly AUTH_OK", "--output-format", "json", "--skip-trust"],
    authTimeout: 30_000,
    authValidator: (output) => /\"response\"\s*:\s*\"AUTH_OK(?:\\n)?\"/i.test(output) && !/\"error\"\s*:/i.test(output),
    failureHint: "Gemini CLI 尚未登录或账号当前不可调用；请先运行 gemini 完成登录。",
    capabilities: ["text", "reasoning", "tools", "coding"],
    weaknesses: ["首次使用需要单独完成 Google 登录", "原生图片需走 DeepSee 视觉路由"],
    roles: ["coding", "research", "executor", "review"],
    description: "适合代码、推理与 Google 生态任务；可由 DeepSee 安装并以官方无头模式调用",
    adapterSupported: true,
    cliModels: ["auto", "pro", "flash", "flash-lite"],
  },
  {
    command: "kimi",
    id: "cli:kimi",
    provider: "moonshot",
    model: "kimi-cli",
    versionArgs: ["--version"],
    authArgs: ["provider", "list", "--json"],
    failureHint: "请先运行 kimi login 或配置 Kimi provider。",
    capabilities: ["text", "long-context"],
    weaknesses: ["复杂代码仓库修改", "Harness 子代理接入"],
    roles: ["document", "writing", "research"],
    description: "适合长文档和中文任务；当前 Harness 尚未提供 Kimi CLI 子代理适配器",
    adapterSupported: false,
    adapterHint: "CLI 已安装，但当前 Harness 尚无 Kimi CLI 子代理适配器；请使用 Kimi API。",
  },
  {
    command: "ollama",
    id: "cli:ollama",
    provider: "ollama",
    model: "local-model",
    versionArgs: ["--version"],
    authArgs: ["list"],
    failureHint: "请先启动 Ollama 服务并至少安装一个模型。",
    capabilities: ["text", "local"],
    weaknesses: ["能力取决于本地模型", "Harness 子代理接入"],
    roles: ["private", "draft"],
    description: "本地模型 Runtime；当前 Harness 尚未配置对应子代理适配器",
    adapterSupported: false,
    adapterHint: "Ollama 可执行，但当前 Harness 尚未配置 DeepSee 子代理适配器。",
  },
  {
    command: "opencode",
    id: "cli:opencode",
    provider: "opencode",
    model: "opencode-cli",
    versionArgs: ["--version"],
    authArgs: ["auth", "list"],
    failureHint: "请先完成 OpenCode 的 provider 登录。",
    capabilities: ["text", "reasoning", "tools", "coding"],
    weaknesses: ["Harness 子代理接入"],
    roles: ["coding", "executor"],
    description: "OpenCode CLI Runtime；当前 Harness 尚未配置对应子代理适配器",
    adapterSupported: false,
    adapterHint: "OpenCode 可执行，但当前 Harness 尚未配置 DeepSee 子代理适配器。",
  },
]);

export function verifyRuntime(definition, executable, options = {}) {
  const adapterAvailable = options.adapterAvailable ?? adapterInstalled(definition.adapterPackage);
  if (definition.adapterSupported !== false && !adapterAvailable) {
    return { available: false, reason: `Harness 子代理适配器 ${definition.adapterPackage} 尚未安装。` };
  }
  const run = options.run || ((args, runOptions = {}) => runExecutable(executable, args, { ...options, ...runOptions }));
  const version = run(definition.versionArgs || ["--version"]);
  if (failed(version)) {
    const detail = cleanOutput(version.stderr || version.stdout || version.error?.message);
    return {
      available: false,
      reason: `CLI 无法启动${detail ? `：${detail}` : ""}`,
    };
  }
  if (definition.authArgs) {
    const auth = run(definition.authArgs, { timeout: definition.authTimeout ?? options.timeout });
    const authOutput = `${auth.stdout || ""}\n${auth.stderr || ""}`;
    if (failed(auth) || (definition.authValidator && !definition.authValidator(authOutput))) {
      return { available: false, reason: definition.failureHint || "CLI 登录验证失败。" };
    }
  }
  if (definition.adapterSupported === false) {
    return { available: false, reason: definition.adapterHint || "Harness 暂无对应 Runtime 适配器。" };
  }
  return { available: true, reason: "" };
}

export function verifyRuntimeVision(definition, executable, model, options = {}) {
  if (typeof definition.visionProbe !== "function") {
    return { available: definition.visionLevel === "full-vision", reason: "" };
  }
  const probe = definition.visionProbe(model);
  const run = options.run || ((args, runOptions = {}) => runExecutable(executable, args, { ...options, ...runOptions }));
  const result = run(probe.args, { timeout: probe.timeout, input: probe.input });
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (failed(result) || !probe.validator(output)) {
    return {
      available: false,
      reason: typeof probe.failureReason === "function"
        ? probe.failureReason(output)
        : "当前账号所选模型没有通过真实图片输入验证。",
    };
  }
  return { available: true, reason: "" };
}
