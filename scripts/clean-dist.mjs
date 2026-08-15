import { existsSync, rmSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = join(root, "dist");
if (relative(root, dist) !== "dist") {
  throw new Error(`refusing to clean unexpected path: ${dist}`);
}
if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });
