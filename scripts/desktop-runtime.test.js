import { describe, expect, it } from "vitest";
import { discoverDesktopApps, publicDesktopApps } from "./desktop-runtime.mjs";

describe("desktop runtime discovery", () => {
  it("detects Windows Codex and Claude apps without treating a GUI as an executable runtime", () => {
    const existing = new Set([
      "C:\\Users\\Test\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe",
    ]);
    const apps = discoverDesktopApps({
      platform: "win32",
      home: "C:\\Users\\Test",
      env: { LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local" },
      windowsPackages: [
        { Name: "OpenAI.Codex", InstallLocation: "C:\\Program Files\\WindowsApps\\OpenAI.Codex_1", Version: "1.2.3" },
        { Name: "Claude", InstallLocation: "C:\\Program Files\\WindowsApps\\Claude_1", Version: "4.5.6" },
      ],
      exists: (path) => existing.has(path),
    });

    expect(apps).toEqual([
      expect.objectContaining({ id: "desktop:codex", version: "1.2.3", runtimeExecutable: expect.stringContaining("codex.exe") }),
      expect.objectContaining({ id: "desktop:claude", version: "4.5.6", launchUrl: "claude://code/new" }),
    ]);
    expect(apps[1].runtimeExecutable).toBeUndefined();
  });

  it("marks a desktop app callable only when its matching runtime passed verification", () => {
    const apps = [
      { id: "desktop:codex", name: "Codex Desktop", provider: "openai", launchUrl: "codex://", runtimeDefinitionId: "cli:codex", runtimeExecutable: "private-path" },
      { id: "desktop:claude", name: "Claude Desktop", provider: "anthropic", launchUrl: "claude://code/new", runtimeDefinitionId: "cli:claude-code" },
    ];
    expect(publicDesktopApps(apps, [{ id: "cli:codex", status: "ready", enabled: true }])).toEqual([
      expect.objectContaining({ id: "desktop:codex", execution: "runtime", runtimeRouteId: "cli:codex" }),
      expect.objectContaining({ id: "desktop:claude", execution: "launch-only" }),
    ]);
    expect(JSON.stringify(publicDesktopApps(apps, []))).not.toContain("private-path");
  });

  it("finds conventional Windows desktop installs when AppX metadata is unavailable", () => {
    const existing = new Set([
      "C:\\Users\\Test\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe",
      "C:\\Users\\Test\\AppData\\Local\\AnthropicClaude\\claude.exe",
    ]);
    expect(discoverDesktopApps({
      platform: "win32",
      home: "C:\\Users\\Test",
      env: { LOCALAPPDATA: "C:\\Users\\Test\\AppData\\Local" },
      windowsPackages: [],
      exists: (path) => existing.has(path),
    })).toEqual([
      expect.objectContaining({ id: "desktop:codex", runtimeExecutable: expect.stringContaining("codex.exe") }),
      expect.objectContaining({ id: "desktop:claude", launchUrl: "claude://code/new" }),
    ]);
  });

  it("detects macOS app bundles from system or user Applications", () => {
    const existing = new Set(["/Applications/Codex.app", "/Users/test/Applications/Claude.app"]);
    expect(discoverDesktopApps({ platform: "darwin", home: "/Users/test", exists: (path) => existing.has(path) }))
      .toEqual([
        expect.objectContaining({ id: "desktop:codex" }),
        expect.objectContaining({ id: "desktop:claude" }),
      ]);
  });
});
