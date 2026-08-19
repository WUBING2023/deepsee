import {chromium} from 'playwright-core';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

const executablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const source = path.resolve('styleframe/index.html');
const output = path.resolve('out/styleframe');

const browser = await chromium.launch({headless: true, executablePath});
const page = await browser.newPage({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1});
await page.goto(pathToFileURL(source).href, {waitUntil: 'load'});
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

for (const id of ['frame-brand', 'frame-product', 'frame-routing']) {
  const element = page.locator(`#${id}`);
  await element.screenshot({path: path.join(output, `${id}.png`)});
}

await browser.close();
