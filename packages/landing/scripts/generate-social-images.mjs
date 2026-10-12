/**
 * Generates public/og.png (1200x630) and public/apple-touch-icon.png (180x180) from assets already
 * in public/: the logo, the VT323 font and the office still. Run it by hand when they change:
 *   node packages/landing/scripts/generate-social-images.mjs
 * It borrows Playwright (and its installed Chromium) from the e2e package, so it adds no dependency.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../public');
const { chromium } = createRequire(resolve(here, '../../../e2e/package.json'))('@playwright/test');

const dataUri = (file, mime) =>
  `data:${mime};base64,${readFileSync(resolve(pub, file)).toString('base64')}`;
const logo = dataUri('favicon.svg', 'image/svg+xml');
const office = dataUri('sprites/office-static.png', 'image/png');
const font = dataUri('fonts/VT323-Regular.ttf', 'font/ttf');

const ogHtml = `<!doctype html><html><head><style>
@font-face { font-family: VT323; src: url(${font}) format('truetype'); }
* { box-sizing: border-box; margin: 0; }
body { width: 1200px; height: 630px; background: #141626; color: #eeecf6; font-family: VT323, monospace;
  display: flex; align-items: center; gap: 48px; padding: 0 64px; border: 8px solid #f0c040; }
.text { flex: 1; }
.logo { width: 120px; height: 120px; image-rendering: pixelated; margin-bottom: 24px; }
h1 { font-size: 104px; line-height: 0.95; color: #f0c040; font-weight: 400; }
p { font-size: 44px; line-height: 1.1; margin-top: 20px; color: #c9c5de; }
.office { width: 640px; height: 384px; image-rendering: pixelated; border: 6px solid #8b7cf6; }
</style></head><body>
<div class="text"><img class="logo" src="${logo}" alt=""><h1>Agents Office</h1>
<p>Your Claude Code agents in a pixel art office</p></div>
<img class="office" src="${office}" alt="">
</body></html>`;

const iconHtml = `<!doctype html><html><body style="margin:0;background:#141626">
<img src="${logo}" style="width:180px;height:180px;display:block;image-rendering:pixelated"></body></html>`;

const browser = await chromium.launch();
try {
  const og = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  await og.setContent(ogHtml);
  await og.evaluate(() => document.fonts.ready);
  await og.screenshot({ path: resolve(pub, 'og.png') });
  const icon = await browser.newPage({ viewport: { width: 180, height: 180 } });
  await icon.setContent(iconHtml);
  await icon.screenshot({ path: resolve(pub, 'apple-touch-icon.png') });
} finally {
  await browser.close();
}
