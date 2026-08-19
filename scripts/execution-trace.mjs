import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

const TRACE_VERSION = 1;
const MAX_RUNS = 120;
const MAX_EVENTS = 320;
const MAX_TEXT = 16_000;
const MAX_PUBLIC_SUMMARY = 1_200;
const MAX_PUBLIC_DETAIL = 2_000;
const MAX_PUBLIC_EVENTS = 60;
const ARTIFACT_EXTENSIONS = new Set([
  ".avif", ".bmp", ".csv", ".gif", ".htm", ".html", ".jpeg", ".jpg",
  ".json", ".md", ".pdf", ".png", ".svg", ".txt", ".webp", ".xml",
]);

let configuredRoot = "";
let loadedPath = "";
let state = { version: TRACE_VERSION, runs: {} };
let saveCounter = 0;

function tracePath(stateRoot = configuredRoot) {
  return stateRoot ? join(stateRoot, "execution-traces.json") : "";
}

function cleanText(value, limit = MAX_TEXT) {
  const text = typeof value === "string" ? value.replace(/\u0000/g, "").trim() : "";
  return text.length > limit ? `${text.slice(0, limit)}\n…` : text;
}

function load(stateRoot = configuredRoot) {
  const path = tracePath(stateRoot);
  if (!path || path === loadedPath) return;
  loadedPath = path;
  state = { version: TRACE_VERSION, runs: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed?.version === TRACE_VERSION && parsed.runs && typeof parsed.runs === "object") state = parsed;
  } catch {}
}

function save() {
  if (!loadedPath) return;
  mkdirSync(dirname(loadedPath), { recursive: true });
  const temporary = `${loadedPath}.${process.pid}.${Date.now()}.${saveCounter += 1}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(state)}\n`, "utf8");
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      renameSync(temporary, loadedPath);
      return;
    } catch (error) {
      lastError = error;
      if (!["EPERM", "EBUSY", "EACCES"].includes(error?.code) || attempt === 5) break;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 8 * (attempt + 1));
    }
  }
  rmSync(temporary, { force: true });
  throw lastError;
}

