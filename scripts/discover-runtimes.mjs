#!/usr/bin/env node

import { fileURLToPath } from "node:url";
import { discoverDeepSeeRuntimes, resolveDeepSeePaths } from "./runtime-discovery.mjs";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const paths = resolveDeepSeePaths({ packageRoot });
const registry = await discoverDeepSeeRuntimes(paths);
const ready = registry.routes.filter((route) => route.status === "ready").length;
const unavailable = registry.routes.filter((route) => route.status === "unavailable").length;

console.log(`DeepSee discovery complete: ${registry.routes.length} route(s), ${ready} ready, ${unavailable} unavailable.`);
console.log(`Registry: ${paths.registryFile}`);
console.log("CLI version, login and Harness adapter availability were verified at startup.");
