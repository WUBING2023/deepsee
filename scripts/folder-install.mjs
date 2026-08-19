import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, normalize, relative } from "node:path";

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return undefined;
  }
}

function assertSafeRelativePath(path) {
  const normalized = normalize(path);
  if (isAbsolute(normalized) || normalized === ".." || normalized.startsWith(`..\\`) || normalized.startsWith("../")) {
    throw new Error(`Unsafe package path: ${path}`);
  }
  return normalized;
}

function copyRelative(sourceRoot, targetRoot, path) {
  const safePath = assertSafeRelativePath(path);
  const source = join(sourceRoot, safePath);
  if (!existsSync(source)) throw new Error(`ZIP package is missing required file: ${path}`);
  const target = join(targetRoot, safePath);
  copyTree(source, target, path);
}

function copyTree(source, target, label) {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    throw new Error(`ZIP package contains an unsupported symbolic link: ${label}`);
  }
  if (stat.isDirectory()) {
    mkdirSync(target, { recursive: true });
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      copyTree(join(source, entry.name), join(target, entry.name), join(label, entry.name));
    }
    return;
  }
  if (!stat.isFile()) {
    throw new Error(`ZIP package contains an unsupported file type: ${label}`);
  }
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
  chmodSync(target, stat.mode);
}

function copyGlob(sourceRoot, targetRoot, pattern) {
  const match = pattern.match(/^(.*)\/\*\.([A-Za-z0-9]+)$/);
  if (!match) throw new Error(`Unsupported package file pattern: ${pattern}`);
  const [, directoryValue, extension] = match;
  const directory = assertSafeRelativePath(directoryValue);
  const sourceDirectory = join(sourceRoot, directory);
  if (!existsSync(sourceDirectory)) throw new Error(`ZIP package is missing required directory: ${directory}`);
  const files = readdirSync(sourceDirectory).filter((name) => name.endsWith(`.${extension}`));
  if (files.length === 0) throw new Error(`ZIP package contains no ${pattern} files`);
  for (const file of files) copyRelative(sourceRoot, targetRoot, join(directory, file));
}

function isCompleteStage(target, manifest) {
  const stagedManifest = readJson(join(target, "package.json"));
  return stagedManifest?.name === manifest.name
    && stagedManifest?.version === manifest.version
    && Object.keys(manifest.deepsee?.runtimeDependencies ?? {}).every(
      (name) => stagedManifest?.dependencies?.[name] === manifest.deepsee.runtimeDependencies[name],
    )
    && existsSync(join(target, "dist", "index.js"))
    && existsSync(join(target, "scripts", "cli.mjs"))
    && existsSync(join(target, "scripts", "install-policy.mjs"));
}

export function stageFolderPackage(sourceRoot, dshHome, manifest, options = {}) {
  const packageRoot = join(dshHome, "deepsee", "packages");
  const versionDirectory = assertSafeRelativePath(manifest.version);
  const target = join(packageRoot, versionDirectory);
  const relation = relative(dshHome, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..\\`) || relation.startsWith("../") || isAbsolute(relation)) {
    throw new Error("Refusing to stage the ZIP package outside DSH_HOME.");
  }
  if (isCompleteStage(target, manifest) && !options.replace) return target;

  mkdirSync(packageRoot, { recursive: true });
  const staging = `${target}.staging-${process.pid}-${Date.now()}`;
  const backup = `${target}.backup-${process.pid}-${Date.now()}`;
  rmSync(staging, { recursive: true, force: true });
  rmSync(backup, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  try {
    copyRelative(sourceRoot, staging, "package.json");
    const stagedManifest = {
      ...manifest,
      dependencies: { ...(manifest.deepsee?.runtimeDependencies ?? {}) },
    };
    writeFileSync(join(staging, "package.json"), `${JSON.stringify(stagedManifest, null, 2)}\n`, "utf8");
    for (const entry of manifest.files ?? []) {
      if (/\/\*\.[A-Za-z0-9]+$/.test(entry)) copyGlob(sourceRoot, staging, entry);
      else copyRelative(sourceRoot, staging, entry);
    }
    if (!isCompleteStage(staging, manifest)) {
      throw new Error("The extracted ZIP does not contain a complete prebuilt DeepSee package.");
    }
    if (existsSync(target)) renameSync(target, backup);
    try {
      renameSync(staging, target);
    } catch (error) {
      if (!existsSync(target) && existsSync(backup)) renameSync(backup, target);
      throw error;
    }
    rmSync(backup, { recursive: true, force: true });
  } finally {
    rmSync(staging, { recursive: true, force: true });
    if (existsSync(target)) rmSync(backup, { recursive: true, force: true });
  }

  return target;
}
