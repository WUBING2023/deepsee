import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  getMinerUStatus,
  managedMinerUExecutable,
  writeMinerUState,
} from "./mineru-manager.mjs";

const temporaryRoots = [];
const originalHome = process.env.OPENDS_MINERU_HOME;

afterEach(() => {
  if (originalHome === undefined) delete process.env.OPENDS_MINERU_HOME;
  else process.env.OPENDS_MINERU_HOME = originalHome;
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
      message: "正在尝试便携运行时。",
      attempts: [{ label: "系统 UV", status: "failed" }],
    });
    expect(getMinerUStatus(root)).toMatchObject({
      status: "installing",
      strategy: "下载并校验便携 UV 压缩包",
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
      attempts: [{ label: "官方源码 ZIP", status: "failed" }],
    });
  });
});
