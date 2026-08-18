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
    let livePreferences = {};
    let liveOcrTools = [];

    const deepSeeIconPaths = [
      "M8.00192 6.64454C8.75026 6.64454 9.35732 7.25169 9.35739 8.00001C9.35739 8.74838 8.7503 9.35548 8.00192 9.35548C7.25367 9.35533 6.64743 8.74829 6.64743 8.00001C6.6475 7.25178 7.25371 6.64468 8.00192 6.64454Z",
      "M9.97165 1.29981C11.5853 0.718916 13.271 0.642197 14.3144 1.68555C15.3577 2.72902 15.2811 4.41466 14.7002 6.02833C14.4707 6.66561 14.1504 7.32937 13.75 8.00001C14.1504 8.67062 14.4707 9.33444 14.7002 9.97169C15.2811 11.5854 15.3578 13.271 14.3144 14.3145C13.271 15.3579 11.5854 15.2811 9.97165 14.7002C9.3344 14.4708 8.67059 14.1505 7.99997 13.75C7.32933 14.1505 6.66558 14.4708 6.02829 14.7002C4.41461 15.2811 2.72899 15.3578 1.68552 14.3145C0.642155 13.271 0.71887 11.5854 1.29977 9.97169C1.52915 9.33454 1.84865 8.67049 2.24899 8.00001C1.84866 7.32953 1.52915 6.66544 1.29977 6.02833C0.718852 4.41459 0.64207 2.729 1.68552 1.68555C2.72897 0.642112 4.41456 0.718887 6.02829 1.29981C6.66541 1.52918 7.32949 1.8487 7.99997 2.24903C8.67045 1.84869 9.33451 1.52919 9.97165 1.29981ZM12.9404 9.2129C12.4391 9.893 11.8616 10.5681 11.2148 11.2149C10.568 11.8616 9.89296 12.4391 9.21286 12.9404C9.62532 13.1579 10.0271 13.338 10.4121 13.4766C11.9146 14.0174 12.9172 13.8738 13.3955 13.3955C13.8737 12.9173 14.0174 11.9146 13.4765 10.4121C13.3379 10.0271 13.1578 9.62535 12.9404 9.2129ZM3.05856 9.2129C2.84121 9.62523 2.66197 10.0272 2.52341 10.4121C1.98252 11.9146 2.12627 12.9172 2.60446 13.3955C3.08278 13.8737 4.08544 14.0174 5.58786 13.4766C5.97264 13.338 6.37389 13.1577 6.7861 12.9404C6.10624 12.4393 5.43168 11.8614 4.78513 11.2149C4.13823 10.5679 3.55992 9.89313 3.05856 9.2129ZM7.99899 3.792C7.23179 4.31419 6.45306 4.95512 5.70407 5.70411C4.95509 6.45309 4.31415 7.23184 3.79196 7.99903C4.3143 8.76666 4.95471 9.54653 5.70407 10.2959C6.45309 11.0449 7.23271 11.6848 7.99997 12.207C8.76725 11.6848 9.54683 11.0449 10.2959 10.2959C11.0449 9.54686 11.6848 8.76729 12.207 8.00001C11.6848 7.23275 11.0449 6.45312 10.2959 5.70411C9.5465 4.95475 8.76662 4.31434 7.99899 3.792ZM5.58786 2.52344C4.08533 1.98255 3.08272 2.12625 2.60446 2.6045C2.12621 3.08275 1.98252 4.08536 2.52341 5.5879C2.66189 5.97253 2.8414 6.37409 3.05856 6.78614C3.55983 6.10611 4.1384 5.43189 4.78513 4.78516C5.43186 4.13843 6.10606 3.55987 6.7861 3.0586C6.37405 2.84144 5.97249 2.66192 5.58786 2.52344ZM13.3955 2.6045C12.9172 2.12631 11.9146 1.98257 10.4121 2.52344C10.0272 2.66201 9.62519 2.84125 9.21286 3.0586C9.8931 3.55996 10.5679 4.13827 11.2148 4.78516C11.8614 5.43172 12.4392 6.10627 12.9404 6.78614C13.1577 6.37393 13.338 5.97267 13.4765 5.5879C14.0174 4.08549 13.8736 3.08281 13.3955 2.6045Z",
    ];

    function DeepSeeIcon({ size = 16, className }) {
      return createElement("svg", {
        width: size,
        height: size,
        className,
        viewBox: "0 0 16 16",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": true,
      },
        createElement("title", null, "深见 DeepSee"),
        deepSeeIconPaths.map((path, index) => createElement("path", { key: index, d: path, fill: "currentColor" })),
      );
    }

    function createDeepSeeNavIcon() {
      const namespace = "http://www.w3.org/2000/svg";
      const wrapper = document.createElement("span");
      wrapper.className = "opends-settings-nav-icon";
      wrapper.setAttribute("aria-hidden", "true");
      const svg = document.createElementNS(namespace, "svg");
      svg.setAttribute("width", "16");
      svg.setAttribute("height", "16");
      svg.setAttribute("viewBox", "0 0 16 16");
      svg.setAttribute("fill", "none");
      const title = document.createElementNS(namespace, "title");
      title.textContent = "深见 DeepSee";
      svg.append(title);
      deepSeeIconPaths.forEach((value) => {
        const path = document.createElementNS(namespace, "path");
        path.setAttribute("d", value);
        path.setAttribute("fill", "currentColor");
        svg.append(path);
      });
      wrapper.append(svg);
      return wrapper;
    }

    function installDeepSeeSettingsNavIcon() {
      const decorate = () => {
        document.querySelectorAll('[role="dialog"] nav button').forEach((button) => {
          if (button.querySelector(".opends-settings-nav-icon") || button.textContent?.trim() !== "深见") return;
          const nativeIcon = button.querySelector("svg");
          if (nativeIcon) {
            nativeIcon.dataset.opendsNativeNavIcon = "true";
            nativeIcon.style.display = "none";
          }
          button.insertBefore(createDeepSeeNavIcon(), button.firstChild);
        });
      };
      decorate();
      const observer = new MutationObserver(decorate);
      observer.observe(document.body, { childList: true, subtree: true });
      return () => {
        observer.disconnect();
        document.querySelectorAll(".opends-settings-nav-icon").forEach((icon) => icon.remove());
        document.querySelectorAll('svg[data-opends-native-nav-icon="true"]').forEach((icon) => {
          icon.style.display = "";
          delete icon.dataset.opendsNativeNavIcon;
        });
      };
    }

    function rememberServerState(state) {
      if (!state || typeof state !== "object") return;
      if (Array.isArray(state.routes)) liveRoutes = state.routes.filter((route) => route.source !== "ocr");
      if (state.preferences && typeof state.preferences === "object") livePreferences = state.preferences;
      if (Array.isArray(state.tools?.ocr?.catalog)) liveOcrTools = state.tools.ocr.catalog;
    }

    const css = `
      .opends-footer-button{box-sizing:border-box;width:100%;height:36px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);display:flex;align-items:center;gap:8px;padding:0 10px;cursor:pointer;font:inherit}
      .opends-footer-button:hover{background:var(--dsw-alias-interactive-bg-hover)}
      .opends-footer-button.rail{width:36px;border-radius:50%;justify-content:center;padding:0}
      .opends-mark{width:20px;height:20px;color:var(--dsw-alias-label-primary);display:inline-flex;align-items:center;justify-content:center;flex:none}
      .opends-mark svg{display:block}
      .opends-settings-nav-icon{width:16px;height:16px;display:inline-flex;align-items:center;justify-content:center;flex:none;color:inherit}.opends-settings-nav-icon svg{display:block}
      .opends-footer-label{white-space:nowrap;overflow:hidden}
      .opends-mask{position:absolute;inset:0;background:rgba(25,27,32,.2);backdrop-filter:blur(1.5px)}
      .opends-title{font-size:17px;font-weight:600;color:var(--dsw-alias-label-primary)}
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
       .opends-directory{margin-top:10px}
       .opends-directory-head{box-sizing:border-box;min-height:42px;display:flex;align-items:center;gap:9px;color:var(--dsw-alias-label-primary)}
       .opends-directory-title{font-size:13px;font-weight:560}
       .opends-directory-count{margin-left:auto;font-size:11px;color:var(--dsw-alias-label-tertiary)}
       .opends-runtime-add-button{width:28px;height:28px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:9px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font:inherit;font-size:18px;font-weight:350;cursor:pointer}.opends-runtime-add-button:hover,.opends-runtime-add-button.active{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
       .opends-runtime-installer{margin-bottom:9px;padding:10px 12px;border:1px solid rgba(47,107,255,.16);border-radius:12px;background:rgba(47,107,255,.025);display:grid;grid-template-columns:minmax(125px,.7fr) minmax(220px,1.4fr) auto auto;align-items:center;gap:8px}.opends-runtime-installer .opends-select,.opends-runtime-installer .opends-input{height:32px;border-radius:8px;font-size:11px}.opends-runtime-installer .opends-button{height:30px}.opends-runtime-progress,.opends-runtime-feedback{grid-column:1/-1}.opends-runtime-progress{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;color:var(--dsw-alias-label-tertiary);font-size:10px}.opends-runtime-progress progress{width:100%;height:5px;border:0;border-radius:99px;overflow:hidden}.opends-runtime-feedback{font-size:10px;line-height:1.4;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
       .opends-directory-columns{height:30px;display:grid;grid-template-columns:54px minmax(0,34%) minmax(0,18%) minmax(0,1fr);align-items:center;border:1px solid rgba(127,127,127,.12);border-bottom:0;border-radius:12px 12px 0 0;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:10px}.opends-directory-columns span{padding:0 12px}
       .opends-provider-list{display:block;border:1px solid rgba(127,127,127,.14);border-radius:0 0 14px 14px;overflow:hidden;background:var(--dsw-alias-bg-layer-2)}
       .opends-provider-group{border:0;border-radius:0;background:transparent}.opends-provider-group+.opends-provider-group{border-top:1px solid rgba(127,127,127,.14)}
       .opends-provider-head{box-sizing:border-box;min-height:34px;padding:0 12px;display:flex;align-items:center;gap:7px;background:rgba(127,127,127,.025);border-bottom:1px solid rgba(127,127,127,.09)}
       .opends-provider-mark{width:6px;height:6px;border-radius:50%;background:var(--dsw-alias-state-business-primary);box-shadow:0 0 0 2px rgba(47,107,255,.08);flex:none}
       .opends-provider-name{font-size:13px;font-weight:570;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
       .opends-provider-kind{font-size:9px;color:var(--dsw-alias-label-tertiary);padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-module-platform);white-space:nowrap}
       .opends-provider-count{margin-left:auto;font-size:10px;color:var(--dsw-alias-label-tertiary);white-space:nowrap}
       .opends-provider-add-button{height:24px;padding:0 8px;border:0;border-radius:7px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-secondary);font:inherit;font-size:9px;cursor:pointer}.opends-provider-add-button:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
       .opends-provider-add{min-height:43px;padding:7px 12px;display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:7px;border-bottom:1px solid rgba(127,127,127,.12);background:rgba(47,107,255,.025)}
       .opends-provider-group .opends-matrix-wrap{border:0;border-radius:0}
      .opends-matrix{width:100%;border-collapse:collapse;table-layout:fixed;font-size:12px;font-variant-numeric:tabular-nums}
      .opends-matrix col:nth-child(1){width:54px}.opends-matrix col:nth-child(2){width:34%}.opends-matrix col:nth-child(3){width:18%}.opends-matrix col:nth-child(4){width:auto}
       .opends-matrix th{height:30px;padding:0 12px;text-align:left;color:var(--dsw-alias-label-tertiary);font-weight:500;border-bottom:1px solid rgba(127,127,127,.12)}
       .opends-matrix td{height:44px;padding:0 12px;border-bottom:1px solid rgba(127,127,127,.09);vertical-align:middle;min-width:0}
      .opends-matrix tbody tr:last-child td{border-bottom:0}
      .opends-matrix tbody tr:hover td{background:rgba(127,127,127,.045)}
      .opends-check{accent-color:var(--dsw-alias-state-business-primary)}
      .opends-model-name{font-size:13px;font-weight:570;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .opends-model-cell{display:flex;min-width:0;align-items:center;gap:6px}
      .opends-cli-model-select{min-width:0;flex:1;height:27px;border:1px solid rgba(127,127,127,.16);border-radius:7px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;padding:0 20px 0 6px;outline:none}
      .opends-cli-model-select:focus{border-color:rgba(48,111,230,.42);box-shadow:0 0 0 2px rgba(48,111,230,.09)}
      .opends-model-remove{width:27px;height:27px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:15px;cursor:pointer;flex:none}.opends-model-remove:hover{background:rgba(215,76,76,.08);color:#c84d4d}
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
      .opends-message-bar{box-sizing:border-box;min-height:34px;margin-top:7px;padding:7px 10px;border:1px solid rgba(47,107,255,.14);border-radius:9px;background:rgba(47,107,255,.045);display:flex;align-items:flex-start;gap:7px;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:1.45}.opends-message-bar:before{content:"";width:6px;height:6px;margin-top:5px;border-radius:50%;background:var(--dsw-alias-state-business-primary);flex:none}.opends-message{min-width:0}
      .opends-note{padding:11px 13px;border:1px solid rgba(47,107,255,.18);border-radius:10px;background:rgba(47,107,255,.06);color:var(--dsw-alias-label-secondary);font-size:12px;line-height:1.6}
      .opends-preferences{border-bottom:1px solid rgba(127,127,127,.14)}
      .opends-init-strip{min-height:36px;display:flex;align-items:center;gap:7px;color:var(--dsw-alias-label-secondary);font-size:11px;border-bottom:1px solid rgba(127,127,127,.12);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.opends-init-strip:before{content:"";width:6px;height:6px;border-radius:50%;background:#34a876;flex:none}.opends-init-strip a{color:inherit;text-decoration:none;border-bottom:1px solid rgba(127,127,127,.32)}.opends-init-strip a:hover{color:var(--dsw-alias-label-primary)}
      .opends-pref-row{min-height:55px;display:grid;grid-template-columns:180px minmax(240px,1fr);align-items:center;gap:18px;border-top:1px solid rgba(127,127,127,.12)}.opends-pref-row:first-child{border-top:0}
      .opends-pref-label{font-size:13px;font-weight:540;color:var(--dsw-alias-label-primary)}.opends-pref-control{width:min(340px,100%);justify-self:end;border:0;background:var(--dsw-alias-bg-module-platform);border-radius:12px}.opends-pref-action{justify-self:end}.opends-tool-install{min-width:72px}
      .opends-vision-controls{width:min(430px,100%);justify-self:end;display:grid;grid-template-columns:94px minmax(0,1fr);gap:8px}.opends-vision-kind,.opends-vision-target{border:0;background:var(--dsw-alias-bg-module-platform);border-radius:12px}.opends-vision-target{width:100%;min-width:0}.opends-ocr-target{min-width:0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px}.opends-ocr-target .opends-button{white-space:nowrap}.opends-mineru-progress{grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:7px;color:var(--dsw-alias-label-tertiary);font-size:10px}.opends-mineru-progress progress{width:100%;height:5px;border:0;border-radius:99px;overflow:hidden;background:rgba(127,127,127,.16)}.opends-mineru-progress progress::-webkit-progress-bar{background:rgba(127,127,127,.16)}.opends-mineru-progress progress::-webkit-progress-value{background:var(--dsw-alias-state-business-primary);border-radius:99px}.opends-mineru-progress progress::-moz-progress-bar{background:var(--dsw-alias-state-business-primary);border-radius:99px}.opends-ocr-feedback{grid-column:1/-1;padding:7px 9px;border-radius:8px;background:var(--dsw-alias-bg-module-platform);display:grid;gap:2px;color:var(--dsw-alias-label-secondary);font-size:10px;line-height:1.4}.opends-ocr-comparison{color:var(--dsw-alias-label-tertiary)}
      .opends-model-warning{color:#a56a45}
      .opends-ocr-advisory{grid-column:1/-1;padding:7px 9px;border:1px solid rgba(217,139,32,.18);border-radius:8px;background:rgba(217,139,32,.045);display:grid;gap:3px;color:var(--dsw-alias-label-secondary);font-size:10px;line-height:1.45}.opends-ocr-advisory strong{color:var(--dsw-alias-label-primary);font-weight:550}.opends-ocr-diagnostics{margin-top:2px}.opends-ocr-diagnostics summary{cursor:pointer;color:var(--dsw-alias-label-secondary)}.opends-ocr-diagnostics pre{max-height:120px;overflow:auto;margin:5px 0 0;padding:6px;border-radius:6px;background:rgba(127,127,127,.08);white-space:pre-wrap;word-break:break-word;font:9px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace}
      .opends-status-list{padding-top:6px}.opends-status-row{min-height:52px;display:grid;grid-template-columns:1fr 110px 90px;align-items:center;border-bottom:1px solid rgba(127,127,127,.14);gap:12px;font-size:12px}
      .opends-empty{padding:36px 0;text-align:center;color:var(--dsw-alias-label-tertiary);font-size:12px}
      .opends-select{box-sizing:border-box;width:100%;height:36px;border:1px solid rgba(127,127,127,.22);border-radius:9px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;padding:0 9px;outline:none}
      .opends-onboarding{position:fixed;inset:0;z-index:1300;display:flex;align-items:center;justify-content:center;padding:24px}
      .opends-onboarding-card{position:relative;z-index:1;width:min(520px,calc(100vw - 48px));border-radius:22px;background:var(--dsw-alias-bg-layer-2);box-shadow:0 18px 50px rgba(20,22,28,.18);padding:26px;display:flex;flex-direction:column;gap:16px}
       @media(max-width:700px){.opends-body{padding:4px 16px 16px}.opends-grid{grid-template-columns:1fr}.opends-field.wide{grid-column:auto}.opends-pref-row{grid-template-columns:1fr auto}.opends-pref-control,.opends-vision-controls{grid-column:1/-1;width:100%;justify-self:stretch;margin-bottom:10px}.opends-matrix col:nth-child(3),.opends-matrix th:nth-child(3),.opends-matrix td:nth-child(3){display:none}.opends-matrix col:nth-child(2){width:40%}.opends-directory-columns{grid-template-columns:54px minmax(0,40%) minmax(0,1fr)}.opends-directory-columns span:nth-child(3){display:none}.opends-head-actions .secondary{display:none}.opends-runtime-installer{grid-template-columns:1fr auto}.opends-runtime-installer .opends-input{grid-column:1/-1}}
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
      let message;
      const primary = liveRoutes.find((route) => route.id === livePreferences.primaryRouteId && route.enabled !== false && route.status === "ready")
        || liveRoutes.find((route) => route.source === "harness" && /deepseek/i.test(`${route.provider} ${route.model}`) && route.status === "ready");
      const primaryName = primary ? routeDisplayName(primary) : "当前主模型";
      if (livePreferences.visionMode === "ocr") {
        const selected = liveOcrTools.find((tool) => tool.id === (livePreferences.ocrTool || "mineru"));
        const activeOCR = selected?.status === "ready" ? selected : liveOcrTools.find((tool) => tool.status === "ready");
        const fallbackVision = liveRoutes.find((route) => route.enabled !== false && route.visionLevel === "full-vision" && route.status === "ready");
        message = activeOCR
          ? `深见：${activeOCR === selected ? "当前由" : `所选 ${selected?.label || "OCR"} 不可用，本轮自动改用`} ${activeOCR.label} 本地 OCR 提取文字与版面，${primaryName} 将根据 OCR 结果继续回答`
          : fallbackVision
            ? `深见：所选 ${selected?.label || "OCR"} 不可用，本轮自动改用 ${routeDisplayName(fallbackVision)} · ${routeSourceLabel(fallbackVision)} 识图，${primaryName} 将继续回答`
            : `深见：当前选择的 ${selected?.label || "本地 OCR"} 尚不可用，也没有可回退的视觉模型，请先在深见设置中完成安装或配置`;
      } else {
        const selected = liveRoutes.find((route) => route.id === livePreferences.visionRouteId);
        const vision = selected?.enabled !== false && selected?.visionLevel === "full-vision" && selected?.status === "ready"
          ? selected
          : liveRoutes.find((route) => route.enabled !== false && route.visionLevel === "full-vision" && route.status === "ready");
        message = vision
          ? `深见：当前由 ${routeDisplayName(vision)} · ${routeSourceLabel(vision)} 识图，${primaryName} 将根据识图结果继续回答`
          : "深见：当前没有可用的视觉模型，请在深见设置中完成配置";
      }
      return createElement(
        "div",
        { role: "status", style: noticeStyle },
        createElement("span", { "aria-hidden": true }, "\u25c9"),
        createElement("span", null, message),
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
      if (route.source === "cli" && route.cliModel) return route.cliModel;
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

    function cliRuntimeId(route) {
      return route.source === "cli" ? (route.cliRuntimeId || String(route.id || "").replace(/@\d+$/, "")) : "";
    }

    function modelGroupInfo(route) {
      const providerLabels = {
        anthropic: "Anthropic",
        deepseek: "DeepSeek",
        "deepseek-official": "DeepSeek",
        kimi: "Kimi",
        moonshot: "Kimi",
        openai: "OpenAI",
      };
      const label = route.sourceLabel
        || (route.source === "cli" ? routeDisplayName(route) : providerLabels[route.provider] || route.provider);
      const kind = route.source === "cli"
        ? (route.desktopAppId ? "桌面端 / 本地 CLI" : "本地 CLI")
        : route.source === "harness"
          ? "Harness 供应商"
          : "API 供应商";
      const runtimeId = cliRuntimeId(route);
      const key = route.source === "cli" ? `${route.source}:${runtimeId}` : `${route.source}:${route.provider}`;
      return { key, label, kind, runtimeId };
    }

    function groupModelRoutes(routes) {
      const groups = [];
      const index = new Map();
      for (const route of routes) {
        const info = modelGroupInfo(route);
        let group = index.get(info.key);
        if (!group) {
          group = { ...info, routes: [] };
          index.set(info.key, group);
          groups.push(group);
        }
        group.routes.push(route);
      }
      const rank = (group) => {
        const deepseek = group.routes.some((route) => route.source === "harness" && /deepseek/i.test(`${route.provider} ${route.sourceLabel || ""}`));
        if (deepseek) return 0;
        if (group.routes.some((route) => route.status === "ready" && route.enabled !== false)) return 1;
        if (group.routes.some((route) => route.status === "ready")) return 2;
        return 3;
      };
      return groups
        .map((group, order) => ({ group, order }))
        .sort((left, right) => rank(left.group) - rank(right.group) || left.order - right.order)
        .map(({ group }) => group);
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
      const placeholder = (value) => /^(?:能力|任务|擅长|strength|capability|task)[-_]?\d+$/i.test(String(value || "").trim().replaceAll(" ", ""));
      const cleanValues = (values || []).filter((value) => !placeholder(value));
      const natural = cleanValues.filter((value) => !canonical.has(value));
      const visible = natural.length > 0 ? natural : cleanValues;
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

    function openNativeSettingsSection(sectionLabel, exitCurrent) {
      if (typeof exitCurrent === "function") exitCurrent();
      setTimeout(() => {
        const openSection = () => {
          const sectionButton = [...document.querySelectorAll('[role="dialog"] button')]
            .find((button) => button.textContent?.trim() === sectionLabel);
          if (!sectionButton) return false;
          sectionButton.click();
          return true;
        };
        if (openSection()) return;
        const trigger = [...document.querySelectorAll('button[aria-haspopup="dialog"]')]
          .find((button) => button.getAttribute("aria-expanded") !== null);
        if (!trigger) return;
        trigger.click();
        let attempts = 0;
        const timer = window.setInterval(() => {
          attempts += 1;
          if (openSection() || attempts >= 10) window.clearInterval(timer);
        }, 50);
      }, 30);
    }

    function openNativeModelSettings(exitCurrent) {
      openNativeSettingsSection("模型", exitCurrent);
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
      const [runtimeTools, setRuntimeTools] = useState([
        { id: "gemini", routeId: "cli:gemini", label: "Gemini CLI", vendor: "Google", status: "not-installed", progress: 0, defaultInstallPath: "", message: "正在读取…" },
      ]);
      const [update, setUpdate] = useState({ status: "idle", message: "尚未检查更新。" });
      const [initialization, setInitialization] = useState({ vision: null, localRuntimes: [], desktopApps: [], instructions: { files: [] } });
      const [message, setMessage] = useState("");
      const [verifying, setVerifying] = useState(false);
      const [serviceReady, setServiceReady] = useState(false);
      const [addingCliRuntime, setAddingCliRuntime] = useState("");
      const [pendingCliModel, setPendingCliModel] = useState("");
      const [runtimeInstallerOpen, setRuntimeInstallerOpen] = useState(false);
      const [pendingRuntimeId, setPendingRuntimeId] = useState("gemini");
      const [runtimeInstallPath, setRuntimeInstallPath] = useState("");
      const routes = useMemo(() => localRoutes.filter((route) => route.source !== "ocr"), [localRoutes]);
      const primaryOptions = useMemo(() => routes.filter((route) => (
        route.status === "ready"
        && route.enabled !== false
        && (route.source === "harness" || route.source === "api" || route.source === "cli")
        && (!Array.isArray(route.outputModalities) || route.outputModalities.length === 0 || route.outputModalities.includes("text"))
      )), [routes]);
      const visionOptions = useMemo(() => routes.filter((route) => (
        route.status === "ready" && route.enabled !== false && route.visionLevel === "full-vision"
      )), [routes]);
      const profiling = useMemo(() => routes.some((route) => route.profileStatus === "pending" || route.profileStatus === "profiling"), [routes]);

      const applyServerState = (state) => {
        if (!state || typeof state !== "object") return;
        rememberServerState(state);
        if (Array.isArray(state.routes)) {
          setLocalRoutes(liveRoutes);
        }
        if (state.preferences && typeof state.preferences === "object") setPreferences(livePreferences);
        if (Array.isArray(state.tools?.ocr?.catalog)) setOcrTools(liveOcrTools);
        if (Array.isArray(state.tools?.runtimes?.catalog)) setRuntimeTools(state.tools.runtimes.catalog);
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
        if (!ocrTools.some((tool) => tool.status === "installing") && !runtimeTools.some((tool) => tool.status === "installing") && !profiling && !["checking", "updating"].includes(update.status)) return undefined;
        const timer = setInterval(loadState, 2000);
        return () => clearInterval(timer);
      }, [ocrTools.some((tool) => tool.status === "installing"), runtimeTools.some((tool) => tool.status === "installing"), profiling, update.status]);

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

      const addCliModel = async (group) => {
        if (!pendingCliModel) return;
        try {
          const result = await requestAdmin("/v1/cli-models", {
            method: "POST",
            body: JSON.stringify({ runtimeRouteId: group.runtimeId, model: pendingCliModel }),
          });
          applyServerState(result.state);
          setAddingCliRuntime("");
          setPendingCliModel("");
          setMessage(`${pendingCliModel} 已加入 ${group.label}；重启 Harness 后可用于主模型与 Workflow。`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "订阅模型添加失败。");
        }
      };

      const removeCliModel = async (route) => {
        try {
          const result = await requestAdmin("/v1/cli-models/remove", {
            method: "POST",
            body: JSON.stringify({ id: route.id }),
          });
          applyServerState(result.state);
          setMessage(`${route.cliModel || routeDisplayName(route)} 已移除；重启 Harness 后路由更新。`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : "订阅模型移除失败。");
        }
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
          setMessage(fields.visionMode || fields.visionRouteId || fields.ocrTool
            ? "视觉读取首选项已保存，并已对新请求实时生效。"
            : "首选项已保存，并同步到 Harness；主模型更改将在重启后完整生效。");
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

      const installRuntime = async () => {
        const runtime = runtimeTools.find((item) => item.id === pendingRuntimeId);
        if (!runtime) return;
        if (runtime.status === "ready") {
          await verifyRuntimes();
          return;
        }
        try {
          const result = await requestAdmin(`/v1/runtimes/${runtime.id}/install`, {
            method: "POST",
            body: JSON.stringify({ installPath: runtimeInstallPath || runtime.defaultInstallPath }),
          });
          setRuntimeTools((current) => current.map((item) => item.id === runtime.id ? { ...item, ...result.runtime } : item));
          setMessage(`${runtime.label} 已开始后台安装；完成后会自动加入模型目录。`);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : `${runtime.label} 安装启动失败。`);
        }
      };

      const checkUpdate = async () => {
        setUpdate((current) => ({ ...current, status: "checking", message: "正在检查 DeepSee 更新…" }));
        try {
          const result = await requestAdmin("/v1/update/check", { method: "POST", body: "{}" });
          setUpdate(result.update);
          setMessage(result.update?.message || "版本检查完成。");
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

      const enabledRouteCount = routes.filter((route) => route.status === "ready" && route.enabled !== false).length;
      const modelGroups = groupModelRoutes(routes);
      const pendingRuntime = runtimeTools.find((runtime) => runtime.id === pendingRuntimeId) || runtimeTools[0];
      const renderModelTable = (group) => {
        const selectedCliModels = new Set(group.routes.map((route) => route.cliModel).filter(Boolean));
        return createElement("div", { className: "opends-matrix-wrap" },
          createElement("table", { className: "opends-matrix", "aria-label": `${group.label} 模型列表` },
          createElement("colgroup", null, createElement("col"), createElement("col"), createElement("col"), createElement("col")),
          createElement("tbody", null, group.routes.map((route) => {
            const routeReady = route.status === "ready";
            return createElement("tr", { key: route.id, className: routeReady ? "" : "opends-row-locked" },
              createElement("td", null,
                createElement("label", { className: "opends-mini-switch", title: routeReady ? "打开或关闭模型" : (route.statusReason || "未通过启动验证") },
                  createElement("input", { type: "checkbox", checked: routeReady && route.enabled !== false, disabled: !serviceReady || !routeReady, "aria-label": `打开 ${routeDisplayName(route)}`, onChange: (event) => toggleRoute(route, event.target.checked) }),
                  createElement("span", { className: "opends-mini-track" }),
                ),
              ),
              createElement("td", { title: route.statusReason || route.visionStatusReason || route.profileError || (route.profileStatus === "profiling" ? "正在生成能力画像" : "运行正常") },
                createElement("div", { className: "opends-model-cell" },
                  route.source === "cli" && Array.isArray(route.cliModels) && route.cliModels.length > 0
                    ? createElement("select", {
                        className: "opends-cli-model-select",
                        "aria-label": `${group.label} 模型 ${route.cliModel || "默认"}`,
                        value: route.cliModel || "",
                        disabled: !serviceReady || !routeReady,
                        onChange: (event) => saveRouteFields(route, { cliModel: event.target.value }),
                      },
                        route.cliModels.map((model) => createElement("option", {
                          key: model,
                          value: model,
                          disabled: model !== route.cliModel && selectedCliModels.has(model),
                        }, model)),
                      )
                    : createElement("div", { className: "opends-model-name" }, routeDisplayName(route)),
                  route.source === "cli" && route.id !== cliRuntimeId(route)
                    ? createElement("button", {
                        className: "opends-model-remove",
                        type: "button",
                        title: "移除这个订阅模型",
                        "aria-label": `移除 ${route.cliModel || routeDisplayName(route)}`,
                        onClick: () => removeCliModel(route),
                      }, "×")
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
        );
      };
      const matrix = createElement("section", { className: "opends-directory", "aria-label": "模型目录" },
        createElement("div", { className: "opends-directory-head", title: "按供应商、本地 CLI 或桌面端分组。每次启动都会重新验证 Runtime；一个订阅账号默认使用当前选中的一个模型。" },
          createElement("span", { className: "opends-directory-title" }, "模型目录"),
          createElement("span", { className: "opends-directory-count" }, `${modelGroups.length} 个来源 · ${enabledRouteCount} 已打开`),
          createElement("button", {
            className: `opends-runtime-add-button${runtimeInstallerOpen ? " active" : ""}`,
            type: "button",
            title: "添加或安装新的 Runtime",
            "aria-label": "添加 Runtime",
            onClick: () => {
              const nextOpen = !runtimeInstallerOpen;
              setRuntimeInstallerOpen(nextOpen);
              if (nextOpen) {
                const candidate = runtimeTools.find((runtime) => runtime.status !== "ready") || runtimeTools[0];
                setPendingRuntimeId(candidate?.id || "gemini");
                setRuntimeInstallPath(candidate?.installPath || candidate?.executable || candidate?.defaultInstallPath || "");
              }
            },
          }, "+"),
        ),
        runtimeInstallerOpen && pendingRuntime && createElement("div", { className: "opends-runtime-installer", "aria-label": "Runtime 安装器" },
          createElement("select", {
            className: "opends-select",
            value: pendingRuntimeId,
            disabled: runtimeTools.some((runtime) => runtime.status === "installing"),
            "aria-label": "要添加的 Runtime",
            onChange: (event) => {
              const runtime = runtimeTools.find((item) => item.id === event.target.value);
              setPendingRuntimeId(event.target.value);
              setRuntimeInstallPath(runtime?.installPath || runtime?.executable || runtime?.defaultInstallPath || "");
            },
          }, runtimeTools.map((runtime) => createElement("option", { key: runtime.id, value: runtime.id }, `${runtime.label} · ${runtime.vendor}`))),
          createElement("input", {
            className: "opends-input",
            type: "text",
            value: runtimeInstallPath,
            disabled: pendingRuntime.status === "installing" || pendingRuntime.status === "ready",
            "aria-label": "Runtime 安装路径",
            title: "选择一个空目录或 DeepSee 已管理的 Runtime 目录",
            onChange: (event) => setRuntimeInstallPath(event.target.value),
          }),
          createElement("button", {
            className: "opends-button secondary",
            type: "button",
            disabled: !serviceReady || pendingRuntime.status === "installing" || (!runtimeInstallPath && pendingRuntime.status !== "ready"),
            title: `${pendingRuntime.installHint || "下载官方稳定版"} ${pendingRuntime.authHint || ""}`,
            onClick: installRuntime,
          }, pendingRuntime.status === "ready" ? "验证加入" : pendingRuntime.status === "installing" ? "安装中…" : pendingRuntime.status === "error" ? "重试" : "安装"),
          createElement("button", { className: "opends-button", type: "button", onClick: () => setRuntimeInstallerOpen(false) }, "取消"),
          pendingRuntime.status === "installing" && createElement("div", { className: "opends-runtime-progress", role: "status" },
            createElement("progress", { max: 100, value: Number.isFinite(pendingRuntime.progress) ? pendingRuntime.progress : 5, "aria-label": `${pendingRuntime.label} 安装进度` }),
            createElement("span", null, `${Math.round(Number.isFinite(pendingRuntime.progress) ? pendingRuntime.progress : 5)}%`),
          ),
          createElement("div", { className: "opends-runtime-feedback", title: `${pendingRuntime.message || ""} ${pendingRuntime.authHint || ""}` }, pendingRuntime.message || pendingRuntime.installHint || "选择路径后安装。"),
        ),
        routes.length > 0 && createElement("div", { className: "opends-directory-columns", "aria-hidden": true },
          createElement("span", null, "打开"),
          createElement("span", null, "模型"),
          createElement("span", null, "来源"),
          createElement("span", { title: "双击内容可修正路由能力" }, "能力"),
        ),
        routes.length === 0
          ? createElement("div", { className: "opends-empty" }, "尚无模型或 Runtime。请点击重新验证。")
          : createElement("div", { className: "opends-provider-list" }, modelGroups.map((group) => {
              const groupEnabled = group.routes.filter((route) => route.status === "ready" && route.enabled !== false).length;
              const selectedModels = new Set(group.routes.map((route) => route.cliModel).filter(Boolean));
              const availableCliModels = [...new Set(group.routes.flatMap((route) => route.cliModels || []))]
                .filter((model) => !selectedModels.has(model));
              const canAddCliModel = Boolean(group.runtimeId && availableCliModels.length > 0);
              const addingHere = Boolean(group.runtimeId && addingCliRuntime === group.runtimeId);
              return createElement("section", { className: "opends-provider-group", key: group.key, "aria-label": group.label },
                createElement("div", { className: "opends-provider-head" },
                  createElement("span", { className: "opends-provider-mark", "aria-hidden": true }),
                  createElement("span", { className: "opends-provider-name" }, group.label),
                  createElement("span", { className: "opends-provider-kind" }, group.kind),
                  createElement("span", { className: "opends-provider-count", title: `${group.routes.length} 个模型，其中 ${groupEnabled} 个已打开` }, `${group.routes.length} 模型`),
                  canAddCliModel && createElement("button", {
                    className: "opends-provider-add-button",
                    type: "button",
                    "aria-label": `为 ${group.label} 添加模型`,
                    onClick: () => {
                      if (addingHere) {
                        setAddingCliRuntime("");
                        setPendingCliModel("");
                      } else {
                        setAddingCliRuntime(group.runtimeId);
                        setPendingCliModel(availableCliModels[0] || "");
                      }
                    },
                  }, addingHere ? "取消" : "+ 模型"),
                ),
                addingHere && createElement("div", { className: "opends-provider-add" },
                  createElement("select", {
                    className: "opends-cli-model-select",
                    "aria-label": `${group.label} 待添加模型`,
                    value: pendingCliModel,
                    onChange: (event) => setPendingCliModel(event.target.value),
                  }, availableCliModels.map((model) => createElement("option", { key: model, value: model }, model))),
                  createElement("button", { className: "opends-provider-add-button", type: "button", onClick: () => addCliModel(group) }, "添加"),
                  createElement("button", { className: "opends-provider-add-button", type: "button", onClick: () => { setAddingCliRuntime(""); setPendingCliModel(""); } }, "取消"),
                ),
                renderModelTable(group),
              );
            })),
      );

      const preferredPrimary = preferences.primaryRouteId || primaryOptions[0]?.id || "";
      const preferredVision = preferences.visionRouteId || visionOptions[0]?.id || "";
      const visionMode = preferences.visionMode === "ocr" ? "ocr" : "model";
      const selectedOCRId = ["mineru", "paddleocr", "rapidocr"].includes(preferences.ocrTool) ? preferences.ocrTool : "mineru";
      const selectedOCR = ocrTools.find((tool) => tool.id === selectedOCRId) || ocrTools[0];
      const ocrColdStart = selectedOCRId === "mineru"
        ? "首次读取通常需要 30–120 秒加载文档模型"
        : selectedOCRId === "paddleocr"
          ? "首次读取通常需要 10–60 秒加载识别模型"
          : "首次读取通常需要 3–20 秒初始化轻量模型";
      const ocrDiagnosticText = [
        ...(selectedOCR?.attempts || []).filter((attempt) => attempt.status === "failed").map((attempt) => `${attempt.label}: ${attempt.message || "未成功"}`),
        selectedOCR?.diagnostic || "",
      ].filter(Boolean).join("\n");
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
                  : update.status === "current"
                    ? "已是最新"
                    : "检查更新";
      const preferencesPanel = createElement("section", { className: "opends-preferences", "aria-label": "深见 DeepSee 首选项" },
        createElement("div", { className: "opends-pref-row", title: "Harness 的基础回答模型；Codex 与 Claude Code 使用本机已登录的订阅 Runtime。更改后重启生效。" },
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
                  (selectedOCR?.status === "installing" || selectedOCR?.status === "error") && createElement("div", { className: "opends-ocr-feedback", role: "status" },
                    createElement("span", null, selectedOCR.message || `${selectedOCR.label} 正在准备隔离环境…`),
                    createElement("span", { className: "opends-ocr-comparison" }, "MinerU · 复杂文档　PaddleOCR · 多语言通用　RapidOCR · 轻量截图"),
                    selectedOCR?.status === "error" && ocrDiagnosticText && createElement("details", { className: "opends-ocr-diagnostics" },
                      createElement("summary", null, "查看安装诊断"),
                      createElement("pre", null, ocrDiagnosticText),
                    ),
                  ),
                  createElement("div", { className: "opends-ocr-advisory", role: "note" },
                    createElement("strong", null, `冷启动提示：${ocrColdStart}`),
                    createElement("span", null, "OCR 只提取可见文字与基础版面，不理解物体、场景、图表含义或视觉关系；需要语义识图时请切换到“模型”。"),
                  ),
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
        ...(initialization.instructions?.global?.files || []).map((file) => `${file.name}（${file.native ? "Harness" : file.source}）`),
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
        (message || snapshot.status === "loading" || !snapshot.writable) && createElement("div", { className: "opends-message-bar", role: "status" },
          createElement("span", { className: "opends-message" }, message || (snapshot.status === "loading" ? "正在读取设置…" : "当前设置只读。")),
        ),
        (initializedParts.length > 0 || desktopApps.length > 0) && createElement("div", {
          className: "opends-init-strip",
          title: "工作区指令由 Harness 原生加载；Claude、Codex 与用户目录中的全局 AGENTS.md、CLAUDE.md 与 agent.md 由 DeepSee 只读继承到主会话、订阅基础模型和 Workflow。当前明确请求始终优先。",
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
      );
    }

    function DeepSeeFooter({ wide }) {
      return createElement("button", {
        className: `opends-footer-button${wide ? "" : " rail"}`,
        type: "button",
        title: "打开深见 DeepSee",
        "aria-label": "打开深见 DeepSee",
        onClick: () => openNativeSettingsSection("深见"),
      },
        createElement("span", { className: "opends-mark", "aria-hidden": true }, createElement(DeepSeeIcon, { size: 18 })),
        wide && createElement("span", { className: "opends-footer-label" }, "深见"),
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
          createElement("span", { className: "opends-mark", "aria-hidden": true }, createElement(DeepSeeIcon, { size: 18 })),
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
      window.__deepSeeSettingsNavIconCleanup?.();
      window.__deepSeeSettingsNavIconCleanup = installDeepSeeSettingsNavIcon();
      void fetch(`${adminBaseURL}/v1/models`)
        .then((response) => response.ok ? response.json() : undefined)
        .then(rememberServerState)
        .catch(() => undefined);
      ctx.slots.inject("conversation.input.dock", () => ctx.slots.register({
        name: "conversation.input.dock",
        id: "opends-vision-bridge",
        order: 5,
        label: "DeepSeek 深见",
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
