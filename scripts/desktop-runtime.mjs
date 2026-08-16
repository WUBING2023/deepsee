import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";
import { spawnSync } from "node:child_process";

const WINDOWS_PACKAGE_NAMES = Object.freeze(["OpenAI.Codex", "Claude"]);

function firstExisting(candidates, exists) {
  return candidates.find((candidate) => candidate && exists(candidate));
}

function windowsPackages(options = {}) {
  if (Array.isArray(options.windowsPackages)) return options.windowsPackages;
  const systemRoot = options.env?.SystemRoot || options.env?.SYSTEMROOT || process.env.SystemRoot || process.env.SYSTEMROOT || "C:\\Windows";
  const powershell = win32.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const script = [
    "$ErrorActionPreference='SilentlyContinue'",
    "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new()",
    `$items=foreach($name in @(${WINDOWS_PACKAGE_NAMES.map((name) => `'${name}'`).join(",")})){Get-AppxPackage -Name $name | Select-Object Name,PackageFullName,InstallLocation,Version}`,
    "@($items)|ConvertTo-Json -Compress",
  ].join("; ");
  const run = options.runWindowsQuery || ((command, args) => spawnSync(command, args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 8_000,
    stdio: ["ignore", "pipe", "ignore"],
  }));
  const result = run(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script]);
  if (result?.status !== 0 || !String(result.stdout || "").trim()) return [];
  try {
    const parsed = JSON.parse(String(result.stdout).trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return [];
  }
}

function windowsApps(options) {
  const exists = options.exists || existsSync;
  const env = options.env || process.env;
  const userHome = options.home || homedir();
  const localAppData = env.LOCALAPPDATA || win32.join(userHome, "AppData", "Local");
  const packages = windowsPackages(options);
  const codexPackage = packages.find((item) => item?.Name === "OpenAI.Codex");
  const claudePackage = packages.find((item) => item?.Name === "Claude");
  const apps = [];
  const codexInstallRoot = codexPackage?.InstallLocation ? win32.join(String(codexPackage.InstallLocation), "app") : "";
  const codexRuntime = firstExisting([
    win32.join(localAppData, "Programs", "OpenAI", "Codex", "bin", "codex.exe"),
    codexInstallRoot ? win32.join(codexInstallRoot, "resources", "codex.exe") : "",
  ], exists);
  const codexGui = firstExisting([
    win32.join(localAppData, "Programs", "OpenAI", "Codex", "Codex.exe"),
    codexInstallRoot ? win32.join(codexInstallRoot, "Codex.exe") : "",
  ], exists);

  if (codexPackage?.InstallLocation || codexGui || codexRuntime) {
    apps.push({
      id: "desktop:codex",
      name: "Codex Desktop",
      provider: "openai",
      version: String(codexPackage?.Version || "").trim() || undefined,
      launchUrl: "codex://",
      runtimeDefinitionId: "cli:codex",
      runtimeExecutable: codexRuntime,
    });
  }

  const claudeGui = firstExisting([
    win32.join(localAppData, "AnthropicClaude", "claude.exe"),
    win32.join(localAppData, "Programs", "Claude", "Claude.exe"),
    win32.join(localAppData, "Programs", "claude", "Claude.exe"),
    claudePackage?.InstallLocation ? win32.join(String(claudePackage.InstallLocation), "app", "claude.exe") : "",
  ], exists);
  if (claudePackage?.InstallLocation || claudeGui) {
    apps.push({
      id: "desktop:claude",
      name: "Claude Desktop",
      provider: "anthropic",
      version: String(claudePackage?.Version || "").trim() || undefined,
      launchUrl: "claude://code/new",
      runtimeDefinitionId: "cli:claude-code",
    });
  }
  return apps;
}

function macApps(options) {
  const exists = options.exists || existsSync;
  const userHome = options.home || homedir();
  const apps = [];
  const codexRoot = firstExisting(["/Applications/Codex.app", posix.join(userHome, "Applications", "Codex.app")], exists);
  if (codexRoot) {
    apps.push({
      id: "desktop:codex",
      name: "Codex Desktop",
      provider: "openai",
      launchUrl: "codex://",
      runtimeDefinitionId: "cli:codex",
      runtimeExecutable: firstExisting([
        posix.join(codexRoot, "Contents", "Resources", "codex"),
        posix.join(codexRoot, "Contents", "MacOS", "codex"),
      ], exists),
    });
  }
  const claudeRoot = firstExisting(["/Applications/Claude.app", posix.join(userHome, "Applications", "Claude.app")], exists);
  if (claudeRoot) {
    apps.push({
      id: "desktop:claude",
      name: "Claude Desktop",
      provider: "anthropic",
      launchUrl: "claude://code/new",
      runtimeDefinitionId: "cli:claude-code",
    });
  }
  return apps;
}

function linuxApps(options) {
  const exists = options.exists || existsSync;
  const userHome = options.home || homedir();
  const appDirectories = ["/usr/share/applications", posix.join(userHome, ".local", "share", "applications")];
  const apps = [];
  if (firstExisting(appDirectories.flatMap((root) => [posix.join(root, "codex.desktop"), posix.join(root, "openai-codex.desktop")]), exists)) {
    apps.push({ id: "desktop:codex", name: "Codex Desktop", provider: "openai", launchUrl: "codex://", runtimeDefinitionId: "cli:codex" });
  }
  if (firstExisting(appDirectories.flatMap((root) => [posix.join(root, "claude.desktop"), posix.join(root, "claude-desktop.desktop")]), exists)) {
    apps.push({ id: "desktop:claude", name: "Claude Desktop", provider: "anthropic", launchUrl: "claude://code/new", runtimeDefinitionId: "cli:claude-code" });
  }
  return apps;
}

export function discoverDesktopApps(options = {}) {
  const platform = options.platform || process.platform;
  if (platform === "win32") return windowsApps(options);
  if (platform === "darwin") return macApps(options);
  if (platform === "linux") return linuxApps(options);
  return [];
}

export function publicDesktopApps(apps, routes = []) {
  return (Array.isArray(apps) ? apps : []).map((app) => {
    const runtime = routes.find((route) => (
      route.id === app.runtimeDefinitionId && route.status === "ready" && route.enabled !== false
    ));
    return {
      id: app.id,
      name: app.name,
      provider: app.provider,
      ...(app.version ? { version: app.version } : {}),
      ...(app.launchUrl ? { launchUrl: app.launchUrl } : {}),
      status: runtime ? "ready" : "installed",
      execution: runtime ? "runtime" : "launch-only",
      ...(runtime ? { runtimeRouteId: runtime.id } : {}),
    };
  });
}
