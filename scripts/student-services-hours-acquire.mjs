import { chromium } from 'playwright';

import {
  STUDENT_SERVICES_SOURCE_IDS,
  STUDENT_SERVICES_SOURCE_URLS,
} from '../lib/student-services-hours-catalog.js';

class SourceAcquisitionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SourceAcquisitionError';
    this.code = code;
  }
}

function officialLocation(actualUrl, expectedUrl) {
  const actual = new URL(actualUrl);
  const expected = new URL(expectedUrl);
  return actual.protocol === 'https:' && actual.hostname === expected.hostname;
}

async function challenged(page) {
  const title = await page.title();
  const text = await page.locator('body').innerText().catch(() => '');
  return /just a moment|attention required|verify you are human|access denied/i.test(`${title} ${text}`);
}

async function acquireLerner(page, timeoutMs) {
  const entryUrl = STUDENT_SERVICES_SOURCE_URLS.lerner;
  await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  if (!officialLocation(page.url(), entryUrl)) throw new SourceAcquisitionError('navigation', 'Lerner redirected off source');
  if (await challenged(page)) throw new SourceAcquisitionError('challenge', 'Lerner managed challenge');
  const homeHtml = await page.content();
  const calendarUrl = await page.locator('a[href], iframe[src]').evaluateAll(elements => {
    const candidate = elements.map(element => element.href || element.src)
      .find(value => value && (/\/events(?:[/?#]|$)/i.test(value)
        || /^https:\/\/calendar\.google\.com\/calendar\/embed\?/i.test(value)));
    return candidate || null;
  });
  if (!calendarUrl) throw new SourceAcquisitionError('missing-content', 'Lerner calendar link is missing');
  const resolved = new URL(calendarUrl, entryUrl);
  if (resolved.origin === new URL(entryUrl).origin && resolved.pathname === '/events') {
    await page.goto(resolved.href, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (await challenged(page)) throw new SourceAcquisitionError('challenge', 'Lerner calendar managed challenge');
    return { homeHtml, calendarHtml: await page.content(), calendarUrl: resolved.href };
  }
  if (resolved.hostname !== 'calendar.google.com' || resolved.pathname !== '/calendar/embed'
    || resolved.searchParams.get('title') !== 'Lerner Hall Operating Hours'
    || resolved.searchParams.getAll('src').length < 1) {
    throw new SourceAcquisitionError('missing-content', 'Lerner calendar is not directly embedded official evidence');
  }
  await page.waitForTimeout(3_000);
  const frame = page.frames().find(candidate => {
    try {
      const url = new URL(candidate.url());
      return url.hostname === 'calendar.google.com' && url.pathname === '/calendar/embed'
        && url.searchParams.get('title') === 'Lerner Hall Operating Hours';
    } catch { return false; }
  });
  if (!frame) throw new SourceAcquisitionError('missing-content', 'Lerner embedded calendar did not load');
  const calendarText = await frame.locator('body').innerText();
  if (!/Calendar:\s*[^,]+.*\b2026\b/i.test(calendarText)) {
    throw new SourceAcquisitionError('missing-content', 'Lerner embedded calendar hours are missing');
  }
  return { homeHtml, calendarText, calendarUrl: resolved.href };
}

async function acquireHtml(page, sourceId, timeoutMs) {
  const entryUrl = STUDENT_SERVICES_SOURCE_URLS[sourceId];
  await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
  if (!officialLocation(page.url(), entryUrl)) throw new SourceAcquisitionError('navigation', `${sourceId} redirected off source`);
  if (await challenged(page)) throw new SourceAcquisitionError('challenge', `${sourceId} managed challenge`);
  const html = await page.content();
  if (!/<main\b|id=["']main-article["']/i.test(html)) {
    throw new SourceAcquisitionError('missing-content', `${sourceId} official content is missing`);
  }
  return { html };
}

async function acquireBookstore(page, timeoutMs) {
  const entryUrl = STUDENT_SERVICES_SOURCE_URLS.bookstore;
  const candidates = [];
  const responseListener = async response => {
    try {
      const url = new URL(response.url());
      if (url.hostname !== new URL(entryUrl).hostname) return;
      const contentType = (await response.allHeaders())['content-type'] || '';
      if (!/json/i.test(contentType)) return;
      const body = await response.json();
      if (body?.store?.name === 'Columbia University Bookstore' && body?.hours) candidates.push(body);
    } catch {}
  };
  page.on('response', responseListener);
  try {
    await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (!officialLocation(page.url(), entryUrl)) throw new SourceAcquisitionError('navigation', 'Bookstore redirected off source');
    if (await challenged(page)) throw new SourceAcquisitionError('challenge', 'Bookstore managed challenge');
    await page.waitForTimeout(1_000);
    if (candidates.length) return { data: candidates[0] };
    const visibleText = await page.locator('body').innerText();
    if (!/Columbia University in the City of New York[\s\S]*2922 Broadway[\s\S]*Lerner Hall\s*\|\s*Lower Level[\s\S]*STORE HOURS/i.test(visibleText)) {
      throw new SourceAcquisitionError('missing-content', 'Bookstore official visible hours are missing');
    }
    return { text: visibleText };
  } finally {
    page.off?.('response', responseListener);
  }
}

export async function acquireStudentServicesSources({
  chromiumImpl = chromium,
  now = new Date(),
  timeoutMs = 60_000,
} = {}) {
  const browser = await chromiumImpl.launch({ headless: false });
  const sources = [];
  try {
    for (const sourceId of STUDENT_SERVICES_SOURCE_IDS) {
      const page = await browser.newPage();
      try {
        let payload;
        if (sourceId === 'lerner') payload = await acquireLerner(page, timeoutMs);
        else if (sourceId === 'bookstore') payload = await acquireBookstore(page, timeoutMs);
        else payload = await acquireHtml(page, sourceId, timeoutMs);
        sources.push({ sourceId, sourceUrl: STUDENT_SERVICES_SOURCE_URLS[sourceId], result: 'success', payload });
      } catch (error) {
        sources.push({
          sourceId,
          sourceUrl: STUDENT_SERVICES_SOURCE_URLS[sourceId],
          result: 'failure',
          failureCode: error instanceof SourceAcquisitionError ? error.code : 'unexpected',
        });
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  if (sources.every(source => source.result === 'failure')) throw new Error('all Student Life sources failed');
  return { generated: now, sources };
}
