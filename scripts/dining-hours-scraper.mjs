import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import {
  DINING_ARTICLE_SOURCES,
  parseFallArticle,
  parseLaborDayArticle,
  parseNsopArticle,
} from '../lib/dining-article-parser.js';
import { parseCafeEastPage } from '../lib/cafe-east-parser.js';
import {
  BARNARD_DINING_VENUES,
  combineBarnardDiningWeeks,
  parseBarnardRenderedWeek,
} from '../lib/barnard-dining-hours-parser.js';
import { resolveDiningSnapshot } from '../lib/dining-hours-resolver.js';
import { DINING_SOURCE_CONTRACT } from '../lib/dining-hours-schema.js';
import {
  DINING_SOURCE_IDS,
  validateDiningAttemptBatch,
} from '../lib/dining-hours-source-schema.js';

const SOURCE_URL = 'https://dining.columbia.edu/content/locations-hours';
const BARNARD_ACQUISITION_TIMEOUT_MS = 75_000;
const BARNARD_NAVIGATION_TIMEOUT_MS = 45_000;
const BARNARD_RENDER_TIMEOUT_MS = 15_000;
const BARNARD_TRANSITION_TIMEOUT_MS = 7_500;

export const DINING_LOCATION_MAP = Object.freeze({
  7482: Object.freeze({ id: 'bj-everett', name: 'Blue Java at Everett Library Café', category: 'cafe' }),
  56: Object.freeze({ id: 'bj-butler', name: 'Blue Java Café - Butler Library', category: 'cafe' }),
  60: Object.freeze({ id: 'bj-uris', name: 'Blue Java Café - Uris', category: 'cafe' }),
  57: Object.freeze({ id: 'bj-mudd', name: "Blue Java Café at Chef Don's, Mudd Hall", category: 'cafe' }),
  6990: Object.freeze({ id: 'chefdons', name: "Chef Don's Pizza Pi featuring Blue Java", category: 'dining' }),
  6907: Object.freeze({ id: 'chefmikes', name: "Chef Mike's Sub Shop", category: 'dining' }),
  7351: Object.freeze({ id: 'facultyhouse', name: 'Faculty House 2nd Floor', category: 'dining' }),
  7850: Object.freeze({ id: 'facultyhouse-4', name: 'Faculty House 4th Floor', category: 'dining' }),
  12: Object.freeze({ id: 'ferris', name: 'Ferris Booth Commons', category: 'dining' }),
  7355: Object.freeze({ id: 'gracedodge', name: 'Grace Dodge Dining Hall', category: 'dining' }),
  11: Object.freeze({ id: 'jjs', name: "JJ's Place", category: 'dining' }),
  10: Object.freeze({ id: 'johnjay', name: 'John Jay Dining Hall', category: 'dining' }),
  9727: Object.freeze({ id: 'johnnys', name: "Johnny's Food Truck", category: 'dining' }),
  58: Object.freeze({ id: 'lenfest-cafe', name: 'Lenfest Café', category: 'cafe' }),
  7452: Object.freeze({ id: 'smith-dining', name: 'Robert F. Smith Dining Hall', category: 'dining' }),
  7487: Object.freeze({ id: 'facshack', name: 'The Fac Shack', category: 'dining' }),
});

