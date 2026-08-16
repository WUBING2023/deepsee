const locale = document.body.dataset.locale || "en";
const text = locale === "zh-CN"
  ? { copy: "复制", copied: "已复制", failed: "复制失败", unavailable: "发布清单暂不可用" }
  : { copy: "Copy", copied: "Copied", failed: "Copy failed", unavailable: "Release manifest unavailable" };

const storedLocale = localStorage.getItem("deepsee-locale");
if (location.pathname === "/" && storedLocale === "zh-CN") {
  location.replace("/zh-CN/");
} else if (location.pathname === "/" && !storedLocale && navigator.language?.toLowerCase().startsWith("zh")) {
  location.replace("/zh-CN/");
}

for (const link of document.querySelectorAll("[data-locale-choice]")) {
  link.addEventListener("click", () => localStorage.setItem("deepsee-locale", link.dataset.localeChoice));
}

function setText(selector, value) {
  for (const element of document.querySelectorAll(selector)) element.textContent = value;
}

function setHref(selector, value) {
  for (const element of document.querySelectorAll(selector)) {
    element.href = value;
    element.removeAttribute("aria-disabled");
    element.classList.remove("is-loading");
  }
}

function formatBytes(value) {
  if (!Number.isFinite(value)) return "—";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(value < 1024 * 100 ? 1 : 0)} KB`;
}

async function loadRelease() {
  try {
    const response = await fetch("/version.json", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const release = await response.json();
    setText("[data-version]", `v${release.version}`);
    setText("[data-asset-name]", release.assetName || "—");
    setText("[data-asset-size]", formatBytes(release.sizeBytes));
    setText("[data-sha256]", release.sha256 || "—");
    if (release.installCommand) setText("[data-install-command]", release.installCommand);
    setHref("[data-download]", release.downloadUrl);
    setHref("[data-release-link]", release.releaseUrl);
    setHref("[data-checksum-link]", release.sha256Url);
  } catch (error) {
    setText("[data-version]", text.unavailable);
    for (const link of document.querySelectorAll("[data-download]")) {
      link.classList.remove("is-loading");
      link.setAttribute("aria-disabled", "true");
    }
  }
}

async function copyInstall(button) {
  const command = document.querySelector("[data-install-command]")?.textContent?.trim();
  if (!command) return;
  const label = button.querySelector("[data-copy-label]");
  try {
    await navigator.clipboard.writeText(command);
    if (label) label.textContent = text.copied;
  } catch (error) {
    if (label) label.textContent = text.failed;
  }
  window.setTimeout(() => { if (label) label.textContent = text.copy; }, 1800);
}

for (const button of document.querySelectorAll("[data-copy-install]")) {
  button.addEventListener("click", () => copyInstall(button));
}

loadRelease();
