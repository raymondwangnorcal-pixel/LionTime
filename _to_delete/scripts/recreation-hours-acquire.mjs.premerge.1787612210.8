import { chromium } from 'playwright';

import { RECREATION_SOURCE_URLS } from '../lib/recreation-hours-catalog.js';

export async function acquireRecreationSources({
  chromiumImpl = chromium,
  timeoutMs = 60_000,
  calendarImpl = acquireBlueGymCalendar,
} = {}) {
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
        if (sourceId === 'columbiaHours') {
          try {
            pages[sourceId].blueGymCalendar = await calendarImpl({ page, timeoutMs });
          } catch {
            pages[sourceId].blueGymCalendar = {
              result: 'failure',
              failureCode: 'missing-content',
            };
          }
        }
      } finally {
        await page.close();
      }
    }
    return { generated: new Date(), pages };
  } finally {
    await browser.close();
  }
}

export async function acquireBlueGymCalendar({ page, timeoutMs = 60_000 } = {}) {
  const frames = page.locator('iframe[src*="calendar.google.com/calendar/embed"]');
  const candidates = [];
  for (let index = 0; index < await frames.count(); index += 1) {
    const frame = frames.nth(index);
    const calendarUrl = await frame.getAttribute('src');
    if (isOfficialBlueGymEmbed(calendarUrl)) candidates.push({ frame, calendarUrl });
  }
  if (candidates.length !== 1) throw new Error('missing unique official Blue Gym calendar');

  const { frame, calendarUrl } = candidates[0];
  const calendar = frame.contentFrame();
  const body = calendar.locator('body');
  await body.waitFor({ state: 'visible', timeout: timeoutMs });
  const weeks = [];
  for (let index = 0; index < 3; index += 1) {
    const text = await body.innerText({ timeout: timeoutMs });
    if (!text.trim()) throw new Error('empty Blue Gym calendar');
    weeks.push(text);
    if (index === 2) break;
    await calendar.getByRole('button', { name: 'Next week', exact: true }).click({ timeout: timeoutMs });
    await waitForCalendarAdvance({ page, body, previousText: text, timeoutMs });
  }
  return { result: 'success', calendarUrl, weeks };
}

function isOfficialBlueGymEmbed(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'calendar.google.com'
      && url.pathname === '/calendar/embed'
      && url.searchParams.getAll('title').length === 1
      && url.searchParams.get('title') === 'Blue Gym'
      && url.searchParams.getAll('src').length === 1
      && Boolean(url.searchParams.get('src'))
      && url.searchParams.getAll('ctz').length === 1
      && url.searchParams.get('ctz') === 'America/New_York';
  } catch {
    return false;
  }
}

async function waitForCalendarAdvance({ page, body, previousText, timeoutMs }) {
  const previousWeekStart = calendarWeekStart(previousText);
  if (!previousWeekStart) throw new Error('missing Blue Gym calendar week label');
  const deadline = Date.now() + timeoutMs;
  let stableText = null;
  let stableSince = 0;
  while (Date.now() < deadline) {
    const currentText = await body.innerText().catch(() => '');
    const currentWeekStart = calendarWeekStart(currentText);
    if (currentWeekStart && currentWeekStart !== previousWeekStart) {
      if (currentText !== stableText) {
        stableText = currentText;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= 3_000) {
        return;
      }
    } else {
      stableText = null;
      stableSince = 0;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('Blue Gym calendar did not advance');
}

function calendarWeekStart(text) {
  return String(text || '').match(/^(?:No|\d+)\s+(?:all day )?events?, Sunday, ([^\n]+)/mi)?.[1] || null;
}
