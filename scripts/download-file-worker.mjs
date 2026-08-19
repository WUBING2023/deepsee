#!/usr/bin/env node

import { createWriteStream, rmSync } from "node:fs";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";

const [url, target] = process.argv.slice(2);
if (!url || !target) process.exit(2);

const download = (currentUrl, redirects = 0) => new Promise((resolve, reject) => {
  if (redirects > 8) return reject(new Error("下载重定向次数过多。"));
  const parsed = new URL(currentUrl);
  const get = parsed.protocol === "https:" ? httpsGet : parsed.protocol === "http:" ? httpGet : undefined;
  if (!get) return reject(new Error(`不支持的下载协议：${parsed.protocol}`));
  const request = get(parsed, {
    headers: {
      Accept: "application/octet-stream, application/vnd.github+json, application/json;q=0.9, */*;q=0.8",
      "User-Agent": "DeepSee-OCR-Installer",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  }, (response) => {
    const status = response.statusCode || 0;
    if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
      response.resume();
      download(new URL(response.headers.location, parsed).href, redirects + 1).then(resolve, reject);
      return;
    }
    if (status < 200 || status >= 300) {
      response.resume();
      reject(new Error(`服务器返回 HTTP ${status}。`));
      return;
    }
    const output = createWriteStream(target, { flags: "w" });
    response.pipe(output);
    output.on("finish", () => output.close(resolve));
    output.on("error", reject);
    response.on("error", reject);
  });
  request.setTimeout(60_000, () => request.destroy(new Error("下载连接超时。")));
  request.on("error", reject);
});

try {
  rmSync(target, { force: true });
  await download(url);
} catch (error) {
  rmSync(target, { force: true });
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
