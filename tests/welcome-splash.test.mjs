import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { chromium } from 'playwright';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const styleStart = html.indexOf('/* Hide ALL page content behind splash');
const styleEnd = html.indexOf('</style>', styleStart);
const markupStart = html.indexOf('<!-- Welcome splash screen -->');
const markupEnd = html.indexOf('<!-- Sidebar -->', markupStart);
const scriptMarker = html.indexOf('/* ── Welcome splash:');
const scriptStart = html.lastIndexOf('<script>', scriptMarker) + '<script>'.length;
const scriptEnd = html.indexOf('</script>', scriptMarker);

const testDocument = `
  <style>${html.slice(styleStart, styleEnd)}</style>
  ${html.slice(markupStart, markupEnd)}
  <script>${html.slice(scriptStart, scriptEnd)}</script>
`;

for (const [device, viewport] of [
  ['mobile', { width: 390, height: 844 }],
  ['desktop', { width: 1440, height: 900 }],
]) {
  test(`${device} welcome splash holds for 0.8 seconds and fades for 0.3 seconds`, async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport });

    try {
      const startTime = new Date('2026-08-30T16:00:00Z');
      await page.clock.install({ time: startTime });
      await page.clock.pauseAt(startTime);
      await page.setContent(testDocument);

      await page.clock.fastForward(799);
      assert.equal(await page.locator('#splash-overlay').evaluate((node) => node.classList.contains('fade-out')), false);

      await page.clock.fastForward(1);
      const overlay = page.locator('#splash-overlay');
      assert.equal(await overlay.evaluate((node) => node.classList.contains('fade-out')), true);
      assert.equal(await overlay.evaluate((node) => getComputedStyle(node).transitionDuration), '0.3s');

      await page.clock.fastForward(299);
      assert.equal(await overlay.count(), 1);
      await page.clock.fastForward(1);
      assert.equal(await overlay.count(), 0);
    } finally {
      await browser.close();
    }
  });
}
