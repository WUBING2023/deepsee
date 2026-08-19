import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const roots = [];
afterEach(() => {
  while (roots.length) rmSync(roots.pop(), { recursive: true, force: true });
});

describe("DeepSee Node download worker", () => {
  it("follows redirects and persists the complete response", async () => {
    const server = createServer((request, response) => {
      if (request.url === "/start") {
        response.writeHead(302, { Location: "/asset" });
        response.end();
        return;
      }
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      response.end("deepsee-download-ok");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const root = mkdtempSync(join(tmpdir(), "deepsee-node-download-"));
    roots.push(root);
    const target = join(root, "asset.bin");
    const worker = fileURLToPath(new URL("./download-file-worker.mjs", import.meta.url));
    try {
      const result = await new Promise((resolve) => {
        const child = spawn(process.execPath, [worker, `http://127.0.0.1:${address.port}/start`, target], {
          windowsHide: true,
          stdio: "ignore",
        });
        child.on("exit", (code) => resolve(code));
      });
      expect(result).toBe(0);
      expect(readFileSync(target, "utf8")).toBe("deepsee-download-ok");
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
