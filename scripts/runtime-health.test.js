import { describe, expect, it } from "vitest";
import { runtimeDefinitions, verifyRuntime, verifyRuntimeVision } from "./runtime-health.mjs";

const definition = {
  versionArgs: ["--version"],
  authArgs: ["auth", "status"],
  authValidator: (output) => output.includes("loggedIn=true"),
  failureHint: "请先登录。",
  adapterSupported: true,
};

describe("runtime startup verification", () => {
  it("marks an executable ready only after version and auth checks pass", () => {
    const calls = [];
    const result = verifyRuntime(definition, "runtime", {
      run(args) {
        calls.push(args);
        return { status: 0, stdout: args[0] === "auth" ? "loggedIn=true" : "1.0.0", stderr: "" };
      },
    });
    expect(result.available).toBe(true);
    expect(calls).toEqual([["--version"], ["auth", "status"]]);
  });

  it("keeps a failed or unsupported CLI unavailable", () => {
    const failed = verifyRuntime(definition, "runtime", {
      run: () => ({ status: 1, stdout: "", stderr: "not logged in" }),
    });
    expect(failed.available).toBe(false);

    const unsupported = verifyRuntime({ ...definition, adapterSupported: false, adapterHint: "no adapter" }, "runtime", {
      run: () => ({ status: 0, stdout: "loggedIn=true", stderr: "" }),
    });
    expect(unsupported).toEqual({ available: false, reason: "no adapter" });

    const missingAdapter = verifyRuntime({ ...definition, adapterPackage: "missing-adapter" }, "runtime", {
      adapterAvailable: false,
      run: () => ({ status: 0, stdout: "loggedIn=true", stderr: "" }),
    });
    expect(missingAdapter.available).toBe(false);
    expect(missingAdapter.reason).toContain("尚未安装");
  });

  it("requires Gemini to complete a real authenticated headless request", () => {
    const gemini = runtimeDefinitions.find((runtime) => runtime.id === "cli:gemini");
    expect(gemini.authArgs).toEqual(["--prompt", "Reply exactly AUTH_OK", "--output-format", "json", "--skip-trust"]);
    const calls = [];
    const unavailable = verifyRuntime(gemini, "gemini", {
      run(args, options) {
        calls.push({ args, options });
        return args[0] === "--version"
          ? { status: 0, stdout: "1.0.0", stderr: "" }
          : { status: 1, stdout: '{"error":{"message":"Please set an Auth method"}}', stderr: "" };
      },
    });
    expect(unavailable.available).toBe(false);
    expect(unavailable.reason).toContain("尚未登录");
    expect(calls[1].options.timeout).toBe(30_000);
  });

  it("declares vision only for CLI adapters that transport real image blocks", () => {
    const claude = runtimeDefinitions.find((runtime) => runtime.id === "cli:claude-code");
    const codex = runtimeDefinitions.find((runtime) => runtime.id === "cli:codex");
    const gemini = runtimeDefinitions.find((runtime) => runtime.id === "cli:gemini");
    expect(claude).toMatchObject({ inputModalities: ["text", "image"], visionLevel: "full-vision" });
    expect(codex).toMatchObject({ inputModalities: ["text", "image"], visionLevel: "full-vision" });
    expect(gemini.visionLevel).toBeUndefined();
  });

  it("keeps an authenticated Claude model out of vision routing when its image probe is unsupported", () => {
    const claude = runtimeDefinitions.find((runtime) => runtime.id === "cli:claude-code");
    const calls = [];
    const unsupported = verifyRuntimeVision(claude, "claude", "sonnet", {
      run(args, options) {
        calls.push({ args, options });
        return { status: 0, stdout: '{"type":"result","model":"deepseek-v4-pro","result":"DEEPSEE_VISION_UNAVAILABLE [Unsupported Image]"}', stderr: "" };
      },
    });
    expect(unsupported.available).toBe(false);
    expect(unsupported.reason).toContain("deepseek-v4-pro");
    expect(calls[0].options.input).toContain('"type":"image"');
    const ready = verifyRuntimeVision(claude, "claude", "sonnet", {
      run: () => ({ status: 0, stdout: '{"type":"result","result":"DEEPSEE_VISION_RED"}', stderr: "" }),
    });
    expect(ready.available).toBe(true);
  });
});
