import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const failures = [];
const read = (path) => readFileSync(join(root, path), "utf8");

for (const removed of ["scripts/setup.mjs", "scripts/test-connection.mjs", "host/bridge.patch.yml"]) {
  if (existsSync(join(root, removed))) failures.push(`${removed} must not ship`);
}
const example = read(".env.example");
for (const forbidden of ["DEEPSEEK_API_KEY=", "OPENDS_BRIDGE_API_KEY=", "OPENDS_BRIDGE_VENDOR="]) {
  if (example.includes(forbidden)) failures.push(`.env.example contains forbidden credential setting ${forbidden}`);
}
const admin = read("host/admin-server.mjs");
if (!admin.includes('error: "native_harness_credentials_required"')) failures.push("raw-key model endpoint is not disabled");
const connections = read("scripts/model-connections.mjs");
for (const forbidden of ["export function addConnection", "export function saveConnections", "env[connection.apiKeyEnv]"]) {
  if (connections.includes(forbidden)) failures.push(`legacy credential writer remains: ${forbidden}`);
}
const manifest = JSON.parse(read("package.json"));
if (manifest.scripts?.setup || manifest.scripts?.["test:connection"]) failures.push("legacy credential commands remain in package scripts");
if (manifest.deepsee?.pluginGroup?.installMode !== "atomic") failures.push("atomic plugin-group contract is missing");

if (failures.length > 0) throw new Error(`DeepSee security contract failed:\n- ${failures.join("\n- ")}`);
console.log("DeepSee security contract passed: native Harness owns provider credentials and no raw-key writer ships.");
