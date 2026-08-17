window.__ModuleLoader__.load({
  id: "@wubing2023/deepsee",
  factory: (require) => {
    const module = { exports: {} };
    const exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const {
      Fragment,
      createElement,
      useEffect,
      useMemo,
      useState,
      useSyncExternalStore,
    } = require("react");

    const inject = ["connection", "remote", "settingsScope", "slots"];
    const adminBaseURL = "/api/deepsee";
    let liveRoutes = [];

    const css = `
      .opends-footer-button{box-sizing:border-box;width:100%;height:36px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:8px;padding:0 10px;cursor:pointer;font:inherit}
      .opends-footer-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .opends-footer-button.rail{width:36px;border-radius:50%;justify-content:center;padding:0}
      .opends-mark{width:20px;height:20px;border:1px solid currentColor;border-radius:6px;background:transparent;color:var(--dsw-alias-label-primary);font-size:9px;font-weight:650;display:inline-flex;align-items:center;justify-content:center;flex:none}
      .opends-footer-label{white-space:nowrap;overflow:hidden}
      .opends-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;padding:24px}
      .opends-mask{position:absolute;inset:0;background:rgba(25,27,32,.2);backdrop-filter:blur(1.5px)}
      .opends-panel{position:relative;z-index:1;width:min(800px,calc(100vw - 48px));height:min(608px,calc(100vh - 48px));border:1px solid rgba(127,127,127,.12);border-radius:22px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 20px 52px rgba(20,22,28,.2);display:flex;flex-direction:column;overflow:hidden}
      .opends-header{height:64px;box-sizing:border-box;padding:0 22px;display:flex;align-items:center;gap:10px;flex:none}
      .opends-header .opends-title{flex:1}
      .opends-title{font-size:17px;font-weight:600;color:var(--dsw-alias-label-primary)}
      .opends-close{width:32px;height:32px;border:0;border-radius:50%;background:transparent;color:var(--dsw-alias-label-primary);font-size:20px;line-height:1;cursor:pointer}
      .opends-close:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .opends-body{box-sizing:border-box;min-height:0;flex:1;padding:4px 22px 18px;overflow:auto;color:var(--dsw-alias-label-primary)}
      .opends-page-head{height:46px;display:flex;align-items:center;gap:14px;border-bottom:1px solid rgba(127,127,127,.14)}
      .opends-page-title{font-size:13px;line-height:1.3;margin:0;font-weight:560;color:var(--dsw-alias-label-secondary)}
      .opends-help{font-size:12px;color:var(--dsw-alias-label-tertiary);line-height:1.5;text-wrap:pretty}
      .opends-head-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
      .opends-button{height:32px;border:1px solid rgba(127,127,127,.14);border-radius:10px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);padding:0 12px;font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
      .opends-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .opends-button.secondary{background:var(--dsw-alias-bg-module-platform);border-color:transparent}
      .opends-button:disabled{opacity:.45;cursor:not-allowed}
      .opends-tabs{height:40px;margin-top:8px;border-bottom:1px solid rgba(127,127,127,.18);display:flex;align-items:flex-end;gap:22px}
      .opends-tab{height:40px;border:0;background:transparent;padding:0;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:13px;cursor:pointer;position:relative}
      .opends-tab.active{color:var(--dsw-alias-label-primary);font-weight:580}
      .opends-tab.active:after{content:"";position:absolute;left:0;right:0;bottom:-1px;height:2px;background:var(--dsw-alias-label-primary);border-radius:2px}
      .opends-prime{min-height:46px;display:flex;align-items:center;gap:9px}
      .opends-prime strong{font-size:13px;font-weight:560;color:var(--dsw-alias-label-secondary)}
      .opends-prime .opends-help{flex:1}
      .opends-switch{position:relative;width:36px;height:21px;display:inline-block;flex:none}
      .opends-switch input{position:absolute;opacity:0;pointer-events:none}
      .opends-switch-track{position:absolute;inset:0;border-radius:99px;background:rgba(127,127,127,.28);cursor:pointer;transition:background .16s ease}
      .opends-switch-track:after{content:"";position:absolute;width:17px;height:17px;left:2px;top:2px;border-radius:50%;background:white;box-shadow:0 1px 3px rgba(0,0,0,.16);transition:transform .16s ease}
      .opends-switch input:checked+.opends-switch-track{background:var(--dsw-alias-state-business-primary)}
      .opends-switch input:checked+.opends-switch-track:after{transform:translateX(15px)}
      .opends-matrix-wrap{overflow:auto;border:1px solid rgba(127,127,127,.14);border-radius:14px}
      .opends-matrix{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;font-variant-numeric:tabular-nums}
      .opends-matrix col:nth-child(1){width:54px}.opends-matrix col:nth-child(2){width:34%}.opends-matrix col:nth-child(3){width:18%}.opends-matrix col:nth-child(4){width:auto}
      .opends-matrix th{height:35px;padding:0 12px;text-align:left;color:var(--dsw-alias-label-tertiary);font-weight:500;border-bottom:1px solid rgba(127,127,127,.12)}
      .opends-matrix td{height:52px;padding:0 12px;border-bottom:1px solid rgba(127,127,127,.12);vertical-align:middle;min-width:0}
      .opends-matrix tbody tr:last-child td{border-bottom:0}
      .opends-matrix tbody tr:hover td{background:rgba(127,127,127,.045)}
      .opends-check{accent-color:var(--dsw-alias-state-business-primary)}
      .opends-model-name{font-size:13px;font-weight:570;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .opends-model-cell{display:flex;min-width:0;flex-direction:column;gap:4px}
      .opends-cli-model-select{width:100%;height:24px;border:1px solid rgba(127,127,127,.16);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:0 20px 0 6px;outline:none}
      .opends-cli-model-select:focus{border-color:rgba(48,111,230,.42);box-shadow:0 0 0 2px rgba(48,111,230,.09)}
      .opends-cell-muted,.opends-cell-clamp{color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .opends-source-pill{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font-size:11px}
      .opends-edit-cell{min-height:29px;margin:-3px -7px;padding:5px 7px;border:1px solid transparent;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:text;color:var(--dsw-alias-label-secondary)}
      .opends-edit-cell:hover{border-color:rgba(127,127,127,.2);background:var(--dsw-alias-bg-layer-2)}
      .opends-edit-input{box-sizing:border-box;width:100%;height:31px;margin:-4px -7px;padding:5px 7px;border:1px solid var(--dsw-alias-state-business-primary);border-radius:7px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;outline:none}
      .opends-mini-switch{position:relative;width:32px;height:19px;display:inline-block;vertical-align:middle}.opends-mini-switch input{position:absolute;opacity:0;pointer-events:none}.opends-mini-track{position:absolute;inset:0;border-radius:99px;background:rgba(127,127,127,.28);cursor:pointer}.opends-mini-track:after{content:"";position:absolute;width:15px;height:15px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.16);transition:transform .16s ease}.opends-mini-switch input:checked+.opends-mini-track{background:var(--dsw-alias-state-business-primary)}.opends-mini-switch input:checked+.opends-mini-track:after{transform:translateX(13px)}
      .opends-mini-switch input:disabled+.opends-mini-track{opacity:.38;cursor:not-allowed}.opends-row-locked td{color:var(--dsw-alias-label-tertiary)}
      .opends-status{font-size:11px;white-space:nowrap}.opends-status:before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:currentColor;margin-right:5px;vertical-align:1px}
      .opends-status-ready{color:#248261}.opends-status-installed{color:#8a7351}.opends-status-unavailable,.opends-status-error{color:#b24d4d}
      .opends-selection{margin-top:10px;display:flex;align-items:center;gap:8px;min-height:47px;padding:7px 12px;background:var(--dsw-alias-bg-module-platform);border:1px solid rgba(127,127,127,.14);border-radius:11px}
      .opends-selection strong{font-size:12px;white-space:nowrap}.opends-selection .opends-help{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .opends-selection .opends-button{margin-left:auto;height:30px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border:1px solid rgba(127,127,127,.2)}
      .opends-editor{margin-top:10px;padding:14px 14px 12px;border:1px solid rgba(127,127,127,.16);border-radius:11px;background:var(--dsw-alias-bg-layer-2)}
      .opends-editor-head{display:flex;align-items:flex-start;gap:10px;padding-bottom:12px;border-bottom:1px solid rgba(127,127,127,.14)}
      .opends-editor-title{font-size:14px;font-weight:600}
      .opends-editor-head .opends-status{margin-left:auto}
      .opends-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:12px}
      .opends-field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--dsw-alias-label-tertiary)}
      .opends-field.wide{grid-column:1/-1}
      .opends-input,.opends-textarea{box-sizing:border-box;width:100%;border:1px solid rgba(127,127,127,.22);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;padding:8px 10px;outline:none}
      .opends-input{height:36px}.opends-textarea{min-height:66px;resize:vertical;line-height:1.45}
      .opends-input:focus,.opends-textarea:focus{border-color:var(--dsw-alias-state-business-primary)}
      .opends-editor-actions,.opends-footer-actions{display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-top:12px}
      .opends-message{font-size:12px;color:var(--dsw-alias-label-secondary);margin-right:auto}
      .opends-note{padding:11px 13px;border:1px solid rgba(47,107,255,.18);border-radius:10px;background:rgba(47,107,255,.06);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}
      .opends-preferences{border-bottom:1px solid rgba(127,127,127,.14)}
      .opends-init-strip{min-height:36px;display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:11px;border-bottom:1px solid rgba(127,127,127,.12);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.opends-init-strip:before{content:"";width:6px;height:6px;border-radius:50%;background:#34a876;flex:none}.opends-init-strip a{color:inherit;text-decoration:none;border-bottom:1px solid rgba(127,127,127,.32)}.opends-init-strip a:hover{color:var(--dsw-alias-label-primary)}
      .opends-pref-row{min-height:55px;display:grid;grid-template-columns:180px minmax(240px,1fr);align-items:center;gap:18px;border-top:1px solid rgba(127,127,127,.12)}.opends-pref-row:first-child{border-top:0}
      .opends-pref-label{font-size:13px;font-weight:540;color:var(--dsw-alias-label-primary)}.opends-pref-control{width:min(340px,100%);justify-self:end;border:0;background:var(--dsw-alias-bg-module-platform);border-radius:12px}.opends-pref-action{justify-self:end}.opends-tool-install{min-width:72px}
      .opends-vision-controls{width:min(430px,100%);justify-self:end;display:grid;grid-template-columns:94px minmax(0,1fr);gap:8px}.opends-vision-kind,.opends-vision-target{border:0;background:var(--dsw-alias-bg-module-platform);border-radius:12px}.opends-vision-target{width:100%;min-width:0}.opends-ocr-target{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.opends-ocr-target .opends-button{white-space:nowrap}.opends-mineru-progress{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px;color:var(--dsw-alias-label-tertiary);font-size:10px}.opends-mineru-progress progress{width:100%;height:5px;border:0;border-radius:99px;overflow:hidden;background:rgba(127,127,127,.16)}.opends-mineru-progress progress::-webkit-progress-bar{background:rgba(127,127,127,.16)}.opends-mineru-progress progress::-webkit-progress-value{background:var(--dsw-alias-state-business-primary);border-radius:99px}.opends-mineru-progress progress::-moz-progress-bar{background:var(--dsw-alias-state-business-primary);border-radius:99px}.opends-ocr-comparison{grid-column:1/-1;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:1.45}
      .opends-model-warning{color:#a56a45}
      .opends-status-list{padding-top:6px}.opends-status-row{min-height:52px;display:grid;grid-template-columns:1fr 110px 90px;align-items:center;border-bottom:1px solid rgba(127,127,127,.14);gap:12px;font-size:12px}
      .opends-empty{padding:36px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
      .opends-select{box-sizing:border-box;width:100%;height:36px;border:1px solid rgba(127,127,127,.22);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;padding:0 9px;outline:none}
      .opends-onboarding{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;padding:24px}
      .opends-onboarding-card{position:relative;z-index:1;width:min(520px,calc(100vw - 48px));border-radius:22px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 18px 50px rgba(20,22,28,.18);padding:26px;display:flex;flex-direction:column;gap:16px}
      @media(max-width:700px){.opends-panel{width:calc(100vw - 24px);height:calc(100vh - 24px)}.opends-overlay{padding:12px}.opends-body{padding:4px 16px 16px}.opends-grid{grid-template-columns:1fr}.opends-field.wide{grid-column:auto}.opends-pref-row{grid-template-columns:1fr auto}.opends-pref-control,.opends-vision-controls{grid-column:1/-1;width:100%;justify-self:stretch;margin-bottom:10px}.opends-matrix col:nth-child(3),.opends-matrix th:nth-child(3),.opends-matrix td:nth-child(3){display:none}.opends-matrix col:nth-child(2){width:40%}.opends-head-actions .secondary{display:none}}
    `;

    if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css="opends-bridge"]') === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "opends-bridge";
      tag.dataset.pluginCss = "opends-bridge";
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    const noticeStyle = Object.freeze({
      alignItems: "center",
      background: "rgba(47, 107, 255, 0.08)",
      border: "1px solid rgba(47, 107, 255, 0.22)",
      borderRadius: 10,
      color: "#315a9b",
      display: "flex",
      fontSize: 12,
      gap: 8,
      lineHeight: 1.5,
      padding: "7px 10px",
    });

    function VisionBridgeNotice({ input }) {
      if (input.imageIds.length === 0) return null;
      const vision = liveRoutes.find((route) => route.enabled !== false && route.visionLevel === "full-vision" && route.status === "ready");
      const label = vision ? `${vision.provider} / ${vision.model}` : "已配置的视觉模型";
      return createElement(
        "div",
        { role: "status", style: noticeStyle },
        createElement("span", { "aria-hidden": true }, "\u25c9"),
        createElement("span", null, `DeepSee 视觉桥：当前由 ${label} 识图，DeepSeek 将根据识图结果继续回答`),
      );
    }

    function useSettingsSnapshot(scope) {
      return useSyncExternalStore(
        (listener) => scope.subscribe(listener),
        () => scope.getSnapshot(),
        () => scope.getSnapshot(),
      );
    }

    function effectiveOverride(route, overrides) {
      const override = overrides.find((item) => item && item.id === route.id);
      return override ? { ...route, ...override } : route;
    }

    function routeDisplayName(route) {
      if (route.displayName) return route.displayName;
      const labels = {
        "deepseek-v4-flash": "DeepSeek V4 Flash",
        "kimi-k3": "Kimi K3",
        "claude-code": "Claude Code",
        "codex-cli": "Codex CLI",
        "kimi-cli": "Kimi CLI",
        mineru: "MinerU",
      };
      return labels[route.model] || `${route.provider} / ${route.model}`;
    }

    function routeSourceLabel(route) {
      return route.sourceLabel || ({ harness: "Harness", api: "API", cli: "CLI", ocr: "本地" })[route.source] || route.source;
    }

    function capabilityLabel(values) {
      const labels = {
        text: "文本",
        reasoning: "推理",
        tools: "工具",
        coding: "编码",
        vision: "视觉",
        "long-context": "长上下文",
        "image-generation": "图像生成",
        "image-editing": "图像编辑",
        "audio-input": "音频理解",
        "audio-generation": "音频生成",
        "video-input": "视频理解",
        "video-generation": "视频生成",
        document: "文档",
        ocr: "OCR",
        "structured-output": "结构化输出",
        writing: "写作",
        search: "检索",
        reranking: "重排",
        embedding: "向量",
        translation: "翻译",
        local: "本地",
      };
      const canonical = new Set(Object.keys(labels));
      const natural = (values || []).filter((value) => !canonical.has(value));
      const visible = natural.length > 0 ? natural : (values || []);
      return visible.map((value) => labels[value] || value).join(" · ");
    }

    function EditableCell({ value, displayValue, placeholder, label, help, disabled, onSave }) {
      const [editing, setEditing] = useState(false);
      const [draft, setDraft] = useState(value || "");
      const [saving, setSaving] = useState(false);

      useEffect(() => {
        if (!editing) setDraft(value || "");
      }, [value, editing]);

      const commit = async () => {
        const next = draft.trim();
        if (next === (value || "").trim()) {
          setEditing(false);
          return;
        }
        setSaving(true);
        try {
          await onSave(next);
          setEditing(false);
        } finally {
          setSaving(false);
        }
      };

      if (editing) {
        return createElement("input", {
          className: "opends-edit-input",
          value: draft,
          disabled: disabled || saving,
          autoFocus: true,
          "aria-label": `编辑${label}`,
          onChange: (event) => setDraft(event.target.value),
          onBlur: commit,
          onKeyDown: (event) => {
            if (event.key === "Enter") { event.preventDefault(); commit(); }
            if (event.key === "Escape") { setDraft(value || ""); setEditing(false); }
          },
        });
      }
      return createElement("div", {
        className: "opends-edit-cell",
        title: `${help ? `${help} · ` : ""}${value || placeholder || "未填写"} · 双击编辑`,
        tabIndex: disabled ? -1 : 0,
        onDoubleClick: () => !disabled && setEditing(true),
        onKeyDown: (event) => {
          if (!disabled && (event.key === "Enter" || event.key === "F2")) setEditing(true);
        },
      }, displayValue || value || placeholder || "—");
    }

    function openNativeModelSettings(exitCurrent) {
      if (typeof exitCurrent === "function") exitCurrent();
      setTimeout(() => {
        const visibleDialog = [...document.querySelectorAll('[role="dialog"]')]
          .find((dialog) => [...dialog.querySelectorAll("button")].some((button) => button.textContent?.trim() === "模型"));
        const openModels = () => {
          const dialog = document.querySelector('[role="dialog"]');
          const modelButton = [...(dialog?.querySelectorAll("button") || [])]
            .find((button) => button.textContent?.trim() === "模型");
          if (modelButton) modelButton.click();
        };
        if (visibleDialog) {
          openModels();
          return;
        }
        const trigger = [...document.querySelectorAll('button[aria-haspopup="dialog"]')]
          .find((button) => button.getAttribute("aria-expanded") !== null);
        if (!trigger) return;
        trigger.click();
        setTimeout(openModels, 60);
      }, 30);
    }

    function DeepSeeSettings({ scope, api, exitToNativeModels }) {
      const snapshot = useSettingsSnapshot(scope);
      const config = snapshot.value || {};
      const [localRoutes, setLocalRoutes] = useState(liveRoutes);
      const [preferences, setPreferences] = useState({ primeAutoWorkflow: config.primeAutoWorkflow !== false });
      const [ocrTools, setOcrTools] = useState([
        { id: "mineru", label: "MinerU", bestFor: "复杂 PDF、论文、表格与公式", status: "not-installed", managed: true, progress: 0, message: "正在读取…" },
        { id: "paddleocr", label: "PaddleOCR", bestFor: "多语言图片、扫描件与通用 PDF", status: "not-installed", managed: true, progress: 0, message: "正在读取…" },
        { id: "rapidocr", label: "RapidOCR", bestFor: "截图、票据与低资源 CPU 快速识字", status: "not-installed", managed: true, progress: 0, message: "正在读取…" },
      ]);
      const [update, setUpdate] = useState({ status: "idle", message: "尚未检查更新。" });
      const [initialization, setInitialization] = useState({ vision: null, localRuntimes: [], desktopApps: [], instructions: { files: [] } });
      const [message, setMessage] = useState("");
      const [verifying, setVerifying] = useState(false);
      const [serviceReady, setServiceReady] = useState(false);
      const routes = useMemo(() => localRoutes.filter((route) => route.source !== "ocr"), [localRoutes]);
      const primaryOptions = useMemo(() => routes.filter((route) => (
        route.status === "ready"
        && route.enabled !== false
        && (route.source === "harness" || route.source === "api")
        && (!Array.isArray(route.outputModalities) || route.outputModalities.length === 0 || route.outputModalities.includes("text"))
      )), [routes]);
      const visionOptions = useMemo(() => routes.filter((route) => (
        route.status === "ready" && route.enabled !== false && route.visionLevel === "full-vision"
      )), [routes]);
      const profiling = useMemo(() => routes.some((route) => route.profileStatus === "pending" || route.profileStatus === "profiling"), [routes]);

      const applyServerState = (state) => {
        if (!state || typeof state !== "object") return;
        if (Array.isArray(state.routes)) {
          liveRoutes = state.routes.filter((route) => route.source !== "ocr");
          setLocalRoutes(liveRoutes);
        }
        if (state.preferences && typeof state.preferences === "object") setPreferences(state.preferences);
        if (Array.isArray(state.tools?.ocr?.catalog)) setOcrTools(state.tools.ocr.catalog);
        if (state.update && typeof state.update === "object") setUpdate(state.update);
        if (state.initialization && typeof state.initialization === "object") setInitialization(state.initialization);
      };

      const requestAdmin = async (path, options = {}) => {
        const response = await fetch(`${adminBaseURL}${path}`, {
          ...options,
          headers: {
            ...(options.body ? { "content-type": "application/json" } : {}),
            ...(options.headers || {}),
          },
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "DeepSee 本机服务请求失败。");
        return result;
      };

      const loadState = async () => {
        try {
          const result = await requestAdmin("/v1/models");
          applyServerState(result);
          setServiceReady(true);
        } catch {
          setServiceReady(false);
          setMessage("DeepSee 插件服务尚未就绪；重启 Harness 后即可同步模型与 Runtime 状态。");
        }
      };

      const syncHarnessModels = async (quiet = false, retryProfiles = false) => {
        if (!api?.llm?.models) return undefined;
        const response = await api.llm.models({});
        if (!response?.result?.ok) throw new Error(response?.result?.error?.message || "无法读取 Harness 模型目录。");
        const result = await requestAdmin("/v1/harness/models", {
          method: "POST",
          body: JSON.stringify({ ...response.result.value, retryProfiles }),
        });
        applyServerState(result.state);
        if (!quiet) setMessage(result.message || "已同步 Harness 模型目录。");
        return result;
      };

      useEffect(() => {
        void (async () => {
          await loadState();
          try {
            await syncHarnessModels(true);
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Harness 模型目录同步失败。");
          }
        })();
      }, []);

      useEffect(() => {
        if (!ocrTools.some((tool) => tool.status === "installing") && !profiling && !["checking", "updating"].includes(update.status)) return undefined;
        const timer = setInterval(loadState, 2000);
        return () => clearInterval(timer);
      }, [ocrTools.some((tool) => tool.status === "installing"), profiling, update.status]);

      useEffect(() => {
        if (update.status === "restart-required") setMessage(update.message || "DeepSee 已升级；重启 Harness 后生效。");
      }, [update.status]);

      const saveRouteFields = async (route, fields) => {
        const before = localRoutes;
        setLocalRoutes((current) => current.map((item) => item.id === route.id ? { ...item, ...fields } : item));
        try {
          const result = await requestAdmin("/v1/routes", {
            method: "POST",
            body: JSON.stringify({ id: route.id, ...fields }),
          });
          applyServerState(result.state);
          setMessage("已同步到 DeepSee；重启 Harness 后路由策略生效。");
        } catch (error) {
          setLocalRoutes(before);
          setMessage(error instanceof Error ? error.message : "保存失败，请稍后重试。");
        }
      };

      const toggleRoute = async (route, enabled) => {
        if (enabled && route.status !== "ready") {
          setMessage(route.statusReason || "该 CLI 未通过启动验证，暂时不能打开。");
          return;
        }
        await saveRouteFields(route, { enabled });
      };

      const savePreferences = async (fields) => {
        const before = preferences;
        setPreferences((current) => ({ ...current, ...fields }));
        try {
          const result = await requestAdmin("/v1/preferences", {
            method: "POST",
            body: JSON.stringify(fields),
          });
          applyServerState(result.state);
          if (typeof fields.primeAutoWorkflow === "boolean" && snapshot.writable) {
            try {
              await scope.set("primeAutoWorkflow", fields.primeAutoWorkflow);
            } catch {
              // Registry preferences remain canonical and are applied at restart.
            }
          }
          setMessage("首选项已保存，并同步到 Harness；重启后生效。");
        } catch (error) {
          setPreferences(before);
          setMessage(error instanceof Error ? error.message : "首选项保存失败。");
        }
      };

      const verifyRuntimes = async () => {
        setVerifying(true);
        try {
          const result = await requestAdmin("/v1/runtimes/verify", { method: "POST", body: "{}" });
          applyServerState(result.state);
          const synced = await syncHarnessModels(false, true);
          if (!synced) setMessage(result.message || "Runtime 验证完成。");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "Runtime 验证失败。");
        } finally {
          setVerifying(false);
        }
      };

      const updateOCRTool = (next) => setOcrTools((current) => current.map((tool) => tool.id === next?.id
        ? { ...tool, ...next }
        : tool));

      const installOCR = async (tool) => {
        try {
          const result = await requestAdmin(`/v1/tools/ocr/${tool.id}/install`, { method: "POST", body: "{}" });
          updateOCRTool({ ...result.tool, id: tool.id });
          setMessage(`MinerU 适合复杂文档；PaddleOCR 适合多语言通用识别；RapidOCR 适合轻量截图。${result.tool?.message || `${tool.label} 已开始后台安装。`}`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : `${tool.label} 安装启动失败。`);
        }
      };

      const uninstallOCR = async (tool) => {
        if (!window.confirm(`仅卸载由 DeepSee 管理的 ${tool.label}、模型缓存与虚拟环境。系统中的其他 ${tool.label} 安装不会被删除。继续吗？`)) return;
        try {
          const result = await requestAdmin(`/v1/tools/ocr/${tool.id}/uninstall`, { method: "POST", body: "{}" });
          updateOCRTool({ ...result.tool, id: tool.id });
          setMessage(result.tool?.message || `DeepSee 管理的 ${tool.label} 已卸载。`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : `${tool.label} 卸载失败。`);
        }
      };

      const checkUpdate = async () => {
        setUpdate((current) => ({ ...current, status: "checking", message: "正在检查 DeepSee 更新…" }));
        try {
          const result = await requestAdmin("/v1/update/check", { method: "POST", body: "{}" });
          setUpdate(result.update);
          if (result.update?.status === "available" || result.update?.status === "error") {
            setMessage(result.update.message || "版本检查完成。");
          }
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "版本检查失败。");
          await loadState();
        }
      };

      const installUpdate = async () => {
        try {
          const result = await requestAdmin("/v1/update/install", { method: "POST", body: "{}" });
          setUpdate(result.update);
          setMessage(result.update?.message || "DeepSee 已开始后台升级；可以关闭窗口，升级会继续。");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "DeepSee 升级启动失败。");
          await loadState();
        }
      };

      const matrix = createElement(Fragment, null,
        createElement("div", { className: "opends-prime", title: "每次启动会验证 CLI。不可用路线保持关闭；双击能力可修正路由描述。" },
          createElement("strong", null, "模型"),
        ),
        routes.length === 0
          ? createElement("div", { className: "opends-empty" }, "尚无模型或 Runtime。请点击重新验证。")
          : createElement("div", { className: "opends-matrix-wrap" },
              createElement("table", { className: "opends-matrix" },
                createElement("colgroup", null, createElement("col"), createElement("col"), createElement("col"), createElement("col")),
                createElement("thead", null,
                  createElement("tr", null,
                    createElement("th", null, "打开"),
                    createElement("th", null, "模型"),
                    createElement("th", null, "来源"),
                    createElement("th", { title: "双击内容可修正路由能力" }, "能力"),
                  ),
                ),
                createElement("tbody", null, routes.map((route) => {
                  const routeReady = route.status === "ready";
                  return createElement("tr", { key: route.id, className: routeReady ? "" : "opends-row-locked" },
                    createElement("td", null,
                      createElement("label", { className: "opends-mini-switch", title: routeReady ? "打开或关闭模型" : (route.statusReason || "未通过启动验证") },
                        createElement("input", { type: "checkbox", checked: routeReady && route.enabled !== false, disabled: !serviceReady || !routeReady, "aria-label": `打开 ${routeDisplayName(route)}`, onChange: (event) => toggleRoute(route, event.target.checked) }),
                        createElement("span", { className: "opends-mini-track" }),
                      ),
                    ),
                    createElement("td", { title: route.statusReason || route.profileError || (route.profileStatus === "profiling" ? "正在生成能力画像" : "运行正常") },
                      createElement("div", { className: "opends-model-cell" },
                        createElement("div", { className: "opends-model-name" }, routeDisplayName(route)),
                        route.source === "cli" && Array.isArray(route.cliModels) && route.cliModels.length > 0
                          ? createElement("select", {
                              className: "opends-cli-model-select",
                              "aria-label": `${routeDisplayName(route)} 使用模型`,
                              value: route.cliModel || "",
                              disabled: !serviceReady || !routeReady || route.enabled === false,
                              onChange: (event) => saveRouteFields(route, { cliModel: event.target.value }),
                            },
                              createElement("option", { value: "" }, "默认模型"),
                              route.cliModels.map((model) => createElement("option", { key: model, value: model }, model)),
                            )
                          : null,
                      )),
                    createElement("td", null,
                      createElement("span", { className: "opends-source-pill" }, routeSourceLabel(route))),
                    createElement("td", null,
                      createElement(EditableCell, {
                        value: (route.capabilities || []).join(", "),
                        displayValue: capabilityLabel(route.capabilities) || (route.profileStatus === "error" ? "待分析" : "分析中…"),
                        label: "能力",
                        help: route.catalogSource === "models.dev"
                          ? `默认能力来自 Models.dev${route.catalogUpdatedAt ? `（${route.catalogUpdatedAt}）` : ""}${route.profileStatus === "pending" || route.profileStatus === "profiling" ? "，正在通过当前 Runtime 复核" : ""}`
                          : undefined,
                        disabled: !serviceReady,
                        placeholder: "自动分析",
                        onSave: (value) => saveRouteFields(route, { capabilities: value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }),
                      })),
                  );
                })),
              ),
            ),
      );

      const preferredPrimary = preferences.primaryRouteId || primaryOptions[0]?.id || "";
      const preferredVision = preferences.visionRouteId || visionOptions[0]?.id || "";
      const visionMode = preferences.visionMode === "ocr" ? "ocr" : "model";
      const selectedOCRId = ["mineru", "paddleocr", "rapidocr"].includes(preferences.ocrTool) ? preferences.ocrTool : "mineru";
      const selectedOCR = ocrTools.find((tool) => tool.id === selectedOCRId) || ocrTools[0];
      const updateAvailable = update.status === "available";
      const updateManual = update.status === "manual-required";
      const updateBusy = update.status === "checking" || update.status === "updating";
      const updateLabel = update.status === "checking"
        ? "检查中…"
        : update.status === "updating"
          ? "升级中…"
          : update.status === "restart-required"
            ? "重启生效"
            : updateAvailable
              ? `升级 ${update.latestVersion || ""}`.trim()
              : updateManual
                ? "需手动升级"
                : update.status === "error"
                  ? "重试更新"
                  : "更新";
      const preferencesPanel = createElement("section", { className: "opends-preferences", "aria-label": "深见 DeepSee 首选项" },
        createElement("div", { className: "opends-pref-row", title: "Prime 与视觉桥的最终回答模型；更改后在下次 Harness 启动时应用。" },
          createElement("div", { className: "opends-pref-label" }, "主模型"),
          createElement("select", { className: "opends-select opends-pref-control", "aria-label": "首选主模型", value: preferredPrimary, disabled: !serviceReady || primaryOptions.length === 0, onChange: (event) => savePreferences({ primaryRouteId: event.target.value }) },
            primaryOptions.length === 0 && createElement("option", { value: "" }, "暂无可用主模型"),
            primaryOptions.map((route) => createElement("option", { key: route.id, value: route.id }, `${routeDisplayName(route)} · ${routeSourceLabel(route)}`)),
          ),
        ),
        createElement("div", { className: "opends-pref-row", title: visionMode === "model" ? "图片交给所选多模态模型，再由主模型继续回答。" : `图片使用本地 OCR。${selectedOCR?.message || ""}` },
          createElement("div", { className: "opends-pref-label" }, "视觉读取"),
          createElement("div", { className: "opends-vision-controls" },
            createElement("select", { className: "opends-select opends-vision-kind", "aria-label": "视觉读取方式", value: visionMode, disabled: !serviceReady, onChange: (event) => savePreferences({ visionMode: event.target.value, ...(event.target.value === "ocr" ? { ocrTool: selectedOCRId } : {}) }) },
              createElement("option", { value: "model" }, "模型"),
              createElement("option", { value: "ocr" }, "OCR"),
            ),
            visionMode === "model"
              ? createElement("select", { className: "opends-select opends-vision-target", "aria-label": "首选视觉模型", value: preferredVision, disabled: !serviceReady || visionOptions.length === 0, onChange: (event) => savePreferences({ visionRouteId: event.target.value }) },
                  visionOptions.length === 0 && createElement("option", { value: "" }, "暂无视觉模型"),
                  visionOptions.map((route) => createElement("option", { key: route.id, value: route.id }, `${routeDisplayName(route)} · ${routeSourceLabel(route)}`)),
                )
              : createElement(Fragment, null,
                  createElement("div", { className: "opends-ocr-target" },
                    createElement("select", { className: "opends-select opends-vision-target", "aria-label": "本地 OCR", value: selectedOCRId, disabled: !serviceReady || ocrTools.some((tool) => tool.status === "installing"), onChange: (event) => savePreferences({ ocrTool: event.target.value }) },
                      ocrTools.map((tool) => createElement("option", { key: tool.id, value: tool.id }, `${tool.label} · ${tool.footprint || "本地"}`)),
                    ),
                    createElement("button", {
                      className: "opends-button secondary",
                      type: "button",
                      title: selectedOCR?.status === "ready" && selectedOCR?.managed === false
                        ? `这是系统已有的 ${selectedOCR.label}，DeepSee 不会卸载其他程序管理的环境。`
                        : `${selectedOCR?.bestFor || "本地 OCR"}。${selectedOCR?.message || "自动尝试 UV、Python/pip、国内镜像、便携运行时与官方源码 ZIP。"}`,
                      disabled: !serviceReady || selectedOCR?.status === "installing" || (selectedOCR?.status === "ready" && selectedOCR?.managed === false),
                      onClick: () => selectedOCR?.status === "ready" ? uninstallOCR(selectedOCR) : installOCR(selectedOCR),
                    }, selectedOCR?.status === "ready"
                      ? selectedOCR?.managed === false ? "系统安装" : "卸载"
                      : selectedOCR?.status === "installing" ? "安装中…" : selectedOCR?.status === "error" ? "重试" : "安装"),
                  ),
                  selectedOCR?.status === "installing" && createElement("div", { className: "opends-mineru-progress opends-ocr-progress", title: selectedOCR.message || `${selectedOCR.label} 正在后台安装` },
                    createElement("progress", { max: 100, value: Number.isFinite(selectedOCR.progress) ? selectedOCR.progress : 5, "aria-label": `${selectedOCR.label} 安装进度` }),
                    createElement("span", null, `${Math.round(Number.isFinite(selectedOCR.progress) ? selectedOCR.progress : 5)}%`),
                  ),
                  selectedOCR?.status === "installing" && createElement("div", { className: "opends-ocr-comparison" }, "MinerU · 复杂文档　PaddleOCR · 多语言通用　RapidOCR · 轻量截图"),
                ),
          ),
        ),
        createElement("div", { className: "opends-pref-row", title: "Prime 模式可为复杂任务选择 Harness 原生 Workflow。" },
          createElement("div", { className: "opends-pref-label" }, "自动 Workflow"),
          createElement("label", { className: "opends-switch opends-pref-action" },
            createElement("input", { type: "checkbox", checked: preferences.primeAutoWorkflow !== false, disabled: !serviceReady, "aria-label": "Prime 自动 Workflow", onChange: (event) => savePreferences({ primeAutoWorkflow: event.target.checked }) }),
            createElement("span", { className: "opends-switch-track" }),
          ),
        ),
      );

      const desktopRuntimeIds = new Set((initialization.desktopApps || []).map((app) => app.runtimeRouteId).filter(Boolean));
      const initializedParts = [
        initialization.vision?.name ? `视觉 ${initialization.vision.name}` : "",
        ...(initialization.localRuntimes || []).filter((runtime) => !desktopRuntimeIds.has(runtime.id)).map((runtime) => runtime.name),
        ...(initialization.instructions?.files || []).map((file) => file.name),
      ].filter(Boolean);
      const desktopApps = initialization.desktopApps || [];

      return createElement("div", { className: "opends-body" },
        createElement("div", { className: "opends-page-head" },
          createElement("h1", { className: "opends-page-title", title: "模型选择会在下次 Harness 启动时应用。" }, "模型与首选项"),
          createElement("div", { className: "opends-head-actions" },
            createElement("button", {
              className: `opends-button${updateAvailable || updateManual || update.status === "updating" || update.status === "restart-required" ? "" : " secondary"}`,
              type: "button",
              title: update.message || `当前版本 ${update.currentVersion || "未知"}`,
              disabled: !serviceReady || updateBusy || update.status === "restart-required",
              onClick: updateAvailable ? installUpdate : updateManual ? () => setMessage(update.message || "此版本需要运行一行安装命令手动升级。") : checkUpdate,
            }, updateLabel),
            createElement("button", { className: "opends-button secondary", type: "button", title: "重新检查本机 CLI、登录与 Harness 适配状态", disabled: verifying || !serviceReady, onClick: verifyRuntimes }, verifying ? "验证中…" : "验证"),
            createElement("button", { className: "opends-button", type: "button", title: "使用 Harness 已保存的凭证，并可获取供应商模型列表", onClick: exitToNativeModels }, "+ 添加模型"),
          ),
        ),
        (initializedParts.length > 0 || desktopApps.length > 0) && createElement("div", {
          className: "opends-init-strip",
          title: "桌面端只有在同时验证了 CLI 或 App Server 时才参与自动 Workflow；AGENTS.md、CLAUDE.md 与 agent.md 由 Harness 工作区指令加载器直接使用。",
        },
          createElement("span", null, `已自动初始化${initializedParts.length ? ` · ${initializedParts.join(" · ")}` : ""}`),
          desktopApps.map((app) => createElement(Fragment, { key: app.id },
            createElement("span", { "aria-hidden": true }, "·"),
            app.launchUrl
              ? createElement("a", { href: app.launchUrl, title: app.execution === "runtime" ? `${app.name} 已验证为可调用 Runtime；点击打开桌面端` : `${app.name} 已安装；点击打开。自动 Workflow 仍需对应 CLI 或 App Server` }, `${app.name}${app.execution === "runtime" ? "（可调用）" : "（可打开）"}`)
              : createElement("span", null, `${app.name}${app.execution === "runtime" ? "（可调用）" : "（已安装）"}`),
          )),
        ),
        preferencesPanel,
        matrix,
        (message || snapshot.status === "loading" || !snapshot.writable) && createElement("div", { className: "opends-footer-actions" },
          createElement("span", { className: "opends-message", role: "status" }, message || (snapshot.status === "loading" ? "正在读取设置…" : "当前设置只读。")),
        ),
      );
    }

    function DeepSeeFooter({ wide, scope, api }) {
      const [open, setOpen] = useState(false);
      return createElement(Fragment, null,
        createElement("button", {
          className: `opends-footer-button${wide ? "" : " rail"}`,
          type: "button",
          title: "深见 DeepSee 模型与 Workflow",
          onClick: () => setOpen(true),
        },
        createElement("span", { className: "opends-mark", "aria-hidden": true }, "见"),
        wide && createElement("span", { className: "opends-footer-label" }, "深见")),
        open && createElement("div", { className: "opends-overlay", role: "dialog", "aria-modal": true, "aria-label": "深见 DeepSee 设置" },
          createElement("div", { className: "opends-mask", onClick: () => setOpen(false) }),
          createElement("section", { className: "opends-panel" },
            createElement("header", { className: "opends-header" },
              createElement("div", { className: "opends-title" }, "深见 DeepSee"),
              createElement("button", { className: "opends-close", type: "button", "aria-label": "关闭深见设置", onClick: () => setOpen(false) }, "×"),
            ),
            createElement(DeepSeeSettings, { scope, api, exitToNativeModels: () => openNativeModelSettings(() => setOpen(false)) }),
          ),
        ),
      );
    }

    function DeepSeeSettingsSection({ scope, api, close }) {
      return createElement(DeepSeeSettings, { scope, api, exitToNativeModels: () => openNativeModelSettings(close) });
    }

    function VisionOnboarding({ complete, openSection, api }) {
      const [ready, setReady] = useState(null);
      useEffect(() => {
        let active = true;
        const initialize = async () => {
          let state;
          const verified = await fetch(`${adminBaseURL}/v1/runtimes/verify`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{}",
          });
          if (verified.ok) state = (await verified.json()).state;
          if (api?.llm?.models) {
            const catalog = await api.llm.models({});
            if (catalog?.result?.ok) {
              const synced = await fetch(`${adminBaseURL}/v1/harness/models`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify(catalog.result.value),
              });
              if (synced.ok) state = (await synced.json()).state;
            }
          }
          if (!state) {
            const response = await fetch(`${adminBaseURL}/v1/models`);
            if (!response.ok) throw new Error("not ready");
            state = await response.json();
          }
          return state;
        };
        initialize()
          .then((state) => {
            if (!active) return;
            const modelReady = Array.isArray(state.routes) && state.routes.some((route) => route.enabled !== false && route.status === "ready" && route.visionLevel === "full-vision");
            const selectedOCR = state.preferences?.ocrTool || "mineru";
            const ocrReady = state.preferences?.visionMode === "ocr" && state.tools?.ocr?.catalog?.some((tool) => tool.id === selectedOCR && tool.status === "ready");
            setReady(modelReady || ocrReady);
          })
          .catch(() => active && setReady(false));
        return () => { active = false; };
      }, []);
      useEffect(() => {
        if (ready === true) complete();
      }, [ready, complete]);
      if (ready === null) return null;
      if (ready) return null;
      return createElement("div", { className: "opends-onboarding" },
        createElement("div", { className: "opends-mask" }),
        createElement("section", { className: "opends-onboarding-card", role: "dialog", "aria-modal": true, "aria-label": "配置深见视觉模型" },
          createElement("span", { className: "opends-mark", "aria-hidden": true }, "见"),
          createElement("div", { className: "opends-title" }, "为深见配置视觉读取能力"),
          createElement("div", { className: "opends-help" }, "Prime 模式需要至少一条真实可用的视觉路线。推荐在模型设置中添加 Kimi、OpenAI、Claude 或兼容视觉 API。OCR-only Runtime 只能读取文字与版面。"),
          createElement("div", { className: "opends-footer-actions" },
            createElement("button", { className: "opends-button secondary", type: "button", onClick: complete }, "暂不配置，保持标准模式"),
            createElement("button", { className: "opends-button", type: "button", onClick: () => { complete(); openSection("models"); } }, "打开模型设置"),
          ),
        ),
      );
    }

    function apply(ctx) {
      const scope = ctx.settingsScope.bind({ namespace: "opends-bridge" });
      const api = ctx.get("connection").api;
      ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
        name: "conversation.input.dock",
        id: "opends-vision-bridge",
        order: 5,
        label: "深见视觉桥",
      }, VisionBridgeNotice));
      ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
        name: "sidebar.footer.action",
        id: "opends",
        order: 10,
        label: "深见",
        inject: () => ({ scope, api }),
      }, DeepSeeFooter));
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "opends",
        order: 25,
        label: "深见",
        inject: () => ({ scope, api }),
      }, DeepSeeSettingsSection));
      ctx.slots.inject("settings.onboarding", () => ctx.slots.register({
        name: "settings.onboarding",
        id: "opends-vision",
        order: 30,
        inject: () => ({ api }),
      }, VisionOnboarding));
    }

    exports.DeepSeeFooter = DeepSeeFooter;
    exports.DeepSeeSettings = DeepSeeSettings;
    exports.VisionBridgeNotice = VisionBridgeNotice;
    exports.VisionOnboarding = VisionOnboarding;
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
