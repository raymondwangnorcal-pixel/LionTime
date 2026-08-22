import { chromium } from 'playwright';

import { RECREATION_SOURCE_URLS } from '../lib/recreation-hours-catalog.js';

export async function acquireRecreationSources({ chromiumImpl = chromium, timeoutMs = 60_000 } = {}) {
  const browser = await chromiumImpl.launch({ headless: false });
  try {
    const pages = {};
    for (const [sourceId, url] of Object.entries(RECREATION_SOURCE_URLS)) {
      const page = await browser.newPage();
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
        const title = await page.title();
        const html = await page.content();
        if (/just a moment|attention required/i.test(title) || !/<main\b|<article\b/i.test(html)) {
          throw new Error(`${sourceId}: managed challenge or missing official content`);
        }
        pages[sourceId] = { url, html };
      } finally {
        await page.close();
      }
    }
    return { generated: new Date(), pages };
  } finally {
    await browser.close();
  }
}
