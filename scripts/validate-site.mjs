#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const contract = JSON.parse(readFileSync(join(root, "product-release.json"), "utf8"));
const websiteRoot = resolve(root, contract.website.directory);
const productionUrl = contract.website.productionUrl.replace(/\/$/, "");

const pages = [
  { path: "index.html", lang: "en", canonical: `${productionUrl}/` },
  { path: "zh-CN/index.html", lang: "zh-CN", canonical: `${productionUrl}/zh-CN/` },
];
const requiredFiles = [
  "assets/styles.css",
  "assets/site.js",
  "assets/deepsee-mark.svg",
  "assets/deepsee-panel.svg",
  "assets/deepsee-panel.png",
  "assets/deepsee-demo-en.mp4",
  "assets/deepsee-demo-en-nobgm.mp4",
  "assets/deepsee-demo-en-poster.png",
  "assets/deepsee-demo-zh.mp4",
  "assets/deepsee-demo-zh-nobgm.mp4",
  "assets/deepsee-demo-zh-poster.png",
  "version.json",
  "_headers",
  "_redirects",
  "robots.txt",
  "sitemap.xml",
  "404.html",
];

for (const path of requiredFiles) {
  if (!existsSync(join(websiteRoot, path))) throw new Error(`Website file is missing: ${path}`);
}

for (const page of pages) {
  const htmlPath = join(websiteRoot, page.path);
  const html = readFileSync(htmlPath, "utf8");
  if (!html.includes(`<html lang="${page.lang}">`)) throw new Error(`${page.path} has the wrong language.`);
  if (!html.includes(`<link rel="canonical" href="${page.canonical}">`)) throw new Error(`${page.path} has the wrong canonical URL.`);
  if (!html.includes(`hreflang="en" href="${productionUrl}/"`)) throw new Error(`${page.path} is missing English hreflang.`);
  if (!html.includes(`hreflang="zh-CN" href="${productionUrl}/zh-CN/"`)) throw new Error(`${page.path} is missing Chinese hreflang.`);
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html) || /<style\b/i.test(html)) throw new Error(`${page.path} contains inline script or style.`);
  for (const marker of ["data-download", "data-version", "data-sha256", "data-copy-install"]) {
    if (!html.includes(marker)) throw new Error(`${page.path} is missing ${marker}.`);
  }
  if (!html.includes('<section class="section demo-section" id="demo"')) throw new Error(`${page.path} is missing the product demo.`);
  if (!html.includes("-nobgm.mp4")) throw new Error(`${page.path} is missing the no-BGM demo delivery.`);
}

const manifestPath = join(root, contract.website.manifestPath);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.version !== contract.product.version) throw new Error("Website and release-contract versions disagree.");
for (const field of ["downloadUrl", "releaseUrl", "sha256Url"]) {
  const url = new URL(manifest[field]);
  if (url.protocol !== "https:" || url.hostname !== "github.com") throw new Error(`Website manifest has an untrusted ${field}.`);
}

const headers = readFileSync(join(websiteRoot, "_headers"), "utf8");
for (const directive of ["Content-Security-Policy", "frame-ancestors 'none'", "X-Content-Type-Options", "Permissions-Policy"]) {
  if (!headers.includes(directive)) throw new Error(`Website headers are missing ${directive}.`);
}

const publicText = pages.map((page) => readFileSync(join(websiteRoot, page.path), "utf8")).join("\n");
if (/localhost|127\.0\.0\.1|sk-[A-Za-z0-9_-]{20,}|[A-Z]:\\Users\\/i.test(publicText)) {
  throw new Error("Website contains local-only or secret-like content.");
}

console.log(JSON.stringify({ ok: true, pages: pages.map((page) => page.path), manifest: contract.website.manifestPath }, null, 2));
