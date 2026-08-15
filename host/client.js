window.__ModuleLoader__.load({
  id: "deepsee",
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
      .opends-pref-row{min-height:55px;display:grid;grid-template-columns:180px minmax(240px,1fr);align-items:center;gap:18px;border-top:1px solid rgba(127,127,127,.12)}.opends-pref-row:first-child{border-top:0}
      .opends-pref-label{font-size:13px;font-weight:540;color:var(--dsw-alias-label-primary)}.opends-pref-control{width:min(340px,100%);justify-self:end;border:0;background:var(--dsw-alias-bg-module-platform);border-radius:12px}.opends-pref-action{justify-self:end}.opends-tool-install{min-width:72px}
      .opends-vision-controls{width:min(430px,100%);justify-self:end;display:grid;grid-template-columns:94px minmax(0,1fr);gap:8px}.opends-vision-kind,.opends-vision-target{border:0;background:var(--dsw-alias-bg-module-platform);border-radius:12px}.opends-vision-target{width:100%;min-width:0}
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
        local: "本地",
      };
      const canonical = new Set(Object.keys(labels));
      const natural = (values || []).filter((value) => !canonical.has(value));
      const visible = natural.length > 0 ? natural : (values || []);
      return visible.map((value) => labels[value] || value).join(" · ");
    }

    function EditableCell({ value, displayValue, placeholder, label, disabled, onSave }) {
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
        title: `${value || placeholder || "未填写"} · 双击编辑`,
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
      const [mineru, setMineru] = useState({ status: "not-installed", installed: false, message: "正在读取…" });
      const [message, setMessage] = useState("");
      const [verifying, setVerifying] = useState(false);
      const [serviceReady, setServiceReady] = useState(false);
      const routes = useMemo(() => localRoutes.filter((route) => route.source !== "ocr"), [localRoutes]);
      const primaryOptions = useMemo(() => routes.filter((route) => (
        route.status === "ready" && route.enabled !== false && (route.source === "harness" || route.source === "api")
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
        if (state.tools?.mineru) setMineru(state.tools.mineru);
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
        if (mineru.status !== "installing" && !profiling) return undefined;
        const timer = setInterval(loadState, 2000);
        return () => clearInterval(timer);
      }, [mineru.status, profiling]);

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

      const installMinerU = async () => {
        try {
          const result = await requestAdmin("/v1/tools/mineru/install", { method: "POST", body: "{}" });
          setMineru(result.tool);
          setMessage("MinerU 已开始在 DeepSee 独立环境中安装；可以关闭窗口，安装会继续。 ");
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "MinerU 安装启动失败。");
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
                      createElement(EditableCell, { value: (route.capabilities || []).join(", "), displayValue: route.profileStatus === "pending" || route.profileStatus === "profiling" ? "分析中…" : route.profileStatus === "error" ? "待分析" : capabilityLabel(route.capabilities), label: "能力", disabled: !serviceReady, placeholder: "自动分析", onSave: (value) => saveRouteFields(route, { capabilities: value.split(/[,，]/).map((item) => item.trim()).filter(Boolean) }) })),
                  );
                })),
              ),
            ),
      );

      const preferredPrimary = preferences.primaryRouteId || primaryOptions[0]?.id || "";
      const preferredVision = preferences.visionRouteId || visionOptions[0]?.id || "";
      const visionMode = preferences.visionMode === "ocr" ? "ocr" : "model";
      const preferencesPanel = createElement("section", { className: "opends-preferences", "aria-label": "深见 DeepSee 首选项" },
        createElement("div", { className: "opends-pref-row", title: "Prime 与视觉桥的最终回答模型；更改后在下次 Harness 启动时应用。" },
          createElement("div", { className: "opends-pref-label" }, "主模型"),
          createElement("select", { className: "opends-select opends-pref-control", "aria-label": "首选主模型", value: preferredPrimary, disabled: !serviceReady || primaryOptions.length === 0, onChange: (event) => savePreferences({ primaryRouteId: event.target.value }) },
            primaryOptions.length === 0 && createElement("option", { value: "" }, "暂无可用主模型"),
            primaryOptions.map((route) => createElement("option", { key: route.id, value: route.id }, `${routeDisplayName(route)} · ${routeSourceLabel(route)}`)),
          ),
        ),
        createElement("div", { className: "opends-pref-row", title: visionMode === "model" ? "图片交给所选多模态模型，再由主模型继续回答。" : `图片使用本地 OCR 与版面解析。${mineru.message || ""}` },
          createElement("div", { className: "opends-pref-label" }, "视觉读取"),
          createElement("div", { className: "opends-vision-controls" },
            createElement("select", { className: "opends-select opends-vision-kind", "aria-label": "视觉读取方式", value: visionMode, disabled: !serviceReady, onChange: (event) => savePreferences({ visionMode: event.target.value, ...(event.target.value === "ocr" ? { ocrTool: "mineru" } : {}) }) },
              createElement("option", { value: "model" }, "模型"),
              createElement("option", { value: "ocr" }, "OCR"),
            ),
            visionMode === "model"
              ? createElement("select", { className: "opends-select opends-vision-target", "aria-label": "首选视觉模型", value: preferredVision, disabled: !serviceReady || visionOptions.length === 0, onChange: (event) => savePreferences({ visionRouteId: event.target.value }) },
                  visionOptions.length === 0 && createElement("option", { value: "" }, "暂无视觉模型"),
                  visionOptions.map((route) => createElement("option", { key: route.id, value: route.id }, `${routeDisplayName(route)} · ${routeSourceLabel(route)}`)),
                )
              : createElement("button", { className: "opends-button secondary opends-vision-target", type: "button", disabled: !serviceReady || mineru.status === "ready" || mineru.status === "installing", onClick: installMinerU }, mineru.status === "ready" ? "MinerU · 已就绪" : mineru.status === "installing" ? "MinerU · 安装中…" : "MinerU · 安装"),
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

      return createElement("div", { className: "opends-body" },
        createElement("div", { className: "opends-page-head" },
          createElement("h1", { className: "opends-page-title", title: "模型选择会在下次 Harness 启动时应用。" }, "模型与首选项"),
          createElement("div", { className: "opends-head-actions" },
            createElement("button", { className: "opends-button secondary", type: "button", title: "重新检查本机 CLI、登录与 Harness 适配状态", disabled: verifying || !serviceReady, onClick: verifyRuntimes }, verifying ? "验证中…" : "验证"),
            createElement("button", { className: "opends-button", type: "button", title: "使用 Harness 已保存的凭证，并可获取供应商模型列表", onClick: exitToNativeModels }, "+ 添加模型"),
          ),
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

    function VisionOnboarding({ complete, openSection }) {
      const [ready, setReady] = useState(null);
      useEffect(() => {
        let active = true;
        fetch(`${adminBaseURL}/v1/models`)
          .then((response) => response.ok ? response.json() : Promise.reject(new Error("not ready")))
          .then((state) => {
            if (!active) return;
            const modelReady = Array.isArray(state.routes) && state.routes.some((route) => route.enabled !== false && route.status === "ready" && route.visionLevel === "full-vision");
            const ocrReady = state.preferences?.visionMode === "ocr" && state.tools?.mineru?.status === "ready";
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
