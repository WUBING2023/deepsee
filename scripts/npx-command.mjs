import { existsSync } from "node:fs";
import { posix, win32 } from "node:path";

export function resolveNpxInvocation(args, options = {}) {
  const platform = options.platform ?? process.platform;
  const execPath = options.execPath ?? process.execPath;
  const npmExecPath = options.npmExecPath ?? process.env.npm_execpath;
  const pathExists = options.existsSync ?? existsSync;
  const paths = platform === "win32" ? win32 : posix;
  const candidates = [
    npmExecPath ? paths.join(paths.dirname(npmExecPath), "npx-cli.js") : "",
    paths.join(paths.dirname(execPath), "node_modules", "npm", "bin", "npx-cli.js"),
  ].filter(Boolean);
  const npxCli = candidates.find((candidate) => pathExists(candidate));
  if (npxCli) {
    return { command: execPath, args: [npxCli, ...args] };
  }
  if (platform === "win32") {
    return {
      command: options.comSpec ?? process.env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", "call", "npx.cmd", ...args],
    };
  }
  return { command: "npx", args };
}
