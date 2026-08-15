import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clientSource = readFileSync(new URL("../host/client.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("DeepSee native-style model panel", () => {
  it("registers the browser module under the exact package name", () => {
    expect(clientSource).toContain(`id: "${manifest.name}"`);
  });

  it("keeps the model directory to the four product-facing columns", () => {
    for (const heading of ["打开", "模型", "来源", "能力"]) {
      expect(clientSource).toContain(`createElement("th",`);
      expect(clientSource).toContain(`"${heading}"`);
    }
    expect(clientSource).not.toContain('"不擅长"');
  });

  it("never exposes an internal route id through the model tooltip", () => {
    expect(clientSource).not.toContain("route.statusReason || route.id");
    expect(clientSource).toContain('"运行正常"');
  });

  it("keeps explanatory copy in hover titles instead of visible help blocks", () => {
    expect(clientSource).toContain('title: "每次启动会验证 CLI');
    expect(clientSource).toContain('"图片交给所选多模态模型');
  });

  it("reuses Harness credentials and native model management", () => {
    expect(clientSource).not.toContain("AddModelDialog");
    expect(clientSource).not.toContain('"API Key"');
    expect(clientSource).toContain("api.llm.models({})");
    expect(clientSource).toContain("openNativeModelSettings");
  });

  it("uses the plugin Host route instead of a companion port or injected token", () => {
    expect(clientSource).toContain('const adminBaseURL = "/api/deepsee"');
    expect(clientSource).not.toContain("3091");
    expect(clientSource).not.toContain("authorization:");
    expect(clientSource).not.toContain("__OPENDS_ADMIN__");
    expect(clientSource).not.toContain("__OPENDS_ROUTES__");
  });

  it("offers one visual reader control with model and OCR targets", () => {
    expect(clientSource).toContain('"视觉读取"');
    expect(clientSource).toContain('createElement("option", { value: "model" }, "模型")');
    expect(clientSource).toContain('createElement("option", { value: "ocr" }, "OCR")');
    expect(clientSource).toContain("MinerU · 安装");
  });
});
