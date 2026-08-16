# DeepSee

[English](README.md) · [简体中文](README.zh-CN.md)

The one-command vision and model-routing plugin for DeepSeek Harness.

DeepSee is installed as a standard DSH bundle on top of DeepSeek Harness. It does not replace Harness Loop, Goal, Plan, or Workflow. It adds three focused capabilities: visual reading, model capability discovery, and multi-model routing.

## One-command installation

Install DeepSee directly from GitHub:

```powershell
npx --yes github:WUBING2023/deepsee install
```

That single command downloads the prebuilt plugin and uses the supported official Harness CLI to install DeepSee into both the `web` and `headless` profiles. It does not download DeepSee development tooling, patch Harness `node_modules`, create manual shims, or run a companion service.

The installer is designed for first-time downloads on older machines and slower networks. Each profile gets up to 15 minutes per attempt and one automatic retry. Re-running the same command safely resumes installation by skipping profiles that already contain the current DeepSee version.

For an especially slow connection, disable the installer deadline while retaining the underlying package-manager diagnostics:

```powershell
npx --yes github:WUBING2023/deepsee install --timeout-ms 0
```

Useful recovery options:

```powershell
npx --yes github:WUBING2023/deepsee install --profile headless  # Install only one profile
npx --yes github:WUBING2023/deepsee install --retries 3         # Retry transient failures
npx --yes github:WUBING2023/deepsee install --force             # Reinstall the current version
```

### ZIP fallback (no DeepSee `npx github:` download)

If GitHub installation times out, download [deepsee-main.zip](https://github.com/WUBING2023/deepsee/archive/refs/heads/main.zip) in a browser and extract it. Open PowerShell in the extracted `deepsee-main` folder, then run:

```powershell
node .\scripts\cli.mjs install --from-folder --timeout-ms 0
node .\scripts\cli.mjs doctor
node .\scripts\cli.mjs web
```

This route uses the prebuilt files already in the ZIP; it does not require `pnpm install` or a source build. Before installation, DeepSee copies the package to `$DSH_HOME\deepsee\packages\<version>`, so the downloaded ZIP and extracted folder can be removed after installation. If an existing `dsh` command is available it is used first; otherwise the installer downloads only the pinned official Harness CLI.

To start Harness after removing the extracted folder:

```powershell
dsh --profile web
# If dsh is not on PATH:
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 --profile web
```

Then start Harness normally:

```powershell
npx --yes github:WUBING2023/deepsee web
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
npx --yes github:WUBING2023/deepsee uninstall
```

### Updates

Opening the DeepSee panel performs a cached update check against the official `WUBING2023/deepsee` repository (at most once every six hours by default). The checker first resolves and pins the current official commit, so the manifest and ZIP always come from the same immutable source revision. When a newer semantic version is available, the compact **Upgrade** action downloads that commit's GitHub ZIP, verifies the package name, version, install source, and prebuilt Host files, then reuses the same safe folder installer for both `web` and `headless` profiles. Model settings, routes, credentials, and MinerU state are not replaced. Restart Harness after the panel reports **Restart to apply**.

DeepSee never silently installs an update: checks are automatic and upgrades are one click. If a download or profile install fails, the current version stays usable and the panel offers a retry; details remain under `$DSH_HOME/deepsee/.opends-update`.

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

#### MinerU automatic installation

Click **MinerU · Install** once. DeepSee keeps the UI simple and automatically falls through these isolated installation routes:

1. Reuse an existing compatible MinerU installation.
2. Use an existing `uv` with official PyPI, then the configurable mainland mirror.
3. Use an installed Python 3.10–3.12 on Windows, or 3.10–3.13 on Linux/macOS, with `venv` + `pip`.
4. Download the official portable UV archive, verify its SHA-256 checksum, and keep it inside DeepSee rather than changing the system installation.
5. If package installation still fails, download the official MinerU source ZIP and install from the extracted source.

DeepSee installs the `mineru[core]>=3,<4` feature set because its OCR route explicitly uses the CPU-compatible `pipeline` backend. Package sources and model sources retry independently; model download starts with MinerU's `auto` source selection and can fall back to ModelScope or Hugging Face. Progress and the successful method are kept in the tool status, while detailed command output is written to the MinerU install logs under DeepSee state. A source ZIP still needs a compatible Python runtime (or the verified portable UV fallback) and network access for Python dependencies and model files; it is not a complete offline model bundle.

The strategy follows MinerU's official [installation guide](https://opendatalab.github.io/MinerU/quick_start/), [extension-module guidance](https://opendatalab.github.io/MinerU/quick_start/extension_modules/), and [model-source policy](https://opendatalab.github.io/MinerU/usage/model_source/).
Advanced deployments can override the package spec, PyPI mirror, model source, source ZIP, source extra, and per-command timeout through the documented `OPENDS_MINERU_*` values in `.env.example`; ordinary users do not need to configure them.

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
npx --yes github:WUBING2023/deepsee install    # Install into Web and Headless
npx --yes github:WUBING2023/deepsee uninstall  # Uninstall and preserve user state
npx --yes github:WUBING2023/deepsee doctor     # Check bundle, runtimes, and config
npx --yes github:WUBING2023/deepsee web        # Start the official DSH Web profile

pnpm run typecheck           # Development type check
pnpm test                    # Full regression suite
pnpm run build:plugin        # Build the Host plugin and Codex provider
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
- `scripts/folder-install.mjs` — durable extracted-ZIP staging for fallback installation
- `scripts/update-manager.mjs` — cached version checks and detached upgrade lifecycle
- `scripts/update-worker.mjs` — verified official-ZIP download and dual-profile upgrade
- `scripts/mineru-install-strategies.mjs` — extensible Python, UV, mirror, portable archive, and source-ZIP policy
- `scripts/runtime-discovery.mjs` — startup scanning, migration, and registry generation
- `scripts/prime-preset.mjs` — Prime preset generation from the current Harness release
- `scripts/uninstall-plugin.mjs` — standard uninstall preserving `$DSH_HOME/deepsee`

## Compatibility

This release targets DeepSeek Harness `0.1.0-rc.6`. Codex and Claude Code have executable subagent adapters. Kimi CLI, OpenCode, and Ollama remain discovery-only when no stable Harness subagent adapter is available. Configure visual API models and provider credentials through the native Harness Models page whenever possible.

## License

[MIT](LICENSE) © 2026 WUBING2023
