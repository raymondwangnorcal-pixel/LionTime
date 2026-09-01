import { chromium } from 'playwright';

import { RECREATION_SOURCE_URLS } from '../lib/recreation-hours-catalog.js';

const ACTIVITY_CALENDAR_HEADINGS = Object.freeze({
  'blue-gym': 'Blue Gym',
  'levien-gymnasium': 'Levien Gymnasium',
  'aerobics-room-4': 'Aerobics Room 4',
  'functional-fitness-studio': 'Functional Fitness Studio',
});

export async function acquireRecreationSources({
  chromiumImpl = chromium,
  timeoutMs = 60_000,
  calendarsImpl = acquireActivityCalendars,
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
        if (/just a moment|attention required|access denied/i.test(title) || !/<main\b|<article\b/i.test(html)) {
          pages[sourceId] = { url, accessDenied: true };
        } else {
          pages[sourceId] = { url, html };
          if (sourceId === 'columbiaHours') {
            try {
              pages[sourceId].activityCalendars = await calendarsImpl({ page, timeoutMs });
            } catch {
              pages[sourceId].activityCalendars = failedActivityCalendars();
            }
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

export async function acquireActivityCalendars({ page, timeoutMs = 60_000 } = {}) {
  const calendars = {};
  for (const [targetId, heading] of Object.entries(ACTIVITY_CALENDAR_HEADINGS)) {
    try {
      calendars[targetId] = await acquireActivityCalendar({ page, targetId, heading, timeoutMs });
    } catch {
      calendars[targetId] = { result: 'failure', failureCode: 'missing-content' };
    }
  }
  return calendars;
}

export const acquireBlueGymCalendar = async options => (
  acquireActivityCalendar({ ...options, targetId: 'blue-gym', heading: ACTIVITY_CALENDAR_HEADINGS['blue-gym'] })
);

async function acquireActivityCalendar({ page, targetId, heading, timeoutMs }) {
  const sections = page.locator('.paragraph--type--cu-tabbed-content-tab');
  const candidates = [];
  for (let index = 0; index < await sections.count(); index += 1) {
    const section = sections.nth(index);
    const sectionHeading = await section.locator('h2, h3').first().innerText().catch(() => '');
    if (sectionHeading.trim() === heading) candidates.push(section);
  }
  if (candidates.length !== 1) throw new Error(`missing unique official ${heading} calendar section`);

  const section = candidates[0];
  const tabId = await section.getAttribute('id');
  if (!/^tab-\d+$/.test(tabId || '')) throw new Error(`invalid ${heading} calendar section`);
  const frame = section.locator('iframe[src*="calendar.google.com/calendar/embed"]');
  if (await frame.count() !== 1) throw new Error(`missing unique official ${heading} calendar`);
  const calendarUrl = await frame.getAttribute('src');
  if (!isOfficialActivityEmbed(calendarUrl)) throw new Error(`invalid official ${heading} calendar`);
  const tabLink = page.locator(`a[href="#${tabId}"]`);
  if (await tabLink.count() !== 1) throw new Error(`missing ${heading} calendar tab`);
  await tabLink.click({ timeout: timeoutMs });

  const calendar = frame.contentFrame();
  const body = calendar.locator('body');
  await body.waitFor({ state: 'visible', timeout: timeoutMs });
  const weeks = [];
  let text = await waitForCalendarStable({ page, body, timeoutMs });
  for (let index = 0; index < 3; index += 1) {
    weeks.push(text);
    if (index === 2) break;
    await calendar.getByRole('button', { name: 'Next week', exact: true }).click({ timeout: timeoutMs });
    text = await waitForCalendarStable({ page, body, previousWeekStart: calendarWeekStart(text), timeoutMs });
  }
  return { result: 'success', targetId, calendarUrl, weeks };
}

function isOfficialActivityEmbed(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'calendar.google.com'
      && url.pathname === '/calendar/embed'
      && url.searchParams.getAll('src').length === 1
      && Boolean(url.searchParams.get('src'))
      && url.searchParams.getAll('ctz').length === 1
      && url.searchParams.get('ctz') === 'America/New_York';
  } catch {
    return false;
  }
}

async function waitForCalendarStable({ page, body, previousWeekStart = null, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  let stableText = null;
  let stableSince = 0;
  while (Date.now() < deadline) {
    const currentText = await body.innerText().catch(() => '');
    const currentWeekStart = calendarWeekStart(currentText);
    if (currentWeekStart && (!previousWeekStart || currentWeekStart !== previousWeekStart)) {
      if (currentText !== stableText) {
        stableText = currentText;
        stableSince = Date.now();
      } else if (Date.now() - stableSince >= 3_000) {
        return currentText;
      }
    } else {
      stableText = null;
      stableSince = 0;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('activity calendar did not stabilize');
}

function calendarWeekStart(text) {
  return String(text || '').match(/^(?:No|\d+)\s+(?:all day )?events?, Sunday, ([^\n]+)/mi)?.[1] || null;
}

function failedActivityCalendars() {
  return Object.fromEntries(Object.keys(ACTIVITY_CALENDAR_HEADINGS).map(targetId => [
    targetId,
    { result: 'failure', failureCode: 'missing-content' },
  ]));
}
