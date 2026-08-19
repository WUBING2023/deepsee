# DeepSee troubleshooting

[简体中文](TROUBLESHOOTING.zh-CN.md) · [Back to README](../README.md)

Start with one non-destructive diagnostic command:

```powershell
npm exec --yes --package=https://github.com/WUBING2023/deepsee/releases/download/v0.6.0-alpha.30/deepsee-0.6.0-alpha.30.tgz -- deepsee doctor
```

It reports the resolved `DSH_HOME`, plugin status for Web and Headless, and local prerequisites without printing secrets. In the current alpha, some diagnostic labels still use the legacy `Bridge` / `OPENDS_*` names; those lines are compatibility information, not a requirement to duplicate API keys already stored by Harness.

## The old one-line command downloads and then prints nothing

Do not use `npx --yes github:WUBING2023/deepsee install` anymore. That form asks npm to infer the executable from a GitHub package and resolves the full Harness peer graph before DeepSee starts; some Windows/npm combinations return immediately or show no useful progress.

Starting with alpha.30, use the `npm exec --package=... -- deepsee` command at the top of this guide. It pins the published versioned package and the `deepsee` executable explicitly. Once started, it immediately prints `DSH_HOME`, target profiles, and per-step progress.

## Installation times out

Typical error:

```text
Error: spawnSync ... node.exe ETIMEDOUT
```

This usually means the nested Harness package download exceeded the installer deadline, especially on an older computer or slow registry connection. It does not necessarily mean Node.js is broken.

Try the resumable path first:

```powershell
npm exec --yes --package=https://github.com/WUBING2023/deepsee/releases/download/v0.6.0-alpha.30/deepsee-0.6.0-alpha.30.tgz -- deepsee install --timeout-ms 0 --retries 3
```

