import { spawn } from "node:child_process";
import { extname } from "node:path";

function argvFor(executable) {
  if (process.platform !== "win32" || extname(executable).toLowerCase() === ".exe") {
    return { command: executable, args: ["app-server", "--stdio"] };
  }
  return {
    command: process.env.ComSpec || "cmd.exe",
    args: ["/d", "/s", "/c", "call", executable, "app-server", "--stdio"],
  };
}

/** Query the authenticated Codex app-server catalog without reading credentials. */
export function discoverCodexModels(executable, options = {}) {
  return new Promise((resolve, reject) => {
    const { command, args } = argvFor(executable);
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" },
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    let stderr = "";
    let settled = false;
    const finish = (error, models = []) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill();
      if (error) reject(error);
      else resolve(models);
    };
    const send = (value) => child.stdin.write(`${JSON.stringify(value)}\n`);
    const timer = setTimeout(() => finish(new Error("Codex 模型目录请求超时。")), options.timeoutMs || 15000);
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", finish);
    child.once("exit", (code) => {
      if (!settled) finish(new Error(stderr.trim() || `Codex app-server 提前退出（${String(code)}）。`));
    });
    child.stdout.on("data", (chunk) => {
      buffer += String(chunk);
      while (buffer.includes("\n")) {
        const index = buffer.indexOf("\n");
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (!line) continue;
        let message;
        try { message = JSON.parse(line); } catch { continue; }
        if (message.id === 1 && message.result) {
          send({ method: "initialized" });
          send({ id: 2, method: "model/list", params: { includeHidden: false, limit: 100 } });
          continue;
        }
        if (message.id !== 2) continue;
        if (message.error) return finish(new Error(message.error.message || "Codex 模型目录请求失败。"));
        const rows = Array.isArray(message.result?.data) ? message.result.data : [];
        const models = [...new Set(rows
          .map((item) => typeof item?.model === "string" ? item.model.trim() : "")
          .filter(Boolean))];
        finish(undefined, models);
      }
    });
    send({
      id: 1,
      method: "initialize",
      params: {
        clientInfo: { name: "opends", title: "DeepSee", version: "0.5.0" },
        capabilities: { experimentalApi: false, requestAttestation: false },
      },
    });
  });
}
