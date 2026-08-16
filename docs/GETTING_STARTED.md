# Getting started with DeepSee

[简体中文](GETTING_STARTED.zh-CN.md) · [Back to README](../README.md)

This guide takes you from a clean machine to a verified visual conversation. Most users only need the first three sections.

## Before you begin

- Install [Node.js 24 or newer](https://nodejs.org/).
- Keep a working internet connection for the first installation.
- Have at least one DeepSeek Harness text model for the main conversation.
- For vision, prepare either a multimodal API model or enough disk space to install MinerU locally.

You do not need to install a separate DeepSee server. If `dsh` is not already available, the installer uses the exact Harness runtime tested with this DeepSee release.

## 1. Install and start

Run in PowerShell or a terminal:

```powershell
npx --yes github:WUBING2023/deepsee install
npx --yes github:WUBING2023/deepsee doctor
npx --yes github:WUBING2023/deepsee web
```

Open [http://127.0.0.1:3080/](http://127.0.0.1:3080/).

The installer adds the same standard bundle to the Harness `web` and `headless` profiles. Each profile gets up to 15 minutes per attempt and one automatic retry. Re-running the command is safe: a profile that already contains the current version is skipped.

If the connection is unusually slow, remove DeepSee's own deadline while keeping the underlying package-manager output:

```powershell
npx --yes github:WUBING2023/deepsee install --timeout-ms 0
```

Other recovery options:

```powershell
npx --yes github:WUBING2023/deepsee install --retries 3
npx --yes github:WUBING2023/deepsee install --profile headless
npx --yes github:WUBING2023/deepsee install --force
```

## 2. Configure the first visual reader

1. In Harness, open **Settings → Models**.
2. Add or select the provider and model used for your normal DeepSeek conversation.
3. Add at least one model that declares image input, or plan to use MinerU.
4. Open the **DeepSee** sidebar panel.
5. Under **Visual reader**, choose **Model** and select the multimodal model, or choose **OCR** and install MinerU.

DeepSee reads Harness provider metadata and credential references. It does not display, copy, or store the raw API key in its own configuration.

### Option A: multimodal model

Use this route for natural-image understanding, charts, screenshots, and questions that need semantic visual reasoning. A model appears in the visual list only when its Harness adapter confirms image input.

### Option B: MinerU OCR

Use this route for PDFs, scans, document text, tables, and layout. Click **MinerU · Install** once. DeepSee tries, in order:

1. an existing compatible MinerU command;
2. an existing `uv` environment;
3. Python + an isolated `venv`;
4. a checksum-verified portable UV archive kept inside DeepSee;
5. the official MinerU source ZIP as a final package-install fallback.

The OCR route uses the CPU-compatible `pipeline` backend and installs `mineru[core]>=3,<4`. Python packages and model files still require network access. A source ZIP is not a complete offline model bundle.

## 3. Run a smoke test

### Visual route

1. Start a new Harness conversation.
2. Attach a small screenshot or photo.
3. Ask: `Describe the image and list every visible line of text.`

A successful run names the selected visual reader and passes its observation back to the base model. If Harness still says the current model has no visual capability, see [Vision errors](TROUBLESHOOTING.md#harness-still-says-the-model-has-no-vision).

### Workflow route

After at least two executable routes are enabled, try:

```text
/workflow Review this small project: let one agent inspect the implementation and another check the risks, then summarize the result.
```

Harness should show a visible Workflow. DeepSee exposes the model directory to the main model; it does not force a complex Workflow for ordinary one-step requests.

## Local CLI discovery

DeepSee scans for Codex, Claude Code, Kimi CLI, OpenCode, and Ollama at startup. Discovery alone does not make a runtime executable.

- Codex and Claude Code can be enabled after the executable, login state, model choice, and adapter pass validation.
- Kimi CLI, OpenCode, and Ollama are currently discovery-only unless a stable Harness subagent adapter is available.
- A failed or logged-out CLI remains disabled instead of failing later in a Workflow.

Restart Harness after installing or signing in to a CLI so DeepSee can validate it again.

## ZIP fallback

Use this route if `npx github:` repeatedly times out.

1. Download [deepsee-main.zip](https://github.com/WUBING2023/deepsee/archive/refs/heads/main.zip) in a browser.
2. Extract it and open PowerShell in the `deepsee-main` folder.
3. Run:

```powershell
node .\scripts\cli.mjs install --from-folder --timeout-ms 0
node .\scripts\cli.mjs doctor
node .\scripts\cli.mjs web
```

This path uses the prebuilt files in the ZIP. It does not run `pnpm install` or compile the source. Before installing, DeepSee copies the package to `$DSH_HOME\deepsee\packages\<version>`, so the downloaded ZIP and extracted folder can be deleted afterward.

To start Harness later:

```powershell
dsh --profile web
# If dsh is not on PATH:
npx --yes @deepseek-ai/dsh@0.1.0-rc.6 --profile web
```

## Updates and uninstall

Opening the DeepSee panel performs a cached update check, at most once every six hours by default. When a newer version is found, click **Upgrade**. Checks are automatic; installation is never silent. Restart Harness when the panel shows **Restart to apply**.

To remove the plugin while keeping model preferences, routing state, and MinerU state:

```powershell
npx --yes github:WUBING2023/deepsee uninstall
```

User state remains under `$DSH_HOME/deepsee`. Remove that directory manually only when you intentionally want a full reset.

## Next steps

- [Architecture and extension points](ARCHITECTURE.md)
- [Troubleshooting](TROUBLESHOOTING.md)
- [Contributing](../CONTRIBUTING.md)
