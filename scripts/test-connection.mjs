#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const healthPath = join(root, ".opends-bridge-health.json");
const TEST_PROMPT = "Confirm that an image is attached. Reply only OK.";

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createTestPngBase64() {
  const width = 32;
  const height = 32;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 3;
      row.set([220, 40, 40], offset);
    }
    rows.push(row);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]).toString("base64");
}

function loadDotEnv() {
  const path = join(root, ".env");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith("#")) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] ??= value;
  }
}

function endpoint(baseURL, suffix) {
  const base = baseURL.replace(/\/+$/, "");
  return base.endsWith("/v1") ? `${base}/${suffix}` : `${base}/v1/${suffix}`;
}

function redact(text, secret) {
  return secret ? text.split(secret).join("[REDACTED]") : text;
}

function reasonForStatus(status, providerDetail = "") {
  if (status === 401 || status === 403) return "invalid_credentials";
  if (status === 402 || /quota|balance|recharge/i.test(providerDetail)) return "insufficient_quota";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "provider_unavailable";
  return "request_rejected";
}

let healthWritten = false;
let healthConfig;
function writeHealth(result) {
  if (!healthConfig) return;
  writeFileSync(healthPath, `${JSON.stringify({
    testedAt: new Date().toISOString(),
    ...healthConfig,
    ...result,
  }, null, 2)}\n`, "utf8");
  healthWritten = true;
}

async function main() {
  loadDotEnv();
  const api = process.env.OPENDS_BRIDGE_API ?? "openai-completions";
  const baseURL = process.env.OPENDS_BRIDGE_BASE_URL ?? "https://api.moonshot.cn/v1";
  const model = process.env.OPENDS_BRIDGE_MODEL ?? "kimi-k3";
  const apiKey = process.env.OPENDS_BRIDGE_API_KEY ?? "";
  healthConfig = {
    provider: process.env.OPENDS_BRIDGE_VENDOR ?? "external",
    api,
    baseURL,
    model,
  };
  if (!apiKey) {
    writeHealth({ ok: false, reason: "missing_credentials" });
    throw new Error("No external API key is configured. Run `pnpm run setup` first.");
  }
  const testPngBase64 = createTestPngBase64();
  const dataURL = `data:image/png;base64,${testPngBase64}`;
  let url;
  let headers = { "content-type": "application/json" };
  let body;

  if (api === "anthropic-messages") {
    url = endpoint(baseURL, "messages");
    headers = { ...headers, "x-api-key": apiKey, "anthropic-version": "2023-06-01" };
    body = {
      model,
      max_tokens: 16,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: testPngBase64 } },
          { type: "text", text: TEST_PROMPT },
        ],
      }],
    };
  } else if (api === "openai-responses") {
    url = endpoint(baseURL, "responses");
    headers = { ...headers, authorization: `Bearer ${apiKey}` };
    body = {
      model,
      max_output_tokens: 32,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: TEST_PROMPT },
          { type: "input_image", image_url: dataURL },
        ],
      }],
    };
  } else if (api === "openai-completions") {
    url = endpoint(baseURL, "chat/completions");
    headers = { ...headers, authorization: `Bearer ${apiKey}` };
    body = {
      model,
      max_tokens: 16,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: TEST_PROMPT },
          { type: "image_url", image_url: { url: dataURL } },
        ],
      }],
    };
  } else {
    throw new Error(`Unsupported protocol: ${api}`);
  }

  console.log(`Testing vision input for ${process.env.OPENDS_BRIDGE_VENDOR ?? "external"} / ${model} (one minimal API request)...`);
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const rawDetail = (await response.text()).replace(/\s+/g, " ").slice(0, 500);
    const detail = redact(rawDetail, apiKey).slice(0, 300);
    writeHealth({ ok: false, httpStatus: response.status, reason: reasonForStatus(response.status, rawDetail) });
    throw new Error(`Vision connection failed (${response.status}): ${detail || response.statusText}`);
  }
  writeHealth({ ok: true, httpStatus: response.status, reason: "vision_request_accepted" });
  console.log("Vision connection OK. The model accepted an image; credentials were not printed.");
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!healthWritten && healthConfig) writeHealth({ ok: false, reason: "network_or_configuration_error" });
  console.error(`DeepSee Bridge connection test failed: ${message}`);
  process.exitCode = 1;
}
