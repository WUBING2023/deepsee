#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const envPath = join(root, ".env");
const presets = {
  kimi: {
    label: "Kimi",
    api: "openai-completions",
    baseURL: "https://api.moonshot.cn/v1",
    model: "kimi-k3",
  },
  openai: {
    label: "OpenAI",
    api: "openai-responses",
    baseURL: "https://api.openai.com/v1",
    model: "gpt-5",
  },
  claude: {
    label: "Claude",
    api: "anthropic-messages",
    baseURL: "https://api.anthropic.com",
    model: "claude-sonnet-4-5",
  },
  custom: {
    label: "OpenAI-compatible API",
    api: "openai-completions",
    baseURL: "http://127.0.0.1:8000/v1",
    model: "vision-model",
  },
};

function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || line.trimStart().startsWith("#")) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[match[1]] = value;
  }
  return values;
}

function formatValue(value) {
  return /^[A-Za-z0-9_./:+-]*$/.test(value) ? value : JSON.stringify(value);
}

function updateEnv(text, values) {
  const pending = new Map(Object.entries(values));
  const output = [];
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
    if (!match || !pending.has(match[1])) {
      output.push(line);
      continue;
    }
    output.push(`${match[1]}=${formatValue(pending.get(match[1]))}`);
    pending.delete(match[1]);
  }
  while (output.length > 0 && output.at(-1) === "") output.pop();
  if (pending.size > 0 && output.length > 0) output.push("");
  for (const [key, value] of pending) output.push(`${key}=${formatValue(value)}`);
  return `${output.join("\n")}\n`;
}

async function ask(rl, label, defaultValue) {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  return (await rl.question(`${label}${suffix}: `)).trim() || defaultValue;
}

async function askBoolean(rl, label, defaultValue) {
  const answer = (await rl.question(`${label} [${defaultValue ? "Y/n" : "y/N"}]: `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return answer === "y" || answer === "yes" || answer === "1";
}

async function readSecret(label) {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("API key requires an interactive terminal. You can also set OPENDS_BRIDGE_API_KEY in .env.");
  }
  return await new Promise((resolve, reject) => {
    const input = process.stdin;
    const previousRaw = input.isRaw;
    let value = "";
    const cleanup = () => {
      input.off("data", onData);
      input.setRawMode(Boolean(previousRaw));
      input.pause();
    };
    const finish = () => {
      cleanup();
      process.stdout.write("\n");
      resolve(value);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Setup cancelled."));
          return;
        }
        if (character === "\r" || character === "\n") {
          finish();
          return;
        }
        if (character === "\u007f" || character === "\b") {
          if (value.length > 0) {
            value = value.slice(0, -1);
            process.stdout.write("\b \b");
          }
          continue;
        }
        if (character >= " " && character !== "\u001b") {
          value += character;
          process.stdout.write("*");
        }
      }
    };
    process.stdout.write(`${label}: `);
    input.setEncoding("utf8");
    input.setRawMode(true);
    input.resume();
    input.on("data", onData);
  });
}

const existingText = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
const existing = parseEnv(existingText);
const vendorNames = Object.keys(presets);
const currentVendor = vendorNames.includes(existing.OPENDS_BRIDGE_VENDOR) ? existing.OPENDS_BRIDGE_VENDOR : "kimi";
const defaultChoice = vendorNames.indexOf(currentVendor) + 1;
const rl = createInterface({ input: process.stdin, output: process.stdout });

console.log("DeepSee Bridge setup");
console.log("1. Kimi  2. OpenAI  3. Claude  4. OpenAI-compatible API");
const choiceText = await ask(rl, "Choose provider", String(defaultChoice));
const choice = Number.parseInt(choiceText, 10);
const vendor = vendorNames[Number.isInteger(choice) && choice >= 1 && choice <= 4 ? choice - 1 : defaultChoice - 1];
const preset = presets[vendor];
const api = vendor === "custom"
  ? await ask(rl, "Protocol (openai-completions/openai-responses/anthropic-messages)", existing.OPENDS_BRIDGE_API || preset.api)
  : preset.api;
const baseURL = await ask(rl, "API base URL", existing.OPENDS_BRIDGE_VENDOR === vendor ? existing.OPENDS_BRIDGE_BASE_URL || preset.baseURL : preset.baseURL);
const model = await ask(rl, "Vision model", existing.OPENDS_BRIDGE_VENDOR === vendor ? existing.OPENDS_BRIDGE_MODEL || preset.model : preset.model);
const supportedApis = new Set(["openai-completions", "openai-responses", "anthropic-messages"]);
if (!supportedApis.has(api)) {
  rl.close();
  throw new Error(`Unsupported protocol: ${api}`);
}
let parsedBaseURL;
try {
  parsedBaseURL = new URL(baseURL);
} catch {
  rl.close();
  throw new Error(`Invalid API base URL: ${baseURL}`);
}
if (!new Set(["http:", "https:"]).has(parsedBaseURL.protocol)) {
  rl.close();
  throw new Error(`API base URL must use http or https: ${baseURL}`);
}
if (!model.trim()) {
  rl.close();
  throw new Error("Vision model cannot be empty.");
}
const autoVision = await askBoolean(rl, "Automatically describe images for DeepSeek", existing.OPENDS_BRIDGE_AUTO_VISION !== "0");
const textTool = await askBoolean(rl, "Enable optional ask_external_model text tool", existing.OPENDS_BRIDGE_TEXT_TOOL === "1");
const sameVendor = existing.OPENDS_BRIDGE_VENDOR === vendor;
const keepKey = existing.OPENDS_BRIDGE_API_KEY
  ? await askBoolean(rl, sameVendor ? "Keep the existing API key" : "Reuse the previous provider's API key", sameVendor)
  : false;
rl.close();

const enteredApiKey = keepKey ? existing.OPENDS_BRIDGE_API_KEY : await readSecret("API key (input hidden; Enter is allowed only for a keyless custom API)");
if (!enteredApiKey && vendor !== "custom") {
  throw new Error(`${preset.label} requires an API key. Run setup again when the key is available.`);
}
const apiKey = enteredApiKey || "local-no-key";
const values = {
  OPENDS_BRIDGE_VENDOR: vendor,
  OPENDS_BRIDGE_API: api,
  OPENDS_BRIDGE_BASE_URL: baseURL,
  OPENDS_BRIDGE_MODEL: model,
  OPENDS_BRIDGE_API_KEY: apiKey,
  OPENDS_BRIDGE_AUTO_VISION: autoVision ? "1" : "0",
  OPENDS_BRIDGE_TEXT_TOOL: textTool ? "1" : "0",
  OPENDS_BRIDGE_MAX_TOKENS: existing.OPENDS_BRIDGE_MAX_TOKENS || "4096",
  OPENDS_BRIDGE_VISION_CACHE: existing.OPENDS_BRIDGE_VISION_CACHE || "128",
};
writeFileSync(envPath, updateEnv(existingText, values), "utf8");

console.log(`Configured: ${preset.label} / ${model}`);
console.log(`Automatic vision: ${autoVision ? "on" : "off"}`);
console.log(`Text tool: ${textTool ? "on" : "off"}`);
console.log(`Credentials: ${enteredApiKey ? "configured" : "keyless custom API"}`);
console.log(`Saved locally: ${envPath}`);
console.log("Next: pnpm run test:connection, then pnpm run install:plugin if this is the first setup.");
console.log("Restart a running Harness process so the new configuration takes effect.");