Already completed profiles are skipped. If the Release package itself cannot be downloaded, use the [ZIP fallback](GETTING_STARTED.md#zip-fallback), which removes that download step entirely.

## The DeepSee panel is missing

1. Run `deepsee doctor` and confirm the Web profile says `installed`.
2. Stop and restart the Harness Web process. Installing a bundle does not hot-load it into a process that is already running.
3. Confirm the browser and installer use the same `DSH_HOME`.
4. Confirm you started the Web profile, not Headless.
5. If the manifest is stale, run:

```powershell
npm exec --yes --package=https://github.com/WUBING2023/deepsee/releases/download/v0.6.0-alpha.30/deepsee-0.6.0-alpha.30.tgz -- deepsee install --force
npm exec --yes --package=https://github.com/WUBING2023/deepsee/releases/download/v0.6.0-alpha.30/deepsee-0.6.0-alpha.30.tgz -- deepsee web
```

The panel depends on `/api/deepsee`; Headless intentionally does not expose this Web route.

If a local window and a reopened `127.0.0.1:3080` show the same conversations but different credentials or DeepSee preferences, the processes are usually using different `DSH_HOME` roots. Standard `deepsee web` and `pnpm start:web` now use the shared Harness home. Only the explicitly named `pnpm start:web:isolated` uses a project-local home. Stop the stale port-3080 process and restart the standard Web command as the same Windows user. Do not duplicate API keys into a second home.

## Port 3080 does not open

Check whether another process already owns the default port on Windows:

```powershell
Get-NetTCPConnection -LocalPort 3080 -ErrorAction SilentlyContinue
```

Close the stale Harness process or start the intended existing instance. DeepSee does not start a separate service or use port `3091`.

## Harness still says the model has no vision

Check all of the following:

1. A visual reader is selected in DeepSee preferences.
2. When using **Model**, the selected Harness model explicitly declares image input and is `ready`.
3. When using **OCR**, the selected MinerU, PaddleOCR, or RapidOCR status is `ready`.
4. The route is enabled, and any provider credential remains valid in Harness.
5. Harness was restarted after model or plugin changes.

Remove and reattach the image in a new conversation after changing the reader. DeepSee must receive the attachment before it can produce the attributed visual observation.

If a provider claims a model is multimodal but its Harness adapter does not advertise image input, DeepSee keeps it out of the visual list. Fix the provider metadata or choose a confirmed visual model; do not force a text-only route.

## A CLI is installed but not detected

Open the same terminal environment that starts Harness and verify the command directly:

```powershell
codex --version
claude --version
```

Then verify that CLI's own login state and restart Harness. Common causes are:

- the executable directory is not in the `PATH` inherited by Harness;
- the CLI was installed after Harness started;
- the command exists in another Windows user account or shell profile;
- the CLI is logged out;
- model catalog discovery failed;
- DeepSee can discover the runtime but has no stable execution adapter for it.

Kimi CLI, OpenCode, and Ollama may appear as discovery-only. That is an intentional capability boundary, not a failed toggle.

## Codex or Claude is visible but cannot be enabled

DeepSee requires more than a matching executable name. Run the CLI interactively once, complete its login flow, confirm it can answer a minimal request, then restart Harness. If it remains disabled, inspect the status hint in the model matrix and run `deepsee doctor` from the same environment.

Do not put subscription tokens into DeepSee files. Codex and Claude Code should continue to use their own supported login mechanisms.

## Local OCR installation fails

The UI keeps the final status, while full installer output is stored at:

```text
$DSH_HOME/deepsee/.opends-tools/mineru/install.stdout.log
$DSH_HOME/deepsee/.opends-tools/mineru/install.stderr.log
$DSH_HOME/deepsee/.opends-tools/ocr/<paddleocr|rapidocr>/install.stdout.log
$DSH_HOME/deepsee/.opends-tools/ocr/<paddleocr|rapidocr>/install.stderr.log
```

Check these common constraints:

- Windows Python must be 3.10–3.12; Linux/macOS supports 3.10–3.13.
- Package dependencies and model files require network access even with the source-ZIP fallback.
- Antivirus or corporate policy may block the portable UV executable.
- `curl exit 35` means the TLS handshake failed on an older Windows, proxy, or certificate chain; it does not mean the RapidOCR package is corrupt. The current installer automatically retries with DeepSee's bundled Node HTTPS path, PowerShell TLS 1.2, or Python and still verifies the official GitHub Release SHA-256 digest. Do not disable verification manually.
- A PyPI or model host may be unreachable from the current region.
- Disk space may be insufficient for the isolated environment and model files.
- On Windows, do not point `OPENDS_OCR_HOME` at a PaddleOCR model path containing non-ASCII characters. Remove the override and DeepSee will choose a compatible location automatically.

Advanced deployments can override package source, mirror, model source, and timeout with the documented `OPENDS_MINERU_*` or `OPENDS_OCR_*` variables in `.env.example`. Ordinary users should prefer retrying from the UI before changing them.

On Windows, `WinError 1114` or a `c10.dll` initialization failure triggers an automatic retry with the official PyTorch 2.8 CPU compatibility pair. If the operating system runtime is still missing, diagnostics link to Microsoft's official Visual C++ 2015–2022 x64 Redistributable installer.

The first OCR request must also load detection and recognition models and can take tens of seconds to two minutes on a low-end CPU. OCR extracts text and basic layout; it does not understand people, objects, scenes, chart semantics, or visual relationships. Use a verified visual model for those questions. After a failure, expand **View installation diagnostics** in the panel instead of locating the log manually.

## Upgrade fails or requests a manual upgrade

Update logs are stored at:

```text
$DSH_HOME/deepsee/.opends-update/update.stdout.log
$DSH_HOME/deepsee/.opends-update/update.stderr.log
```

A failed update leaves the current Harness process usable. Retry from the panel; a verified profile is skipped and only the incomplete profile continues.

**Manual upgrade required** means the new package declares an update protocol or minimum updater that the installed release cannot safely handle. Use the current one-command install or ZIP fallback instead of modifying profile files by hand.

## Reset without immediately deleting state

Uninstall preserves `$DSH_HOME/deepsee` by design. For a full diagnostic reset, stop Harness and rename that directory, for example to `deepsee.backup`, then reinstall. Renaming is preferable to deletion because it keeps model preferences and logs available for recovery.

## Reporting a useful issue

Open a [GitHub issue](https://github.com/WUBING2023/deepsee/issues) with:

- operating system and Node.js version;
- DeepSee and Harness versions;
- whether the failing profile is Web or Headless;
- the relevant `doctor` rows;
- the smallest reproducible steps;
- sanitized log excerpts.

Remove API keys, bearer tokens, credential references, local usernames, and private file contents before posting logs.
