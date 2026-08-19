import { describe, expect, it } from "vitest";
import {
  ALIYUN_PYPI_INDEX,
  conciseInstallError,
  isWindowsTorchDllFailure,
  isSupportedPythonVersion,
  mineruModelSources,
  mineruPackageSources,
  portableUvAsset,
  probePythonRuntime,
  pythonLauncherCandidates,
  resolvePortableUvRelease,
  WINDOWS_TORCH_COMPAT_PACKAGES,
  WINDOWS_TORCH_CPU_INDEX,
} from "./mineru-install-strategies.mjs";

describe("MinerU installation strategies", () => {
  it("recognizes the Windows PyTorch c10 DLL initialization failure", () => {
    expect(isWindowsTorchDllFailure('OSError: [WinError 1114] Error loading "C:\\env\\torch\\lib\\c10.dll"')).toBe(true);
    expect(isWindowsTorchDllFailure("network timeout")).toBe(false);
    expect(WINDOWS_TORCH_COMPAT_PACKAGES).toEqual(["torch==2.8.0", "torchvision==0.23.0"]);
    expect(WINDOWS_TORCH_CPU_INDEX).toBe("https://download.pytorch.org/whl/cpu");
  });

  it("tries official PyPI before a configurable mainland mirror", () => {
    expect(mineruPackageSources({})).toEqual([
      { id: "pypi", label: "官方 PyPI", indexUrl: undefined },
      { id: "mirror", label: "国内镜像", indexUrl: ALIYUN_PYPI_INDEX },
    ]);
    expect(mineruPackageSources({ OPENDS_MINERU_PYPI_MIRROR: "https://mirror.example/simple" })[1].indexUrl)
      .toBe("https://mirror.example/simple");
  });

  it("uses automatic model-source selection and keeps explicit preferences first", () => {
    expect(mineruModelSources({})).toEqual(["auto", "modelscope", "huggingface"]);
    expect(mineruModelSources({ OPENDS_MINERU_MODEL_SOURCE: "modelscope" }))
      .toEqual(["modelscope", "huggingface"]);
  });

  it("enforces MinerU's supported Python range on Windows", () => {
    expect(isSupportedPythonVersion("3.10.14", "win32")).toBe(true);
    expect(isSupportedPythonVersion("3.12.9", "win32")).toBe(true);
    expect(isSupportedPythonVersion("3.13.1", "win32")).toBe(false);
    expect(isSupportedPythonVersion("3.13.1", "linux")).toBe(true);
    expect(isSupportedPythonVersion("3.14.0", "linux")).toBe(false);
  });

  it("discovers Windows Python launchers without shell command strings", () => {
    const candidates = pythonLauncherCandidates("win32", (name) => `C:\\Tools\\${name}.exe`);
    expect(candidates[0]).toEqual({
      command: "C:\\Tools\\py.exe",
      prefixArgs: ["-3.12"],
      label: "py -3.12",
    });
    expect(candidates.some((candidate) => candidate.label === "python")).toBe(true);
  });

  it("probes and rejects unsupported Python versions", () => {
    const candidate = { command: "C:\\Python\\python.exe", prefixArgs: [], label: "python" };
    expect(probePythonRuntime(candidate, {
      platform: "win32",
      spawnSync: () => ({ status: 0, stdout: "3.12.4\r\n" }),
    })).toMatchObject({ version: "3.12.4" });
    expect(probePythonRuntime(candidate, {
      platform: "win32",
      spawnSync: () => ({ status: 0, stdout: "3.13.1\r\n" }),
    })).toBeUndefined();
  });

  it("maps portable UV to signed official archives", () => {
    expect(portableUvAsset("win32", "x64")).toMatchObject({
      fileName: "uv-x86_64-pc-windows-msvc.zip",
      archiveType: "zip",
      executableName: "uv.exe",
    });
    expect(portableUvAsset("win32", "x64").checksumUrl).toMatch(/\.zip\.sha256$/);
    expect(portableUvAsset("win32", "x64").releaseApiUrl).toMatch(/api\.github\.com/);
    expect(portableUvAsset("linux", "arm64")).toMatchObject({ archiveType: "tar.gz", executableName: "uv" });
    expect(portableUvAsset("freebsd", "x64")).toBeUndefined();
  });

  it("uses the official GitHub asset digest when available", () => {
    const asset = portableUvAsset("win32", "x64");
    const digest = "a".repeat(64);
    expect(resolvePortableUvRelease({
      tag_name: "0.11.30",
      assets: [
        { name: asset.fileName, browser_download_url: "https://github.test/uv.zip", digest: `sha256:${digest}` },
        { name: `${asset.fileName}.sha256`, browser_download_url: "https://github.test/uv.zip.sha256" },
      ],
    }, asset)).toEqual({
      archiveUrl: "https://github.test/uv.zip",
      checksumUrl: "https://github.test/uv.zip.sha256",
      digest,
      tag: "0.11.30",
    });
  });

  it("keeps background failure summaries compact", () => {
    expect(conciseInstallError(new Error("first\n\nsecond"))).toBe("first second");
    expect(conciseInstallError("x".repeat(800))).toHaveLength(500);
  });
});
