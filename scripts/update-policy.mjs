export const DEEPSEE_PACKAGE_NAME = "@wubing2023/deepsee";
export const DEEPSEE_UPDATE_REF_URL = "https://api.github.com/repos/WUBING2023/deepsee/commits/main";
export const DEEPSEE_RELEASE_URL = "https://github.com/WUBING2023/deepsee";
export const DEFAULT_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export function validateDeepSeeSourceRef(value) {
  const ref = String(value || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(ref)) throw new Error("GitHub 更新提交 SHA 无效。");
  return ref;
}

export function deepSeeUpdateManifestUrl(sourceRef) {
  return `https://raw.githubusercontent.com/WUBING2023/deepsee/${validateDeepSeeSourceRef(sourceRef)}/package.json`;
}

export function deepSeeUpdateArchiveUrl(sourceRef) {
  return `https://github.com/WUBING2023/deepsee/archive/${validateDeepSeeSourceRef(sourceRef)}.zip`;
}

function parseIdentifier(value) {
  if (/^\d+$/.test(value)) return { numeric: true, value: Number(value) };
  return { numeric: false, value };
}

export function parseSemVer(value) {
  const match = String(value || "").trim().match(
    /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/,
  );
  if (!match) throw new Error(`无效的 DeepSee 版本号：${String(value || "空值")}`);
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
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
  return value;
}

export function updateIsStale(checkedAt, now = Date.now(), intervalMs = DEFAULT_UPDATE_CHECK_INTERVAL_MS) {
  const checked = Date.parse(checkedAt || "");
  return !Number.isFinite(checked) || now - checked >= intervalMs || now < checked;
}
