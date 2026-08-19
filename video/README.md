# DeepSee bilingual product demo

This directory contains the deterministic Remotion source for the Chinese and English DeepSee product films. Both compositions share the same 1155-frame, 30 fps timeline and differ only in localized copy.

## Render

```powershell
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run render:zh
pnpm run render:en
pnpm run render:zh:nobgm
pnpm run render:en:nobgm
```

Remotion may download its supported headless browser. For a local browser override, add `--browser-executable="C:\path\to\chrome.exe"` to the Remotion command.

The public product screenshots are captured by `capture-product.mjs`; the source page is served locally and no user workspace, key, account, or conversation data is included. See `design-spec.md` for the decision table, shot map, tokens, and storyboard. See `AUDIO-ATTRIBUTION.md` for the BGM and SFX provenance.
