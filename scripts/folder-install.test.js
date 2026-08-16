import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { stageFolderPackage } from "./folder-install.mjs";

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function createPackage() {
  const root = mkdtempSync(join(tmpdir(), "deepsee-folder-source-"));
  temporaryRoots.push(root);
  const manifest = {
    name: "@wubing2023/deepsee",
    version: "0.6.0-test.1",
    files: ["dist", "scripts/*.mjs", "scripts/*.py", "README.md"],
  };
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  writeFileSync(join(root, "dist", "index.js"), "export {};\n");
  writeFileSync(join(root, "scripts", "cli.mjs"), "#!/usr/bin/env node\n");
  writeFileSync(join(root, "scripts", "install-policy.mjs"), "export {};\n");
  writeFileSync(join(root, "scripts", "ocr-runner.py"), "print('ok')\n");
  writeFileSync(join(root, "README.md"), "# DeepSee\n");
  return { root, manifest };
}

describe("extracted ZIP staging", () => {
  it("copies a complete prebuilt package into durable DSH_HOME storage", () => {
    const source = createPackage();
    const dshHome = mkdtempSync(join(tmpdir(), "deepsee-folder-home-"));
    temporaryRoots.push(dshHome);

    const target = stageFolderPackage(source.root, dshHome, source.manifest);

    expect(relative(dshHome, target)).toBe(join("deepsee", "packages", source.manifest.version));
    expect(existsSync(join(target, "dist", "index.js"))).toBe(true);
    expect(existsSync(join(target, "scripts", "cli.mjs"))).toBe(true);
    expect(existsSync(join(target, "scripts", "ocr-runner.py"))).toBe(true);
    expect(JSON.parse(readFileSync(join(target, "package.json"), "utf8"))).toMatchObject({
      name: source.manifest.name,
      version: source.manifest.version,
    });

    rmSync(source.root, { recursive: true, force: true });
    expect(existsSync(join(target, "dist", "index.js"))).toBe(true);
  });

  it("reuses a complete staged copy and rejects incomplete ZIP content", () => {
    const source = createPackage();
    const dshHome = mkdtempSync(join(tmpdir(), "deepsee-folder-home-"));
    temporaryRoots.push(dshHome);
    const target = stageFolderPackage(source.root, dshHome, source.manifest);
    writeFileSync(join(target, "stage-marker.txt"), "keep");
    expect(stageFolderPackage(source.root, dshHome, source.manifest)).toBe(target);
    expect(existsSync(join(target, "stage-marker.txt"))).toBe(true);

    rmSync(join(source.root, "dist", "index.js"));
    const nextManifest = { ...source.manifest, version: "0.6.0-test.2" };
    writeFileSync(join(source.root, "package.json"), JSON.stringify(nextManifest));
    expect(() => stageFolderPackage(source.root, dshHome, nextManifest)).toThrow("complete prebuilt DeepSee package");
  });

  it("refuses a manifest version that could escape DSH_HOME", () => {
    const source = createPackage();
    const dshHome = mkdtempSync(join(tmpdir(), "deepsee-folder-home-"));
    temporaryRoots.push(dshHome);
    expect(() => stageFolderPackage(source.root, dshHome, {
      ...source.manifest,
      version: "../../../outside",
    })).toThrow("Unsafe package path");
  });
});
