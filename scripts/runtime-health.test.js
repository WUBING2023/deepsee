import { describe, expect, it } from "vitest";
import { verifyRuntime } from "./runtime-health.mjs";

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
});
