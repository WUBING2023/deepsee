import { spawnSync } from "node:child_process";
import { resolveExecutableInvocation } from "./npx-command.mjs";
import { findExecutable } from "./runtime-locator.mjs";

export const MINERU_PACKAGE_SPEC = "mineru[core]>=3,<4";
export const MINERU_SOURCE_ZIP_URL = "https://github.com/opendatalab/MinerU/archive/refs/heads/master.zip";
export const ALIYUN_PYPI_INDEX = "https://mirrors.aliyun.com/pypi/simple";

export function mineruPackageSources(env = process.env) {
  const mirror = env.OPENDS_MINERU_PYPI_MIRROR?.trim() || ALIYUN_PYPI_INDEX;
  return [
    { id: "pypi", label: "官方 PyPI", indexUrl: undefined },
    ...(mirror ? [{ id: "mirror", label: "国内镜像", indexUrl: mirror }] : []),
  ];
}

export function mineruModelSources(env = process.env) {
  const preferred = env.OPENDS_MINERU_MODEL_SOURCE?.trim().toLowerCase();
  const supported = new Set(["auto", "modelscope", "huggingface"]);
  const candidates = [supported.has(preferred) ? preferred : "auto", "modelscope", "huggingface"];
  return [...new Set(candidates)];
}

export function isSupportedPythonVersion(version, platform = process.platform) {
  const [major, minor] = String(version).split(".").map(Number);
  if (major !== 3 || !Number.isInteger(minor)) return false;
  return minor >= 10 && minor <= (platform === "win32" ? 12 : 13);
}

export function pythonLauncherCandidates(platform = process.platform, locate = findExecutable) {
  const candidates = [];
  const add = (commandName, prefixArgs = []) => {
    const command = locate(commandName);
    if (!command) return;
    const key = `${command.toLowerCase()}\0${prefixArgs.join("\0")}`;
    if (candidates.some((candidate) => candidate.key === key)) return;
    candidates.push({ key, command, prefixArgs, label: `${commandName}${prefixArgs.length ? ` ${prefixArgs.join(" ")}` : ""}` });
  };
  if (platform === "win32") {
    for (const version of ["3.12", "3.11", "3.10"]) add("py", [`-${version}`]);
    add("python");
    add("python3");
  } else {
    for (const name of ["python3.13", "python3.12", "python3.11", "python3.10", "python3", "python"]) add(name);
  }
  return candidates.map(({ key: _key, ...candidate }) => candidate);
}

export function probePythonRuntime(candidate, options = {}) {
  const platform = options.platform ?? process.platform;
  const invoke = resolveExecutableInvocation(candidate.command, [
    ...candidate.prefixArgs,
    "-c",
    "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}')",
  ], { platform, ...options.invocation });
  const result = (options.spawnSync ?? spawnSync)(invoke.command, invoke.args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
  });
  const version = result.status === 0 ? String(result.stdout || "").trim().split(/\r?\n/).at(-1) : "";
  if (!isSupportedPythonVersion(version, platform)) return undefined;
  return { ...candidate, version };
}

export function discoverCompatiblePythonRuntimes(options = {}) {
  const platform = options.platform ?? process.platform;
  const locate = options.findExecutable ?? ((name) => findExecutable(name));
  const candidates = pythonLauncherCandidates(platform, locate);
  const runtimes = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const runtime = probePythonRuntime(candidate, { ...options, platform });
    if (!runtime) continue;
    const key = `${runtime.command.toLowerCase()}\0${runtime.version}`;
    if (seen.has(key)) continue;
    seen.add(key);
    runtimes.push(runtime);
  }
  return runtimes;
}

export function portableUvAsset(platform = process.platform, architecture = process.arch) {
  const triples = {
    win32: { x64: "x86_64-pc-windows-msvc", arm64: "aarch64-pc-windows-msvc", ia32: "i686-pc-windows-msvc" },
    linux: { x64: "x86_64-unknown-linux-gnu", arm64: "aarch64-unknown-linux-gnu", ia32: "i686-unknown-linux-gnu" },
    darwin: { x64: "x86_64-apple-darwin", arm64: "aarch64-apple-darwin" },
  };
  const triple = triples[platform]?.[architecture];
  if (!triple) return undefined;
  const extension = platform === "win32" ? "zip" : "tar.gz";
  const fileName = `uv-${triple}.${extension}`;
  const url = `https://github.com/astral-sh/uv/releases/latest/download/${fileName}`;
  return {
    fileName,
    url,
    checksumUrl: `${url}.sha256`,
    releaseApiUrl: "https://api.github.com/repos/astral-sh/uv/releases/latest",
    archiveType: extension,
    executableName: platform === "win32" ? "uv.exe" : "uv",
  };
}

export function resolvePortableUvRelease(metadata, asset) {
  if (!asset || !Array.isArray(metadata?.assets)) return undefined;
  const archive = metadata.assets.find((candidate) => candidate?.name === asset.fileName);
  if (!archive?.browser_download_url) return undefined;
  const checksum = metadata.assets.find((candidate) => candidate?.name === `${asset.fileName}.sha256`);
  const digest = typeof archive.digest === "string" && /^sha256:[a-fA-F0-9]{64}$/.test(archive.digest)
    ? archive.digest.slice("sha256:".length).toLowerCase()
    : undefined;
  return {
    archiveUrl: archive.browser_download_url,
    checksumUrl: checksum?.browser_download_url,
    digest,
    tag: metadata.tag_name,
  };
}

export function conciseInstallError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}
