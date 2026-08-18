import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getOCRStatus, getOCRToolsState, managedOCRPython, uninstallOCR, writeOCRState } from "./ocr-manager.mjs";

const roots = [];
const originalHome = process.env.OPENDS_OCR_HOME;
const originalPath = process.env.PATH;

afterEach(() => {
  if (originalHome === undefined) delete process.env.OPENDS_OCR_HOME;
  else process.env.OPENDS_OCR_HOME = originalHome;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const stateRoot = mkdtempSync(join(tmpdir(), "deepsee-ocr-state-"));
  const managedRoot = mkdtempSync(join(tmpdir(), "deepsee-ocr-managed-"));
  roots.push(stateRoot, managedRoot);
  process.env.OPENDS_OCR_HOME = managedRoot;
  process.env.PATH = "";
  return { stateRoot, managedRoot };
}

describe("managed OCR catalog", () => {
  it("exposes three complementary installable OCR choices", () => {
    const { stateRoot } = fixture();
    expect(getOCRToolsState(stateRoot).catalog).toEqual([
      expect.objectContaining({ id: "mineru", bestFor: expect.stringContaining("复杂") }),
      expect.objectContaining({ id: "paddleocr", bestFor: expect.stringContaining("多语言") }),
      expect.objectContaining({ id: "rapidocr", bestFor: expect.stringContaining("低资源") }),
    ]);
  });

  it("reports and safely removes an isolated managed Python OCR", () => {
    const { stateRoot, managedRoot } = fixture();
    const python = managedOCRPython(stateRoot, "rapidocr");
    mkdirSync(dirname(python), { recursive: true });
    writeFileSync(python, "");
    mkdirSync(join(managedRoot, "rapidocr", "model-cache"), { recursive: true });
    writeFileSync(join(managedRoot, "rapidocr", "model-cache", "model.bin"), "fixture");
    writeFileSync(join(managedRoot, "rapidocr", "keep.txt"), "unrelated");
    writeOCRState(stateRoot, "rapidocr", { status: "ready", installMethod: "UV · 官方 PyPI" });

    expect(getOCRStatus(stateRoot, "rapidocr")).toMatchObject({
      status: "ready", installed: true, managed: true, executable: python, progress: 100,
    });
    expect(uninstallOCR(stateRoot, "rapidocr")).toMatchObject({
      status: "not-installed", installed: false, message: expect.stringContaining("已卸载"),
    });
    expect(existsSync(python)).toBe(false);
    expect(existsSync(join(managedRoot, "rapidocr", "model-cache"))).toBe(false);
    expect(existsSync(join(managedRoot, "rapidocr", "keep.txt"))).toBe(true);
  });

  it("rejects unknown OCR identifiers", () => {
    const { stateRoot } = fixture();
    expect(() => getOCRStatus(stateRoot, "unknown")).toThrow("不存在");
    expect(() => uninstallOCR(stateRoot, "../outside")).toThrow("不存在");
  });

  it("returns a concise redacted install diagnostic after an OCR failure", () => {
    const { stateRoot } = fixture();
    const logDir = join(stateRoot, ".opends-tools", "ocr", "rapidocr");
    mkdirSync(logDir, { recursive: true });
    writeFileSync(join(logDir, "install.stderr.log"), [
      "uv download timed out",
      "Authorization: Bearer secret-runtime-token",
      "pip failed with sk-1234567890abcdef",
    ].join("\n"));
    writeOCRState(stateRoot, "rapidocr", {
      status: "error",
      installed: false,
      attempts: [{ label: "UV", status: "failed", message: "timeout" }],
      message: "RapidOCR 自动安装未完成。",
    });

    const status = getOCRStatus(stateRoot, "rapidocr");
    expect(status.diagnostic).toContain("uv download timed out");
    expect(status.diagnostic).toContain("<redacted>");
    expect(status.diagnostic).not.toContain("secret-runtime-token");
    expect(status.diagnostic).not.toContain("1234567890abcdef");
  });
});
