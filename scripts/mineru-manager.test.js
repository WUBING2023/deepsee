import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getMinerUStatus,
  managedMinerUExecutable,
  uninstallMinerU,
  writeMinerUState,
} from "./mineru-manager.mjs";

const temporaryRoots = [];
const originalHome = process.env.OPENDS_MINERU_HOME;
const originalPath = process.env.PATH;

afterEach(() => {
  if (originalHome === undefined) delete process.env.OPENDS_MINERU_HOME;
  else process.env.OPENDS_MINERU_HOME = originalHome;
  if (originalPath === undefined) delete process.env.PATH;
  else process.env.PATH = originalPath;
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function createRoots() {
  const root = mkdtempSync(join(tmpdir(), "deepsee-mineru-state-"));
  const managed = mkdtempSync(join(tmpdir(), "deepsee-mineru-managed-"));
  temporaryRoots.push(root, managed);
  process.env.OPENDS_MINERU_HOME = managed;
  return { root, managed };
}

describe("MinerU manager state", () => {
  it("exposes the successful automatic installation method", () => {
    const { root } = createRoots();
    const executable = managedMinerUExecutable(root);
    mkdirSync(dirname(executable), { recursive: true });
    writeFileSync(executable, "");
    writeMinerUState(root, {
      status: "ready",
      installMethod: "Python/pip · 国内镜像",
      message: "MinerU 已安装。",
      attempts: [{ label: "Python/pip · 国内镜像", status: "success" }],
    });

    expect(getMinerUStatus(root)).toMatchObject({
      status: "ready",
      installed: true,
      managed: true,
      progress: 100,
      phase: "complete",
      installMethod: "Python/pip · 国内镜像",
      message: "MinerU 已安装。",
    });
  });

  it("keeps progress and failure summaries available to the UI", () => {
    const { root } = createRoots();
    writeMinerUState(root, {
      status: "installing",
      pid: process.pid,
      startedAt: new Date().toISOString(),
      strategy: "下载并校验便携 UV 压缩包",
      progress: 43,
      phase: "install",
      message: "正在尝试便携运行时。",
      attempts: [{ label: "系统 UV", status: "failed" }],
    });
    expect(getMinerUStatus(root)).toMatchObject({
      status: "installing",
      strategy: "下载并校验便携 UV 压缩包",
      progress: 43,
      phase: "install",
      attempts: [{ label: "系统 UV", status: "failed" }],
    });

    writeMinerUState(root, {
      status: "installing",
      pid: 2_147_483_647,
      startedAt: "2020-01-01T00:00:00.000Z",
      message: "旧进程",
    });
    expect(getMinerUStatus(root)).toMatchObject({
      status: "error",
      installed: false,
      phase: "error",
      message: expect.stringContaining("点击重试"),
    });

    writeMinerUState(root, {
      status: "error",
      startedAt: new Date().toISOString(),
      message: "全部策略失败，可以重试。",
      attempts: [{ label: "官方源码 ZIP", status: "failed" }],
    });
    expect(getMinerUStatus(root)).toMatchObject({
      status: "error",
      message: "全部策略失败，可以重试。",
      phase: "error",
      attempts: [{ label: "官方源码 ZIP", status: "failed" }],
    });
  });

  it("uninstalls only DeepSee-managed MinerU entries", () => {
    const { root, managed } = createRoots();
    const executable = managedMinerUExecutable(root);
    mkdirSync(dirname(executable), { recursive: true });
    writeFileSync(executable, "");
    mkdirSync(join(managed, "model-cache"), { recursive: true });
    writeFileSync(join(managed, "model-cache", "model.bin"), "fixture");
    writeFileSync(join(managed, "keep.txt"), "unrelated");
    writeMinerUState(root, { status: "ready", message: "MinerU 已安装。" });

    expect(uninstallMinerU(root)).toMatchObject({
      status: "not-installed",
      installed: false,
      progress: 0,
      phase: "idle",
      message: expect.stringContaining("已卸载"),
    });
    expect(existsSync(executable)).toBe(false);
    expect(existsSync(join(managed, "model-cache"))).toBe(false);
    expect(existsSync(join(managed, "keep.txt"))).toBe(true);
  });

  it("refuses to remove a system-managed MinerU executable", () => {
    const { root } = createRoots();
    const externalBin = mkdtempSync(join(tmpdir(), "deepsee-mineru-system-"));
    temporaryRoots.push(externalBin);
    const external = join(externalBin, process.platform === "win32" ? "mineru.EXE" : "mineru");
    writeFileSync(external, "");
    if (process.platform !== "win32") chmodSync(external, 0o755);
    process.env.PATH = externalBin;

    expect(() => uninstallMinerU(root)).toThrow("不会卸载其他程序管理的环境");
    expect(existsSync(external)).toBe(true);
  });
});
