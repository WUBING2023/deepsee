import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const VISION_PROVIDER = "opends-vision";
export const DEFAULT_DEEPSEEK_SELECTION = Object.freeze({
  provider: "deepseek-official",
  model: "deepseek-v4-flash",
  reasoningEffort: "high",
});

function yamlValue(raw) {
  const value = raw.trim();
  if (
    (value.startsWith("\"") && value.endsWith("\""))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function safeYaml(value) {
  return /^[A-Za-z0-9_.:/+-]+$/.test(value) ? value : JSON.stringify(value);
}

export function readModelSelection(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^agent-default-model:\s*$/.test(line));
  if (start === -1) return null;
  const selection = {};
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (line && !/^\s/.test(line)) break;
    const match = line.match(/^\s+(provider|model|reasoningEffort):\s*(.*?)\s*$/);
    if (match) selection[match[1]] = yamlValue(match[2]);
  }
  return typeof selection.provider === "string" && typeof selection.model === "string"
    ? selection
    : null;
}

export function writeModelSelection(text, selection) {
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^agent-default-model:\s*$/.test(line));
  let end = start;
  if (start !== -1) {
    end = start + 1;
    while (end < lines.length && (lines[end] === "" || /^\s/.test(lines[end]))) end += 1;
  }
  const replacement = [
    "agent-default-model:",
    "  provider: " + safeYaml(selection.provider),
    "  model: " + safeYaml(selection.model),
    ...(selection.reasoningEffort
      ? ["  reasoningEffort: " + safeYaml(selection.reasoningEffort)]
      : []),
  ];
  if (start === -1) {
    while (lines.length > 0 && lines.at(-1) === "") lines.pop();
    if (lines.length > 0) lines.push("");
    lines.push(...replacement, "");
  } else {
    lines.splice(start, end - start, ...replacement);
  }
  return lines.join(newline).replace(new RegExp(newline + "*$"), "") + newline;
}

export function readBridgeState(path) {
  if (!existsSync(path)) return {};
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function enableVisionSelection(settingsPath, statePath) {
  const state = readBridgeState(statePath);
  const text = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "";
  const current = readModelSelection(text);
  const previousModel = current?.provider === VISION_PROVIDER
    ? state.previousModel ?? DEFAULT_DEEPSEEK_SELECTION
    : current ?? state.previousModel ?? DEFAULT_DEEPSEEK_SELECTION;
  const deepseekModel = previousModel.provider.startsWith("deepseek")
    ? previousModel.model
    : DEFAULT_DEEPSEEK_SELECTION.model;
  const next = {
    provider: VISION_PROVIDER,
    model: deepseekModel,
    reasoningEffort: previousModel.reasoningEffort ?? DEFAULT_DEEPSEEK_SELECTION.reasoningEffort,
  };
  writeFileSync(settingsPath, writeModelSelection(text, next), "utf8");
  const nextState = { ...state, enabled: true, previousModel };
  writeFileSync(statePath, JSON.stringify(nextState, null, 2) + "\n", "utf8");
  return next;
}

export function disableVisionSelection(settingsPath, statePath) {
  const state = readBridgeState(statePath);
  const text = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "";
  const restore = state.previousModel ?? DEFAULT_DEEPSEEK_SELECTION;
  writeFileSync(settingsPath, writeModelSelection(text, restore), "utf8");
  writeFileSync(statePath, JSON.stringify({ ...state, enabled: false }, null, 2) + "\n", "utf8");
  return restore;
}
