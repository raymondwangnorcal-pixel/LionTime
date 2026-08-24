import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  combineBarnardDiningWeeks,
  parseBarnardRenderedWeek,
  parseBarnardTimeRange,
} from '../lib/barnard-dining-hours-parser.js';

function fixture(date) {
  return readFileSync(new URL(`./fixtures/barnard-dining-hours-week-${date}.html`, import.meta.url), 'utf8');
}

const currentHtml = fixture('2026-08-23');
const nextHtml = fixture('2026-08-30');
const thirdHtml = fixture('2026-09-06');

test('normalizes Barnard 12-hour and 24-hour time ranges', () => {
  assert.deepEqual(parseBarnardTimeRange('8a - 2 PM'), ['08:00', '14:00']);
  assert.deepEqual(parseBarnardTimeRange('12:00 am – 12:30pm'), ['00:00', '12:30']);
  assert.deepEqual(parseBarnardTimeRange('08:15 - 14:45'), ['08:15', '14:45']);
  assert.throws(() => parseBarnardTimeRange('8:00a - 8:00a'), /zero-length/);
  assert.throws(() => parseBarnardTimeRange('25:00 - 26:00'), /invalid Barnard time/);
});

test('parses target rows across variable tables and ignores LeFrak and Kosher', () => {
  const week = parseBarnardRenderedWeek(currentHtml, { expectedWeekStart: '2026-08-23' });
  assert.equal(week.venues.length, 4);
  assert.deepEqual(week.venues.map(({ id }) => id), [
    'hewitt', 'diana-center-cafe', 'barnard-bubble-tea-sushi', 'lizs-place',
  ]);
  assert.deepEqual(
    week.venues.find(({ id }) => id === 'hewitt').days[1].intervals,
    [['07:00', '09:00'], ['11:30', '14:00'], ['16:30', '19:00']],
  );
  assert.deepEqual(week.venues.find(({ id }) => id === 'diana-center-cafe').days[0], {
    date: '2026-08-23', intervals: [], status: 'Closed',
  });
});

test('parses the fixture after Chromium serializes the rendered DOM', async () => {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(currentHtml);
    const week = parseBarnardRenderedWeek(await page.content(), {
      expectedWeekStart: '2026-08-23',
    });
    assert.equal(week.venues.length, 4);
    assert.deepEqual(
      week.venues.find(({ id }) => id === 'barnard-bubble-tea-sushi').days[2].intervals,
      [['11:00', '17:00']],
    );
  } finally {
    await browser.close();
  }
});

test('uses visible rendered spans when accessibility wording changes', () => {
  const changed = nextHtml.replaceAll(' hours:', ' availability:');
  const week = parseBarnardRenderedWeek(changed);
  assert.deepEqual(
    week.venues.find(({ id }) => id === 'lizs-place').days[4].intervals,
    [['08:00', '14:00'], ['16:00', '19:00']],
  );
});

test('rejects conflicting, missing, and malformed target evidence atomically', () => {
  const conflicting = nextHtml.replace(
    "Liz's Place Thu hours: 8:00a - 2:00p, 4:00p - 7:00p",
    "Liz's Place Thu hours: 9:00a - 2:00p, 4:00p - 7:00p",
  );
  assert.throws(() => parseBarnardRenderedWeek(conflicting), /disagree/);

  const missing = nextHtml.replace(/<tr class="location-name-row"><td>Diana Center Cafe<\/td><\/tr><tr class="hours-row"><th scope="row">Diana Center Cafe<\/th>[\s\S]*?<\/tr>/, '');
  assert.throws(() => parseBarnardRenderedWeek(missing), /missing Barnard target/);

  const wrongDate = nextHtml.replace('>9/3<', '>9/4<');
  assert.throws(() => parseBarnardRenderedWeek(wrongDate), /does not match/);
});

test('combines either two or three consecutive complete weeks', () => {
  const weeks = [currentHtml, nextHtml, thirdHtml].map(html => parseBarnardRenderedWeek(html));
  const two = combineBarnardDiningWeeks(weeks.slice(0, 2));
  assert.equal(two.windowStart, '2026-08-23');
  assert.equal(two.windowEnd, '2026-09-05');
  assert.ok(two.venues.every(({ days }) => days.length === 14));

  const three = combineBarnardDiningWeeks(weeks);
  assert.equal(three.windowEnd, '2026-09-12');
  assert.ok(three.venues.every(({ days }) => days.length === 21));

  assert.throws(
    () => combineBarnardDiningWeeks([weeks[0], weeks[2]]),
    /must be consecutive/,
  );
  assert.throws(() => combineBarnardDiningWeeks([weeks[0]]), /two or three/);
});
