import {chromium} from 'playwright-core';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {extname, join, resolve} from 'node:path';

const root = resolve('../website');
const output = resolve('public/textures');
const executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const mime = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.mp4', 'video/mp4'],
]);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith('/')) pathname += 'index.html';
    const target = resolve(join(root, pathname.replace(/^\/+/, '')));
    if (!target.startsWith(root)) throw new Error('outside website root');
    const body = await readFile(target);
    response.writeHead(200, {'content-type': mime.get(extname(target)) ?? 'application/octet-stream'});
    response.end(body);
  } catch {
    response.writeHead(404, {'content-type': 'text/plain'});
    response.end('Not found');
  }
});

await new Promise((done) => server.listen(4179, '127.0.0.1', done));
await mkdir(join(output, 'elements'), {recursive: true});

const browser = await chromium.launch({headless: true, executablePath});
const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 2});
await page.goto('http://127.0.0.1:4179/', {waitUntil: 'networkidle'});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

await page.screenshot({path: join(output, 'website-full.png'), fullPage: true});

const selectors = {
  hero: '.hero',
  install: '.install-box',
  interface: '.screenshot-shell',
  features: '.feature-grid',
  demo: '.demo-stage',
  release: '.release-panel',
};
const layout = {viewport: {width: 1920, height: 1080, deviceScaleFactor: 2}, pageH: await page.evaluate(() => document.documentElement.scrollHeight), elements: {}};

for (const [name, selector] of Object.entries(selectors)) {
  const element = page.locator(selector).first();
  const box = await element.boundingBox();
  if (!box) continue;
  layout.elements[name] = {x: box.x, y: box.y, w: box.width, h: box.height};
  await element.screenshot({path: join(output, 'elements', `${name}.png`)});
}

await writeFile(join(output, 'layout.json'), JSON.stringify(layout, null, 2));
await browser.close();
await new Promise((done) => server.close(done));
