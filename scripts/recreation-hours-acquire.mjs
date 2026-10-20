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
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
        } catch (error) {
          // A source that cannot be reached is recorded, not thrown: the other sources
          // still run and the manifest gets a navigation/timeout entry (automated-fix.md §3).
          const text = `${error?.name || ''} ${error?.message || ''}`;
          pages[sourceId] = {
            url,
            accessDenied: true,
            failureCode: /timeout/i.test(text) ? 'timeout' : 'navigation',
            failureDetail: String(error?.message || 'navigation failed').split('\n')[0],
          };
          continue;
        }
        await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
        const title = await page.title();
        const html = await page.content();
        if (/just a moment|attention required|access denied/i.test(title)) {
          pages[sourceId] = { url, accessDenied: true, failureCode: 'challenge', failureDetail: title, evidenceHtml: html };
        } else if (!/<main\b|<article\b/i.test(html)) {
          pages[sourceId] = { url, accessDenied: true, failureCode: 'missing-content', failureDetail: 'no <main> or <article> in page', evidenceHtml: html };
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

export const ACTIVITY_CALENDAR_ATTEMPTS = 3;
/* All activity-calendar work, first attempts included, fits in this budget, so a bad day
   cannot push the job past its 15-minute limit and lose the Dodge, Uris and Barnard
   update with it. Each attempt's timeouts shrink to the time left. */
export const ACTIVITY_CALENDAR_BUDGET_MS = 6 * 60_000;
const MIN_ATTEMPT_TIMEOUT_MS = 5_000;
/* acquireActivityCalendar waits on up to six steps (render, three stable weeks, two
   clicks), each bounded by its timeout. */
const ATTEMPT_STEPS = 6;

/**
 * Each embedded Google Calendar is read independently and retried: a calendar that does
 * not render in time used to leave its space on "Hours need verification" for every day
 * of the window until the next run (Aerobics Room 4, 2026-10-20). The last attempt
 * reloads the page first. Every failure is logged, because the manifest only names the
 * three page sources.
 */
export async function acquireActivityCalendars({
  page, timeoutMs = 60_000, log = console.error, acquireOne = acquireActivityCalendar,
  budgetMs = ACTIVITY_CALENDAR_BUDGET_MS, now = () => Date.now(),
} = {}) {
  const calendars = {};
  const deadline = now() + budgetMs;
  for (const [targetId, heading] of Object.entries(ACTIVITY_CALENDAR_HEADINGS)) {
    calendars[targetId] = { result: 'failure', failureCode: 'missing-content' };
    for (let attempt = 1; attempt <= ACTIVITY_CALENDAR_ATTEMPTS; attempt += 1) {
      const remaining = deadline - now();
      if (remaining < MIN_ATTEMPT_TIMEOUT_MS * ATTEMPT_STEPS) {
        log(`activity calendar ${targetId}: time budget spent; ${attempt === 1 ? 'not attempted' : 'not retrying'}`);
        if (attempt === 1) calendars[targetId] = { result: 'failure', failureCode: 'timeout' };
        break;
      }
      const attemptTimeout = Math.max(MIN_ATTEMPT_TIMEOUT_MS, Math.min(timeoutMs, Math.floor(remaining / ATTEMPT_STEPS)));
      try {
        if (attempt === ACTIVITY_CALENDAR_ATTEMPTS && typeof page.reload === 'function') {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: attemptTimeout });
          await page.waitForLoadState?.('networkidle', { timeout: attemptTimeout }).catch(() => {});
        }
        calendars[targetId] = await acquireOne({ page, targetId, heading, timeoutMs: attemptTimeout });
        if (attempt > 1) log(`activity calendar ${targetId}: succeeded on attempt ${attempt}`);
        break;
      } catch (error) {
        log(`activity calendar ${targetId}: attempt ${attempt} failed: ${String(error?.message || error).split('\n')[0]}`);
      }
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
