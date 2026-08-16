export const DEEPSEE_PACKAGE_NAME = "@wubing2023/deepsee";
export const DEEPSEE_UPDATE_PROTOCOL = 1;
export const DEEPSEE_UPDATE_REF_URL = "https://api.github.com/repos/WUBING2023/deepsee/commits/main";
export const DEEPSEE_UPDATE_ATOM_URL = "https://github.com/WUBING2023/deepsee/commits/main.atom";
export const DEEPSEE_RELEASE_URL = "https://github.com/WUBING2023/deepsee";
export const DEFAULT_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_UPDATE_ERROR_RETRY_MS = 15 * 60 * 1000;

export function validateDeepSeeSourceRef(value) {
  const ref = String(value || "").trim().toLowerCase();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(ref)) throw new Error("GitHub 更新提交 SHA 无效。");
  return ref;
}

export function parseDeepSeeAtomSourceRef(value) {
  const match = String(value || "").match(
    /<entry\b[\s\S]*?<id>\s*tag:github\.com,\d+:Grit::Commit\/([a-f0-9]{40}|[a-f0-9]{64})\s*<\/id>/i,
  );
  if (!match) throw new Error("GitHub 提交订阅未包含有效的最新 commit SHA。");
  return validateDeepSeeSourceRef(match[1]);
}

export function deepSeeUpdateManifestUrl(sourceRef) {
  return `https://raw.githubusercontent.com/WUBING2023/deepsee/${validateDeepSeeSourceRef(sourceRef)}/package.json`;
}

export function deepSeeUpdateArchiveUrl(sourceRef) {
  return `https://github.com/WUBING2023/deepsee/archive/${validateDeepSeeSourceRef(sourceRef)}.zip`;
}

function parseIdentifier(value) {
  if (/^\d+$/.test(value)) {
    if (value.length > 1 && value.startsWith("0")) throw new Error(`无效的 SemVer 数字标识：${value}`);
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric)) throw new Error(`SemVer 数字标识过大：${value}`);
    return { numeric: true, value: numeric };
  }
  return { numeric: false, value };
}

function parseCoreNumber(value) {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric)) throw new Error(`SemVer 核心版本数字过大：${value}`);
  return numeric;
}

export function parseSemVer(value) {
  const match = String(value || "").trim().match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  if (!match) throw new Error(`无效的 DeepSee 版本号：${String(value || "空值")}`);
  return {
    major: parseCoreNumber(match[1]),
    minor: parseCoreNumber(match[2]),
    patch: parseCoreNumber(match[3]),
    prerelease: match[4] ? match[4].split(".").map(parseIdentifier) : [],
  };
}

export function compareSemVer(leftValue, rightValue) {
  const left = parseSemVer(leftValue);
  const right = parseSemVer(rightValue);
  for (const field of ["major", "minor", "patch"]) {
    if (left[field] !== right[field]) return left[field] > right[field] ? 1 : -1;
  }
  if (left.prerelease.length === 0 && right.prerelease.length === 0) return 0;
  if (left.prerelease.length === 0) return 1;
  if (right.prerelease.length === 0) return -1;
  const length = Math.max(left.prerelease.length, right.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = left.prerelease[index];
    const rightPart = right.prerelease[index];
    if (!leftPart) return -1;
    if (!rightPart) return 1;
    if (leftPart.numeric && rightPart.numeric && leftPart.value !== rightPart.value) {
      return leftPart.value > rightPart.value ? 1 : -1;
    }
    if (leftPart.numeric !== rightPart.numeric) return leftPart.numeric ? -1 : 1;
    if (leftPart.value !== rightPart.value) return leftPart.value > rightPart.value ? 1 : -1;
  }
  return 0;
}

export function validateDeepSeeManifest(value) {
  if (!value || typeof value !== "object") throw new Error("更新清单不是有效对象。");
  if (value.name !== DEEPSEE_PACKAGE_NAME) throw new Error("更新清单的包身份不匹配。");
  parseSemVer(value.version);
  if (value.deepsee?.installSpec !== "github:WUBING2023/deepsee#main") {
    throw new Error("更新清单的官方安装来源不匹配。");
  }
  if (typeof value.main !== "string" || value.main !== "./dist/index.js") {
    throw new Error("更新清单缺少预构建 DeepSee Host。");
  }
  const update = value.deepsee?.update;
  if (update !== undefined) {
    if (!update || typeof update !== "object") throw new Error("更新协议清单无效。");
    if (!Number.isSafeInteger(update.protocol) || update.protocol < 1) {
      throw new Error("更新协议版本无效。");
    }
    if (update.minimumUpdaterVersion !== undefined) parseSemVer(update.minimumUpdaterVersion);
  }
  return value;
}

export function assessDeepSeeUpdateCompatibility(currentVersion, manifest) {
  const update = manifest.deepsee?.update;
  const protocol = update?.protocol ?? 1;
  if (protocol > DEEPSEE_UPDATE_PROTOCOL) {
    return {
      compatible: false,
      reason: `此版本使用更新协议 ${protocol}，当前更新器仅支持协议 ${DEEPSEE_UPDATE_PROTOCOL}。`,
    };
  }
  if (update?.minimumUpdaterVersion && compareSemVer(currentVersion, update.minimumUpdaterVersion) < 0) {
    return {
      compatible: false,
      reason: `此版本要求 DeepSee 更新器至少为 ${update.minimumUpdaterVersion}。`,
    };
  }
  return { compatible: true };
}

export function updateIsStale(checkedAt, now = Date.now(), intervalMs = DEFAULT_UPDATE_CHECK_INTERVAL_MS) {
  const checked = Date.parse(checkedAt || "");
  return !Number.isFinite(checked) || now - checked >= intervalMs || now < checked;
}
