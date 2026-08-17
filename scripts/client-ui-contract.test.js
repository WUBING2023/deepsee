import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const clientSource = readFileSync(new URL("../host/client.js", import.meta.url), "utf8");
const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

describe("DeepSee native-style model panel", () => {
  it("registers the browser module under the exact package name", () => {
    expect(clientSource).toContain(`id: "${manifest.name}"`);
  });

  it("uses the DeepSeek \u6df1\u89c1 name in the Harness-facing UI", () => {
    expect(clientSource).toContain("DeepSeek \u6df1\u89c1\uff1a\u5f53\u524d\u7531");
    expect(clientSource).toContain('label: "DeepSeek \u6df1\u89c1"');
    expect(clientSource).not.toContain("DeepSee \u89c6\u89c9\u6865\uff1a");
  });

  it("keeps the model directory to the four product-facing columns", () => {
    for (const heading of ["打开", "模型", "来源", "能力"]) {
      expect(clientSource).toContain(`"${heading}"`);
    }
    expect(clientSource).toContain('className: "opends-directory-columns"');
    expect(clientSource).not.toContain('createElement("thead"');
    expect(clientSource).not.toContain('"不擅长"');
  });

  it("keeps the directory visible and groups model lists by provider or local runtime", () => {
    expect(clientSource).toContain('createElement("section", { className: "opends-directory", "aria-label": "模型目录" }');
    expect(clientSource).not.toContain('createElement("details", { className: "opends-directory" }');
    expect(clientSource).toContain("groupModelRoutes(routes)");
    expect(clientSource).toContain('className: "opends-provider-group"');
    expect(clientSource).toContain('"桌面端 / 本地 CLI"');
    expect(clientSource).toContain('"Harness 供应商"');
    expect(clientSource).toContain('"API 供应商"');
    expect(clientSource).toContain('"模型目录"');
    expect(clientSource).toContain("一个订阅账号默认使用当前选中的一个模型");
  });

  it("adds a managed Runtime installer to the model directory header", () => {
    expect(clientSource).toContain('"aria-label": "添加 Runtime"');
    expect(clientSource).toContain('"aria-label": "Runtime 安装路径"');
    expect(clientSource).toContain('/v1/runtimes/${runtime.id}/install');
    expect(clientSource).toContain("opends-runtime-progress");
  });

  it("never exposes an internal route id through the model tooltip", () => {
    expect(clientSource).not.toContain("route.statusReason || route.id");
    expect(clientSource).toContain('"运行正常"');
  });

  it("keeps explanatory copy in hover titles instead of visible help blocks", () => {
    expect(clientSource).toContain('title: "按供应商、本地 CLI 或桌面端分组');
    expect(clientSource).toContain('"图片交给所选多模态模型');
  });

  it("reuses Harness credentials and native model management", () => {
    expect(clientSource).not.toContain("AddModelDialog");
    expect(clientSource).not.toContain('"API Key"');
    expect(clientSource).toContain("api.llm.models({})");
    expect(clientSource).toContain("openNativeModelSettings");
    expect(clientSource).toContain('requestAdmin("/v1/harness/models"');
  });

  it("opens the DeepSee page from the sidebar through the native settings shell", () => {
    expect(clientSource).toContain('name: "sidebar.footer.action"');
    expect(clientSource).toContain('onClick: () => openNativeSettingsSection("深见")');
    expect(clientSource).toContain('name: "settings.section"');
    expect(clientSource).not.toContain('className: "opends-overlay"');
    expect(clientSource).not.toContain('aria-label": "深见 DeepSee 设置"');
  });

  it("allows verified Codex and Claude Code subscription runtimes to become the base model", () => {
    expect(clientSource).toContain('route.source === "harness" || route.source === "api" || route.source === "cli"');
    expect(clientSource).toContain("Codex 与 Claude Code 使用本机已登录的订阅 Runtime");
  });

  it("manages several model instances under one subscription while starting with one", () => {
    expect(clientSource).toContain("cliRuntimeId(route)");
    expect(clientSource).toContain('requestAdmin("/v1/cli-models"');
    expect(clientSource).toContain('requestAdmin("/v1/cli-models/remove"');
    expect(clientSource).toContain('"aria-label": `为 ${group.label} 添加模型`');
    expect(clientSource).toContain('"aria-label": `移除 ${route.cliModel || routeDisplayName(route)}`');
    expect(clientSource).toContain('`${group.routes.length} 模型`');
    expect(clientSource).toContain("selectedCliModels.has(model)");
    expect(clientSource).toContain("Boolean(group.runtimeId && addingCliRuntime === group.runtimeId)");
  });

  it("auto-initializes verified runtimes and existing workspace instructions", () => {
    expect(clientSource).toContain('fetch(`${adminBaseURL}/v1/runtimes/verify`');
    expect(clientSource).toContain('api.llm.models({})');
    expect(clientSource).toContain("已自动初始化");
    expect(clientSource).toContain("AGENTS.md、CLAUDE.md 与 agent.md");
    expect(clientSource).toContain("initialization.instructions?.global?.files");
    expect(clientSource).toContain("只读继承到主会话、订阅基础模型和 Workflow");
    expect(clientSource).toContain("initialization.desktopApps");
    expect(clientSource).toContain("（可调用）");
  });

  it("shows a simple stage-based OCR installation progress bar", () => {
    expect(clientSource).toContain('createElement("progress"');
    expect(clientSource).toContain('"aria-label": `${selectedOCR.label} 安装进度`');
    expect(clientSource).toContain("selectedOCR.progress");
    expect(clientSource).toContain("MinerU · 复杂文档");
    expect(clientSource).toContain("PaddleOCR · 多语言通用");
    expect(clientSource).toContain("RapidOCR · 轻量截图");
    expect(clientSource).toContain('className: "opends-ocr-feedback", role: "status"');
    expect(clientSource).toContain("selectedOCR.message");
  });

  it("keeps operation feedback near its trigger instead of below the model directory", () => {
    expect(clientSource).toContain('className: "opends-message-bar", role: "status"');
    expect(clientSource.indexOf('className: "opends-message-bar", role: "status"')).toBeLessThan(clientSource.indexOf("preferencesPanel,"));
    expect(clientSource).not.toContain("MinerU 适合复杂文档；PaddleOCR 适合多语言通用识别；RapidOCR 适合轻量截图。");
  });

  it("can uninstall only the selected OCR environment managed by DeepSee", () => {
    expect(clientSource).toContain('requestAdmin(`/v1/tools/ocr/${tool.id}/uninstall`');
    expect(clientSource).toContain("系统中的其他 ${tool.label} 安装不会被删除");
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
    expect(clientSource).toContain('id: "paddleocr"');
    expect(clientSource).toContain('id: "rapidocr"');
    expect(clientSource).toContain('requestAdmin(`/v1/tools/ocr/${tool.id}/install`');
    expect(clientSource).toContain("自动尝试 UV、Python/pip、国内镜像、便携运行时与官方源码 ZIP");
  });

  it("uses the selected live OCR or visual route and orders unavailable runtimes last", () => {
    expect(clientSource).toContain("livePreferences.visionMode === \"ocr\"");
    expect(clientSource).toContain("本地 OCR 读取图片文字与版面");
    expect(clientSource).toContain("route.id === livePreferences.visionRouteId");
    expect(clientSource).toContain("rank(left.group) - rank(right.group)");
    expect(clientSource).toContain('route.source === "harness" && /deepseek/i.test');
  });

  it("offers cached version checks and one-click automatic upgrades", () => {
    expect(clientSource).toContain('requestAdmin("/v1/update/check"');
    expect(clientSource).toContain('requestAdmin("/v1/update/install"');
    expect(clientSource).toContain('"重试更新"');
    expect(clientSource).toContain('"重启生效"');
    expect(clientSource).toContain('"需手动升级"');
  });
});
