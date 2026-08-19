#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const scratch = mkdtempSync(join(tmpdir(), "deepsee-harness-web-smoke-"));
const dshHome = join(scratch, ".dsh");
const cli = join(root, "scripts", "cli.mjs");
const env = {
  ...process.env,
  DSH_HOME: dshHome,
  NO_UPDATE_NOTIFIER: "1",
  npm_config_update_notifier: "false",
};

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : undefined;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

function waitForExit(child) {
  return new Promise((resolve) => child.once("exit", resolve));
}

async function waitForDeepSee(port, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Harness Web exited before readiness (code ${child.exitCode}).`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/deepsee/v1/models`, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) return response;
      lastError = new Error(`DeepSee endpoint returned HTTP ${response.status}.`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Harness Web did not expose /api/deepsee/v1/models within ${timeoutMs}ms: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

let web;
try {
  const installed = spawnSync(process.execPath, [
    cli,
    "install",
    "--from-folder",
    "--profile",
    "web",
    "--timeout-ms",
    "900000",
    "--retries",
    "1",
  ], {
    cwd: root,
    env,
    stdio: "inherit",
    timeout: 1_000_000,
    windowsHide: true,
  });
  if (installed.error) throw installed.error;
  if (installed.status !== 0) throw new Error(`Clean Web profile installation failed with code ${installed.status}.`);

  const port = await freePort();
  web = spawn(process.execPath, [cli, "web", "--port", String(port)], {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  web.stdout.pipe(process.stdout);
  web.stderr.pipe(process.stderr);
  await waitForDeepSee(port, web);
  console.log(JSON.stringify({ ok: true, port, endpoint: "/api/deepsee/v1/models" }, null, 2));
} finally {
  if (web && web.exitCode === null) {
    web.kill();
    await Promise.race([
      waitForExit(web),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    if (web.exitCode === null) web.kill("SIGKILL");
  }
  rmSync(scratch, { recursive: true, force: true });
}