const DAY_KEYS = Object.freeze([
  'days_sunday',
  'days_monday',
  'days_tuesday',
  'days_wednesday',
  'days_thursday',
  'days_friday',
  'days_saturday',
]);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function easternDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = (type) => parts.find((item) => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function sourceDate(value, field) {
  if (typeof value === 'number' && Number.isFinite(value)) return easternDate(new Date(value * 1000));
  if (typeof value === 'string' && /^\d+$/.test(value)) return easternDate(new Date(Number(value) * 1000));
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  throw new Error(`invalid ${field}`);
}

function cleanStatus(value) {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    const parts = value.map((item) => cleanStatus(item)).filter(Boolean);
    return parts.length ? parts.join(' · ') : null;
  }
  if (isRecord(value)) return cleanStatus(value.title ?? value.value ?? value.text);
  const cleaned = String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function normalizeTime(value, allow24 = false) {
  const raw = String(value ?? '').trim();
  const compact = raw.match(/^(\d{1,2})(\d{2})$/);
  if (compact) {
    const hour = Number(compact[1]);
    const minute = Number(compact[2]);
    if (minute < 60 && (hour < 24 || (allow24 && hour === 24 && minute === 0))) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  const twentyFour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    if (minute < 60 && (hour < 24 || (allow24 && hour === 24 && minute === 0))) {
      return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  const twelve = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (twelve) {
    const hour = Number(twelve[1]);
    const minute = Number(twelve[2] || 0);
    if (hour >= 1 && hour <= 12 && minute < 60) {
      const normalized = (hour % 12) + (twelve[3].toLowerCase() === 'p' ? 12 : 0);
      return `${String(normalized).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    }
  }
  throw new Error(`invalid dining time: ${raw}`);
}

function normalizeExcluded(value) {
  if (!Array.isArray(value)) return new Set();
  const dates = value.map((item) => {
    const raw = typeof item === 'string' ? item : item?.date || item?.value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw || '')) return raw;
    const match = String(raw || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!match) throw new Error(`invalid excluded date: ${raw}`);
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  });
  return new Set(dates);
}

function findLocationNodes(dataset) {
  const found = [];
  const visited = new Set();
  const visit = (value) => {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (isRecord(value) && ('nid' in value || 'id' in value)
      && ('open_hours_fields' in value || 'openHoursFields' in value)) {
      found.push(value);
      return;
    }
    for (const child of Array.isArray(value) ? value : Object.values(value)) visit(child);
  };
  visit(dataset);
  return found;
}

function periodsFor(node) {
  const value = node.open_hours_fields ?? node.openHoursFields;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  throw new Error(`source location ${node.nid ?? node.id} has invalid hours periods`);
}

function intervalsFor(period, date) {
  const dayIndex = new Date(`${date}T12:00:00Z`).getUTCDay();
  const dayValues = Array.isArray(period.days)
    ? period.days.find((item) => isRecord(item) && DAY_KEYS[dayIndex] in item)
    : period.days;
  const values = dayValues?.[DAY_KEYS[dayIndex]] ?? [];
  if (!Array.isArray(values)) throw new Error(`invalid intervals for ${date}`);
  return values.map((interval) => {
    if (!isRecord(interval)) throw new Error(`invalid interval for ${date}`);
    return [
      normalizeTime(interval.hours_from ?? interval.from ?? interval.open),
      normalizeTime(interval.hours_to ?? interval.to ?? interval.close, true),
    ];
  });
}

function periodForDate(periods, date) {
  return periods.find((period) => {
    if (!isRecord(period)) return false;
    const start = sourceDate(period.date_from ?? period.dateFrom, 'date_from');
    const end = sourceDate(period.date_to ?? period.dateTo, 'date_to');
    return start <= date && date <= end;
  });
}

export function parseDiningNodes(raw) {
  if (typeof raw !== 'string') throw new Error('dining_nodes must be a JSON string');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('dining_nodes must contain valid JSON');
  }
}

export function buildDiningSnapshot(dataset, generated = new Date()) {
  if (!(generated instanceof Date) || Number.isNaN(generated.getTime())) {
    throw new Error('generated must be a valid Date');
  }
  const sourceNodes = findLocationNodes(dataset);
  const bySourceId = new Map(sourceNodes.map((node) => [String(node.nid ?? node.id), node]));
  const windowStart = easternDate(generated);
  const dates = Array.from({ length: 14 }, (_, index) => addDays(windowStart, index));

  const locations = Object.entries(DINING_LOCATION_MAP).map(([sourceId, mapping]) => {
    const node = bySourceId.get(sourceId);
    if (!node) throw new Error(`missing source location: ${sourceId}`);
    const periods = periodsFor(node);
    const days = dates.map((date) => {
      const period = periodForDate(periods, date);
      if (!period) return { date, intervals: [], status: 'Hours not published' };
      const status = cleanStatus(period.displayed_hours ?? period.displayedHours);
      const excluded = normalizeExcluded(period.excluded ?? period.excluded_dates ?? period.excludedDates);
      return {
        date,
        intervals: excluded.has(date) ? [] : intervalsFor(period, date),
        status,
      };
    });
    return {
      id: mapping.id,
      sourceId,
      name: String(node.title || node.name || mapping.name).trim(),
      category: mapping.category,
      days,
    };
  });

  return {
    schemaVersion: 1,
    generated: generated.toISOString(),
    source: SOURCE_URL,
    windowStart,
    windowEnd: dates.at(-1),
    locations,
  };
}

export function buildResolvedDiningSnapshot(dataset, articleHtml, generated = new Date()) {
  const baseSnapshot = buildDiningSnapshot(dataset, generated);
  return resolveDiningSnapshot({
    baseSnapshot,
    nsop: parseNsopArticle(articleHtml.nsop),
    labor: parseLaborDayArticle(articleHtml.labor),
    fall: parseFallArticle(articleHtml.fall),
    cafeEast: parseCafeEastPage(articleHtml.cafeEast),
  });
}

function assertOfficialPage(page, expectedUrl) {
  if (typeof page.url !== 'function') return;
  const actual = new URL(page.url());
  const expected = new URL(expectedUrl);
  if (actual.protocol !== 'https:' || actual.hostname !== expected.hostname
    || actual.pathname !== expected.pathname) {
    throw new Error(`unexpected Dining redirect: ${actual.href}`);
  }
}

class SourceAcquisitionError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SourceAcquisitionError';
    this.code = code;
  }
}

async function managedChallenge(page, response) {
  const status = typeof response?.status === 'function' ? response.status() : null;
  if (status === 403 || status === 429) return true;
  const title = typeof page.title === 'function' ? await page.title().catch(() => '') : '';
  const body = await page.locator('body').innerText({ timeout: 1_000 }).catch(() => '');
  return /just a moment|performing security verification|verify you are human|attention required|access denied/i
    .test(`${title} ${body}`);
}

async function navigateToSource(page, sourceUrl, timeout = 90_000) {
  let response;
  try {
    response = await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout });
  } catch (error) {
    const code = /timeout/i.test(`${error?.name || ''} ${error?.message || ''}`) ? 'timeout' : 'navigation';
    throw new SourceAcquisitionError(code, `${sourceUrl} navigation failed`);
  }
  try {
    assertOfficialPage(page, sourceUrl);
  } catch {
    throw new SourceAcquisitionError('navigation', `${sourceUrl} redirected away from its official page`);
  }
  if (await managedChallenge(page, response)) {
    throw new SourceAcquisitionError('challenge', `${sourceUrl} returned a managed security challenge`);
  }
  const status = typeof response?.status === 'function' ? response.status() : null;
  if (status !== null && status >= 400) {
    throw new SourceAcquisitionError('navigation', `${sourceUrl} returned HTTP ${status}`);
  }
}

function failureAttempt(sourceId, attemptedAt, failureCode) {
  return {
    sourceId,
    sourceUrl: DINING_SOURCE_CONTRACT[sourceId],
    attemptedAt,
    result: 'failure',
    failureCode,
    payload: null,
  };
}

function successAttempt(sourceId, attemptedAt, payload) {
  return {
    sourceId,
    sourceUrl: DINING_SOURCE_CONTRACT[sourceId],
    attemptedAt,
    result: 'success',
    failureCode: null,
    payload,
  };
}

function failureCode(error, fallback = 'unexpected') {
  if (error instanceof SourceAcquisitionError) return error.code;
  return /timeout/i.test(`${error?.name || ''} ${error?.message || ''}`) ? 'timeout' : fallback;
}

async function acquireLocationsAttempt(page, now) {
  const sourceId = 'locations-feed';
  const attemptedAt = now.toISOString();
  try {
    await navigateToSource(page, SOURCE_URL);
    try {
      await page.waitForFunction(
        () => typeof globalThis.dining_nodes === 'string',
        null,
        { timeout: 90_000 },
      );
    } catch (error) {
      throw new SourceAcquisitionError(
        /timeout/i.test(`${error?.name || ''} ${error?.message || ''}`) ? 'timeout' : 'missing-content',
        'Dining locations payload is missing',
      );
    }
    const raw = await page.evaluate(() => globalThis.dining_nodes);
    return successAttempt(sourceId, attemptedAt, buildDiningSnapshot(parseDiningNodes(raw), now));
  } catch (error) {
    return failureAttempt(sourceId, attemptedAt, failureCode(error, 'parse'));
  }
}

const ARTICLE_PARSERS = Object.freeze({
  'nsop-2026': parseNsopArticle,
  'labor-day-2026': parseLaborDayArticle,
  'fall-2026': parseFallArticle,
});

async function acquireArticleAttempt(page, sourceId, now) {
  const attemptedAt = now.toISOString();
  const sourceUrl = DINING_SOURCE_CONTRACT[sourceId];
  try {
    await navigateToSource(page, sourceUrl);
    const article = page.locator('#main-article');
    if (typeof article.count === 'function' && await article.count() !== 1) {
      throw new SourceAcquisitionError('missing-content', `${sourceId} article content is missing`);
    }
    const html = await article.innerHTML({ timeout: 5_000 });
    if (typeof html !== 'string' || !html.trim()) {
      throw new SourceAcquisitionError('missing-content', `${sourceId} article content is empty`);
    }
    let payload;
    try {
      payload = ARTICLE_PARSERS[sourceId](html);
    } catch {
      throw new SourceAcquisitionError('parse', `${sourceId} article could not be parsed`);
    }
    return successAttempt(sourceId, attemptedAt, payload);
  } catch (error) {
    return failureAttempt(sourceId, attemptedAt, failureCode(error));
  }
}

async function acquireCafeEastAttempt(page, now) {
  const sourceId = 'cafe-east';
  const attemptedAt = now.toISOString();
  const sourceUrl = DINING_SOURCE_CONTRACT[sourceId];
  try {
    await navigateToSource(page, sourceUrl);
    const main = page.locator('main');
    if (typeof main.count === 'function' && await main.count() !== 1) {
      throw new SourceAcquisitionError('missing-content', 'Café East main content is missing');
    }
    const text = await main.innerText({ timeout: 5_000 });
    if (typeof text !== 'string' || !text.trim()) {
      throw new SourceAcquisitionError('missing-content', 'Café East main content is empty');
    }
    try {
      return successAttempt(sourceId, attemptedAt, parseCafeEastPage(text));
    } catch {
      throw new SourceAcquisitionError('parse', 'Café East hours could not be parsed');
    }
  } catch (error) {
    return failureAttempt(sourceId, attemptedAt, failureCode(error));
  }
}

function barnardCaptionNeedle(weekStart) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(`${weekStart}T12:00:00Z`));
}

function remainingTimeout(deadline, maximum) {
  return Math.max(1, Math.min(maximum, deadline - Date.now()));
}

async function waitForBarnardTargets(page, expectedWeekStart, deadline, maximum) {
  const sourceNames = Object.keys(BARNARD_DINING_VENUES);
  const expectedCaption = expectedWeekStart ? barnardCaptionNeedle(expectedWeekStart) : null;
  const timeout = remainingTimeout(deadline, maximum);
  try {
    await page.waitForFunction(({ names, caption }) => {
      const normalize = value => String(value || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
      const targets = new Set();
      for (const table of document.querySelectorAll('table.unified-hours-table')) {
        const rows = [...table.querySelectorAll('tr.hours-row')].filter((row) => {
          const name = normalize(row.querySelector('th[scope="row"]')?.textContent);
          return names.includes(name);
        });
        if (!rows.length) continue;
        if (caption && !normalize(table.querySelector('caption')?.textContent).includes(caption)) return false;
        for (const row of rows) {
          if (row.querySelectorAll('td').length !== 7) return false;
          targets.add(normalize(row.querySelector('th[scope="row"]')?.textContent));
        }
      }
      return targets.size === names.length && names.every(name => targets.has(name));
    }, { names: sourceNames, caption: expectedCaption }, { timeout, polling: 100 });
  } catch (error) {
    throw new SourceAcquisitionError(
      /timeout/i.test(`${error?.name || ''} ${error?.message || ''}`) ? 'timeout' : 'missing-content',
      'Barnard target tables did not finish rendering',
    );
  }
}

async function barnardTargetSignature(page) {
  const sourceNames = Object.keys(BARNARD_DINING_VENUES);
  return page.evaluate((names) => {
    const normalize = value => String(value || '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
    const parts = [];
    for (const table of document.querySelectorAll('table.unified-hours-table')) {
      const caption = normalize(table.querySelector('caption')?.textContent);
      for (const row of table.querySelectorAll('tr.hours-row')) {
        const name = normalize(row.querySelector('th[scope="row"]')?.textContent);
        if (names.includes(name)) parts.push(`${caption}\n${name}\n${row.innerHTML}`);
      }
    }
    return parts.sort().join('\n---\n');
  }, sourceNames);
}

async function waitForStableBarnardWeek(page, expectedWeekStart, deadline, maximum) {
  while (Date.now() < deadline) {
    await waitForBarnardTargets(page, expectedWeekStart, deadline, maximum);
    const before = await barnardTargetSignature(page);
    if (typeof page.waitForTimeout === 'function') await page.waitForTimeout(100);
    const after = await barnardTargetSignature(page);
    if (before && before === after) return;
  }
  throw new SourceAcquisitionError('timeout', 'Barnard target tables did not stabilize');
}

async function nextBarnardWeek(page, weekStart, deadline, { optional = false } = {}) {
  const button = page.getByRole('button', { name: 'Go to next week' }).first();
  if (typeof button.count === 'function' && await button.count() === 0) {
    if (optional) return false;
    throw new SourceAcquisitionError('missing-content', 'Barnard next-week control is missing');
  }
  if (typeof button.isEnabled === 'function' && !await button.isEnabled()) {
    if (optional) return false;
    throw new SourceAcquisitionError('missing-content', 'Barnard next week is unavailable');
  }
  await button.click({ timeout: remainingTimeout(deadline, BARNARD_TRANSITION_TIMEOUT_MS) });
  await waitForStableBarnardWeek(
    page,
    addDays(weekStart, 7),
    deadline,
    BARNARD_TRANSITION_TIMEOUT_MS,
  );
  return true;
}

async function acquireBarnardHoursAttempt(page, now) {
  const sourceId = 'barnard-hours';
  const attemptedAt = now.toISOString();
  const sourceUrl = DINING_SOURCE_CONTRACT[sourceId];
  const deadline = Date.now() + BARNARD_ACQUISITION_TIMEOUT_MS;
  try {
    await navigateToSource(page, sourceUrl, BARNARD_NAVIGATION_TIMEOUT_MS);
    await waitForStableBarnardWeek(page, null, deadline, BARNARD_RENDER_TIMEOUT_MS);
    const first = parseBarnardRenderedWeek(await page.content());

    await nextBarnardWeek(page, first.weekStart, deadline);
    const second = parseBarnardRenderedWeek(await page.content(), {
      expectedWeekStart: addDays(first.weekStart, 7),
    });
    const weeks = [first, second];

    try {
      if (await nextBarnardWeek(page, second.weekStart, deadline, { optional: true })) {
        weeks.push(parseBarnardRenderedWeek(await page.content(), {
          expectedWeekStart: addDays(second.weekStart, 7),
        }));
      }
    } catch {}

    return successAttempt(sourceId, attemptedAt, combineBarnardDiningWeeks(weeks));
  } catch (error) {
    return failureAttempt(sourceId, attemptedAt, failureCode(error, 'parse'));
  }
}

export async function scrapeDiningHours({
  outputPath, now = new Date(), chromiumImpl, onSourceResult = () => {},
} = {}) {
  if (typeof outputPath !== 'string' || !outputPath.trim()) {
    throw new Error('--json-out requires a path');
  }
  const chromium = chromiumImpl || (await import('playwright')).chromium;
  const browser = await chromium.launch({ headless: false });
  try {
    const page = await browser.newPage({ timezoneId: 'America/New_York' });
    const attempts = [await acquireLocationsAttempt(page, now)];
    for (const sourceId of DINING_SOURCE_IDS.slice(1)) {
      if (sourceId === 'barnard-hours') {
        const startedAt = Date.now();
        const attempt = await acquireBarnardHoursAttempt(page, now);
        attempts.push(attempt);
        onSourceResult({ sourceId, result: attempt.result, durationMs: Date.now() - startedAt });
      } else {
        attempts.push(sourceId === 'cafe-east'
          ? await acquireCafeEastAttempt(page, now)
          : await acquireArticleAttempt(page, sourceId, now));
      }
    }
    const windowStart = easternDate(now);
    const batch = {
      schemaVersion: 3,
      generated: now.toISOString(),
      windowStart,
      windowEnd: addDays(windowStart, 13),
      attempts,
    };
    const validation = validateDiningAttemptBatch(batch);
    if (!validation.ok) throw new Error(`invalid Dining attempt batch: ${validation.errors.join('; ')}`);
    await writeFile(outputPath, `${JSON.stringify(validation.value, null, 2)}\n`, 'utf8');
    return validation.value;
  } finally {
    await browser.close();
  }
}

function outputPathFromArgs(args) {
  const index = args.indexOf('--json-out');
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) {
    throw new Error('--json-out requires a path');
  }
  return args[index + 1];
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  scrapeDiningHours({
    outputPath: outputPathFromArgs(process.argv.slice(2)),
    onSourceResult: ({ sourceId, result, durationMs }) => {
      process.stdout.write(`- ${sourceId}: ${result} in ${durationMs}ms\n`);
    },
  })
    .then((batch) => {
      const successes = batch.attempts.filter(attempt => attempt.result === 'success').length;
      for (const attempt of batch.attempts) {
        const detail = attempt.result === 'success' ? 'success' : `failure (${attempt.failureCode})`;
        process.stdout.write(`- ${attempt.sourceId}: ${detail}\n`);
      }
      process.stdout.write(`Dining sources: ${successes}/${batch.attempts.length} succeeded\n`);
    })
    .catch((error) => {
      process.stderr.write(`Dining scrape failed: ${error?.message || 'unknown error'}\n`);
      process.exitCode = 1;
    });
}

export { SOURCE_URL, acquireBarnardHoursAttempt };