function insideWorkspace(path, cwd) {
  const rel = relative(cwd, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function normalizeArtifact(candidate, cwd) {
  const raw = cleanText(candidate, 2_048)
    .replace(/^file:\/\//i, "")
    .replace(/^[`'\"]|[`'\"),.;:]+$/g, "");
  if (!raw || !cwd || !ARTIFACT_EXTENSIONS.has(extname(raw).toLowerCase())) return null;
  const absolute = resolve(isAbsolute(raw) ? raw : join(cwd, raw));
  const workspace = resolve(cwd);
  if (!insideWorkspace(absolute, workspace) || !existsSync(absolute)) return null;
  try {
    if (!statSync(absolute).isFile()) return null;
  } catch {
    return null;
  }
  return {
    id: createHash("sha256").update(absolute.toLowerCase()).digest("hex").slice(0, 16),
    name: basename(absolute),
    path: absolute,
    relativePath: relative(workspace, absolute) || basename(absolute),
    extension: extname(absolute).toLowerCase(),
  };
}

function candidatesFromText(text) {
  const candidates = [];
  const source = cleanText(text);
  for (const match of source.matchAll(/`([^`\r\n]+)`/g)) candidates.push(match[1]);
  for (const match of source.matchAll(/(?:^|[\s"'(])((?:[A-Za-z]:[\\/]|\.?\.?[\\/])?[^\s"'`<>|]+\.(?:png|jpe?g|webp|gif|svg|pdf|html?|md|txt|json|csv|xml))(?:$|[\s"'),.;])/gim)) {
    candidates.push(match[1]);
  }
  return candidates;
}

function addArtifacts(run, values) {
  const existing = new Set(run.artifacts.map((artifact) => artifact.id));
  for (const value of values) {
    const artifact = normalizeArtifact(value, run.cwd);
    if (artifact && !existing.has(artifact.id)) {
      run.artifacts.push(artifact);
      existing.add(artifact.id);
    }
  }
}

function publicArtifact(childId, artifact) {
  return {
    id: artifact.id,
    name: artifact.name,
    relativePath: artifact.relativePath,
    extension: artifact.extension,
    url: `/api/deepsee/v1/artifacts/${encodeURIComponent(childId)}/${encodeURIComponent(artifact.id)}`,
  };
}

function trimRuns() {
  const entries = Object.entries(state.runs);
  if (entries.length <= MAX_RUNS) return;
  entries.sort((left, right) => String(right[1].updatedAt).localeCompare(String(left[1].updatedAt)));
  state.runs = Object.fromEntries(entries.slice(0, MAX_RUNS));
}

export function configureExecutionTrace(stateRoot) {
  configuredRoot = resolve(stateRoot);
  load(configuredRoot);
}

export function recordExecutionTrace(input) {
  load();
  const childId = cleanText(input?.childId, 256);
  const type = cleanText(input?.type, 80);
  if (!childId || !type || !loadedPath) return null;
  const now = new Date().toISOString();
  const run = state.runs[childId] || {
    childId,
    parentSessionId: cleanText(input.parentSessionId, 256),
    provider: cleanText(input.provider, 80) || "unknown",
    model: cleanText(input.model, 160),
    cwd: cleanText(input.cwd, 2_048),
    status: "running",
    startedAt: now,
    updatedAt: now,
    events: [],
    artifacts: [],
  };
  if (input.parentSessionId) run.parentSessionId = cleanText(input.parentSessionId, 256);
  if (input.provider) run.provider = cleanText(input.provider, 80);
  if (input.model) run.model = cleanText(input.model, 160);
  if (input.cwd) run.cwd = cleanText(input.cwd, 2_048);
  run.updatedAt = now;

  const event = {
    id: cleanText(input.eventId, 256) || `${Date.now()}-${run.events.length}`,
    type,
    time: now,
    status: cleanText(input.status, 32),
    title: cleanText(input.title, 240),
    summary: cleanText(input.summary),
    detail: cleanText(input.detail),
  };
  const last = run.events.at(-1);
  if (input.append === true && last && last.id === event.id && last.type === event.type) {
    last.summary = cleanText(`${last.summary || ""}${input.summary || ""}`);
    last.time = now;
  } else {
    run.events.push(event);
    if (run.events.length > MAX_EVENTS) run.events.splice(0, run.events.length - MAX_EVENTS);
  }

  if (type === "run.completed") {
    run.status = input.status === "failed" ? "failed" : input.status === "cancelled" ? "cancelled" : "completed";
    run.endedAt = now;
  } else if (type === "run.failed") {
    run.status = "failed";
    run.endedAt = now;
  } else if (type === "run.started") {
    run.status = "running";
  }

  const explicit = Array.isArray(input.artifacts) ? input.artifacts : [];
  addArtifacts(run, explicit);
  if (input.path) addArtifacts(run, [input.path]);
  if (input.output) addArtifacts(run, candidatesFromText(input.output));
  if (input.summary && type === "run.completed") addArtifacts(run, candidatesFromText(input.summary));
  state.runs[childId] = run;
  trimRuns();
  save();
  return childId;
}

export function listExecutionTraces(childIds = []) {
  load();
  const ids = Array.isArray(childIds) ? childIds.map(String) : [];
  const selected = ids.length > 0 ? ids : Object.keys(state.runs);
  return selected.flatMap((childId) => {
    const run = state.runs[childId];
    if (!run) return [];
    const publicEvents = run.events.length <= MAX_PUBLIC_EVENTS
      ? run.events
      : [
          ...(run.events[0]?.type === "run.started" ? [run.events[0]] : []),
          ...run.events.slice(-(MAX_PUBLIC_EVENTS - (run.events[0]?.type === "run.started" ? 1 : 0))),
        ];
    return [{
      childId: run.childId,
      parentSessionId: run.parentSessionId,
      provider: run.provider,
      model: run.model,
      status: run.status,
      startedAt: run.startedAt,
      updatedAt: run.updatedAt,
      endedAt: run.endedAt,
      events: publicEvents.map((event) => ({
        ...event,
        summary: cleanText(event.summary, MAX_PUBLIC_SUMMARY),
        detail: cleanText(event.detail, MAX_PUBLIC_DETAIL),
      })),
      artifacts: run.artifacts.map((artifact) => publicArtifact(childId, artifact)),
    }];
  });
}

export function resolveExecutionArtifact(childId, artifactId) {
  load();
  const run = state.runs[String(childId)];
  const artifact = run?.artifacts.find((candidate) => candidate.id === String(artifactId));
  if (!artifact || !run.cwd) return null;
  const normalized = normalizeArtifact(artifact.path, run.cwd);
  return normalized?.id === artifact.id ? normalized : null;
}

export function resetExecutionTraceForTests(stateRoot) {
  configuredRoot = resolve(stateRoot);
  loadedPath = tracePath(configuredRoot);
  state = { version: TRACE_VERSION, runs: {} };
}
