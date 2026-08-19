# DeepSee bilingual demo video design spec

Mode: autonomous free creation

## Product brief

- Product: DeepSee, a lightweight plugin group for DeepSeek Harness.
- Audience: developers and advanced AI users who already use DeepSeek Harness, local subscription runtimes, or provider APIs.
- Public promise: install once, reuse Harness configuration, add a verified visual route, and route work to suitable models without a second console or companion service.
- Demonstration goal: make the product understandable in under 40 seconds and leave viewers with one executable next step.
- Deliverables: separate Simplified Chinese and English 1920×1080 videos at 30fps; each language exports a BGM+SFX master and an SFX-only master.
- Data policy: only public repository information and purpose-built fictional demo states. No API keys, usernames, local paths, conversations, or private workspace names appear.

## Requirement-to-execution decisions

| Requirement | Execution decision |
| --- | --- |
| Show a real product | Use the published DeepSee interface capture as the primary page texture. Hand-built scenes are explanatory diagrams, not fake screenshots. |
| Demonstrate value quickly | One clear arc: install → native panel → vision → model routing → Workflow → deliverables. |
| Chinese and English | One deterministic timeline and asset set; only copy, typography sizing, and end-card URL labels vary. |
| Keep the product lightweight | Restrained camera moves, one hero action per shot, no decorative AI particles except the final launch dust. |
| Publish-ready | H.264 MP4, yuv420p, web-optimized bitrate, poster frames, captions burned into the image, no private data. |
| Honest runtime boundaries | Use “verified route” language. Do not imply every detected CLI is executable or that OCR understands scenes semantically. |

## Direction study

1. **Native glass console** — follows Harness whites, soft blue wash, dense interface close-ups. Strong product fidelity, but risks becoming a screen recording.
2. **Precision routing** — white paper, graphite type, DeepSee blue, restrained 2.5D page moves, routing lines used only when they explain a hand-off. Best balance of clarity and motion.
3. **Dark runtime network** — neon graph and command-line atmosphere. Strong energy, but drifts away from the product’s native visual character.

Selected: **Precision routing**. It preserves DeepSee’s original design language and reserves the dark terminal/network treatment for two semantically justified moments.

## Visual and motion tokens

- Canvas: 1920×1080, 30fps, 38.5 seconds (1155 frames).
- Fonts: Inter / Segoe UI / PingFang SC / Microsoft YaHei; Consolas for commands.
- Ink: `#10131a`; soft ink: `#3e4655`; muted: `#6f7888`.
- Paper: `#ffffff`; wash: `#f5f7fb`; blue wash: `#edf3ff`.
- Brand blue: `#356df3`; deep blue: `#2455cc`; success: `#117a61`.
- Radius: 20–30px; shadows stay below 18% opacity.
- Motion personality: professional-trust preset with a small startup lift.
  - Main entrance: 21–28f, `bezier(0,0,0.2,1)`.
  - Physical landings only: `bezier(0.34,1.4,0.44,1)`.
  - Camera moves: 32–50f, no shake, no tail drift.
  - Brand and final lockup hold: at least 30f.
  - One major motion grammar per shot.

## Function-to-shot mapping

| Product function | Shot card / variant | Exact reference implementation | Why |
| --- | --- | --- | --- |
| Brand introduction | `brand-ink-open` | `template/src/aifl/live/SceneOpen.tsx` | Quietly establishes the name before the interface. |
| One-line installation | `typewriter-moves` · `terminal-typewriter` | `demos/typography/typewriter-moves/TerminalTypewriter.tsx` | The command is itself the product’s lowest-friction proof. |
| Native panel and visual preference | `spotlight-hero-card` | `template/src/aifl/live/SceneOpen.tsx` | Makes the visual reader the single hero and keeps the actual page legible. |
| Vision result entering the conversation | `row-embed` | `template/src/aifl/live/SceneDetail.tsx` | Structured observations visibly land in real response slots. |
| Model/runtime routing | `integration-hub-map` | `demos/ui-entrance/integration-hub-map/IntegrationHubMap.tsx` | The simultaneous two-beat connection clearly communicates routing. |
| Workflow execution trace | `ai-stream-response` | `demos/interaction/ai-stream-response/StreamResponse.tsx` | Shows summary first, then model-specific evidence, then completion. |
| Deliverable links | `document-typewriter-reveal` | `template/src/aifl/live/SceneWbr.tsx` | A slower, readable proof shot after the workflow peak. |
| Product sign-off | `outro-group-photo-launch` | `template/src/aifl/live/SceneOutroLive.tsx` | Calls back each capability and ends at release energy. |
| Transitions | `shot-transitions` A/C/D | `template/src/aifl/Main.tsx` plus the card parameter table | Flash for command→product, focus relay for feature sections, dark title breath before Workflow. |

## Storyboard

| # | Time | Shot | Key motion |
| --- | --- | --- | --- |
| 1 | 0:00–0:03 | DeepSee name and promise | Crosshair draw, letterpress wordmark, 1s hold. |
| 2 | 0:03–0:08 | One-line install | Deterministic terminal typing; Enter crash-zooms into the product. |
| 3 | 0:08–0:13 | Native Harness panel | Full real interface; spotlight finds Visual reader; card rises, scans, reseats. |
| 4 | 0:13–0:17 | Image becomes an observation | Image tile enters; four observation rows embed into the answer panel. |
| 5 | 0:17–0:22 | Verified models connect | DeepSeek, Codex, Claude, vision/OCR connect to a DeepSee hub in two beats. |
| 6 | 0:22–0:24 | Workflow breath card | A short dark card states “Plan once. Route by strength.” / “一次规划，按能力分工。” |
| 7 | 0:24–0:30 | Workflow trace | Result summary lands first; three agents complete copy, design, and review; final status resolves. |
| 8 | 0:30–0:34 | Deliverables | Poster, editable source, and report links reveal with a single moving caret. |
| 9 | 0:34–0:38.5 | Release sign-off | Capability fragments fly in, recede, DeepSee wordmark lands, install command holds. |

## Frame timeline

| shot | from | duration | Content |
| --- | ---: | ---: | --- |
| brand | 0 | 90 | Brand lockup and promise |
| install | 90 | 150 | Terminal command and flash-cut |
| native-panel | 240 | 150 | Real panel spotlight |
| vision | 390 | 120 | Image observation rows |
| routing | 510 | 150 | Runtime/model connection map |
| workflow-title | 660 | 54 | Chapter breath card |
| workflow | 714 | 180 | Multi-agent execution trace |
| deliverables | 894 | 111 | Clickable-looking public artifact links |
| outro | 1005 | 150 | Group-photo launch and CTA |

Total: 1155 frames / 38.5 seconds.

## Styleframe decision

The final styleframe contains three anchors: installation terminal, native interface hero, and routing/workflow explanation. These define the entire film’s palette, depth, and information density before Remotion implementation.
