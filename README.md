# DeepSee

[English](README.md) · [简体中文](README.zh-CN.md)

The one-command vision and model-routing plugin for DeepSeek Harness.

DeepSee is installed as a standard DSH bundle on top of DeepSeek Harness. It does not replace Harness Loop, Goal, Plan, or Workflow. It adds three focused capabilities: visual reading, model capability discovery, and multi-model routing.

## One-command installation

Install DeepSee directly from GitHub:

```powershell
npx --yes github:WUBING2023/deepsee install
```

That single command downloads the prebuilt plugin and installs DeepSee into both the Harness `web` and `headless` profiles through the official `dsh plugin` manager. It does not download development tooling, patch Harness `node_modules`, create manual shims, or run a companion service.

Then start Harness normally:

```powershell
dsh web
```

Install from this repository:

```powershell
pnpm install
pnpm run install:plugin
pnpm run start:web
```

The default Web URL is [http://127.0.0.1:3080/](http://127.0.0.1:3080/).

Uninstall the plugin while preserving model preferences and local tool state:

```powershell
deepsee uninstall
```

## What installation adds

- A standard DSH bundle declared by `cordis.patch.yml` for Web and Headless.
- Startup discovery for Claude Code, Codex, Kimi CLI, OpenCode, and Ollama. A CLI route can only be enabled after its executable, authentication, and Harness adapter pass verification.
- A same-origin Web route at `/api/deepsee`. There is no port 3091, management bearer token, or second Node.js process.
- Durable mutable state under `$DSH_HOME/deepsee`, outside the npm package, so upgrades and uninstall do not erase user settings.
- A generated `$DSH_HOME/.agent-presets/prime` preset derived from the installed Harness standard preset.
- Native reuse of models and credentials configured on the Harness Models page. DeepSee synchronizes provider identity, model IDs, input modalities, and capability descriptions without reading or copying API keys.
- A safe migration path for legacy `OPENDS_BRIDGE_*` configuration. Only provider metadata and the credential reference are migrated; the secret is never copied into `settings.yaml`.

## Features

### Vision: model or OCR

Choose one visual reader in DeepSee preferences:

- **Model** — select a Harness model whose adapter declares real image input support.
- **OCR** — optionally install MinerU for document text and layout extraction.

Images are read by the selected visual route before DeepSeek continues with the observation. The conversation UI explicitly identifies the visual model instead of presenting a text-only DeepSeek model as the image reader.

### Model directory

The DeepSee panel keeps a compact four-column model matrix: Enabled, Model, Source, and Capabilities.

- Model and source identity come from Harness or verified startup discovery.
- A short model request generates the initial capability profile; users can double-click to correct it.
- Missing, logged-out, or unsupported CLI routes remain disabled.
- Verified Codex CLI and Claude Code runtimes expose their selectable model variants.
- **Add model** opens the native Harness Models page and reuses its provider credentials and model catalog.

### Workflow and Prime

- `/workflow <task>` explicitly requests a visible native Harness Workflow.
- Prime keeps small tasks in the ordinary Loop and selects Workflow only for genuinely independent workstreams, cross-capability roles, or an approved Workflow plan.
- The Workflow worker uses the `opends` provider to map a DeepSee route ID to the real Harness provider and model.
- Harness/API models run through the native `spawn` subagent. Codex and Claude Code run through verified CLI providers.
- The `opends_list_models` tool lets the main model choose routes by vision, coding, writing, reasoning, document, or review capability.

## Web and Headless

The same package supports both official Harness profiles:

```powershell
dsh web
dsh --profile headless "Reply with OK only"
```

Headless has no WebServer, so DeepSee skips the same-origin management route while keeping runtime discovery, visual routing, the model directory tool, CLI providers, and Workflow policy available. The Web profile additionally loads `/api/deepsee` and the sidebar UI.

## Commands

```powershell
deepsee install              # Install into Web and Headless
deepsee uninstall            # Uninstall and preserve user state
deepsee doctor               # Check bundle, runtimes, and config without printing secrets
deepsee web                  # Start the official DSH Web profile

pnpm run typecheck           # Development type check
pnpm test                    # Full regression suite
pnpm run build               # Build the Host plugin and Codex provider
pnpm run pack:release        # Build and produce the distributable tarball
```

For migration compatibility, the internal settings namespace, tool IDs, and some state files still use `opends-*` / `OPENDS_*`. The public product, GitHub repository, scoped package, and command are DeepSee, `WUBING2023/deepsee`, `@wubing2023/deepsee`, and `deepsee`.

## Project layout

- `cordis.patch.yml` — standard DSH bundle layer
- `src/index.ts` — Host plugin, visual bridge, model directory, Workflow, and Prime policy
- `host/admin-server.mjs` — same-origin route mounted inside Harness WebServer
- `host/client.js` — sidebar model matrix and vision/OCR preferences
- `host/codex-provider.js` — generated Codex provider with model selection
- `scripts/install-plugin.mjs` — one-command Web + Headless installer
- `scripts/runtime-discovery.mjs` — startup scanning, migration, and registry generation
- `scripts/prime-preset.mjs` — Prime preset generation from the current Harness release
- `scripts/uninstall-plugin.mjs` — standard uninstall preserving `$DSH_HOME/deepsee`

## Compatibility

This release targets DeepSeek Harness `0.1.0-rc.6`. Codex and Claude Code have executable subagent adapters. Kimi CLI, OpenCode, and Ollama remain discovery-only when no stable Harness subagent adapter is available. Configure visual API models and provider credentials through the native Harness Models page whenever possible.

## License

[MIT](LICENSE) © 2026 WUBING2023
