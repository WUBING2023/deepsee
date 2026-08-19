import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { downloadWithFallback } from "./download-fallback.mjs";

describe("installer download fallback", () => {
  it("continues after a TLS-style primary downloader failure", () => {
    const root = mkdtempSync(join(tmpdir(), "deepsee-download-"));
    const target = join(root, "uv.zip.sha256");
    const calls = [];
    try {
      const used = downloadWithFallback("https://example.test/uv.sha256", target, [
        { label: "curl", download: () => { calls.push("curl"); throw new Error("exit 35"); } },
        { label: "DeepSee Node", download: (_url, partial) => { calls.push("node"); writeFileSync(partial, "trusted"); } },
      ]);
      expect(used).toBe("DeepSee Node");
      expect(calls).toEqual(["curl", "node"]);
      expect(readFileSync(target, "utf8")).toBe("trusted");
      expect(existsSync(`${target}.partial`)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("fails closed when every trusted downloader fails", () => {
    const root = mkdtempSync(join(tmpdir(), "deepsee-download-"));
    const target = join(root, "uv.zip");
    try {
      expect(() => downloadWithFallback("https://example.test/uv.zip", target, [
        { label: "Node", download: () => { throw new Error("certificate rejected"); } },
        { label: "PowerShell", download: () => { throw new Error("TLS 1.2 unavailable"); } },
      ])).toThrow(/所有下载通道均失败/);
      expect(existsSync(target)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
