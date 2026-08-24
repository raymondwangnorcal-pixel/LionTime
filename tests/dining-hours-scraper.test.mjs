import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  DINING_LOCATION_MAP,
  acquireBarnardHoursAttempt,
  buildDiningSnapshot,
  parseDiningNodes,
  scrapeDiningHours,
} from '../scripts/dining-hours-scraper.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/dining-nodes.json', import.meta.url), 'utf8'));

function closedPeriod(status = 'Closed for Summer') {
  return {
    date_from: 1787284800,
    date_to: 1788408000,
    displayed_hours: status,
    excluded: [],
    days: Object.fromEntries([
      'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
    ].map((day) => [`days_${day}`, []])),
  };
}

function completeDataset() {
  const byId = new Map(structuredClone(fixture).nodes.map((node) => [String(node.nid), node]));
  return {
    nodes: Object.entries(DINING_LOCATION_MAP).map(([sourceId, mapping]) => byId.get(sourceId) || {
      nid: sourceId,
      title: mapping.name,
      open_hours_fields: [closedPeriod()],
    }),
  };
}

test('parses the structured dining_nodes JSON string', () => {
  assert.deepEqual(parseDiningNodes(JSON.stringify(fixture)), fixture);
  assert.throws(() => parseDiningNodes('{bad json'), /valid JSON/);
});

test('maps all sixteen official source nodes in deterministic order', () => {
  assert.equal(Object.keys(DINING_LOCATION_MAP).length, 16);
  const snapshot = buildDiningSnapshot(completeDataset(), new Date('2026-08-21T12:00:00Z'));
  assert.equal(snapshot.locations.length, 16);
  assert.deepEqual(snapshot.locations.map(({ sourceId }) => sourceId), Object.keys(DINING_LOCATION_MAP));
});

test('builds fourteen Eastern dates and preserves statuses, exclusions, and split intervals', () => {
  const snapshot = buildDiningSnapshot(completeDataset(), new Date('2026-08-21T12:00:00Z'));
  assert.equal(snapshot.windowStart, '2026-08-21');
  assert.equal(snapshot.windowEnd, '2026-09-03');

  const johnJay = snapshot.locations.find(({ id }) => id === 'johnjay');
  assert.equal(johnJay.days.length, 14);
  assert.deepEqual(johnJay.days[0], {
    date: '2026-08-21', intervals: [], status: 'Summer Hours',
  });
  assert.deepEqual(johnJay.days[2], {
    date: '2026-08-23', intervals: [], status: 'Summer Hours',
  });

  const ferris = snapshot.locations.find(({ id }) => id === 'ferris');
  assert.deepEqual(ferris.days[2].intervals, [['10:00', '14:00'], ['16:00', '20:00']]);

  const jjs = snapshot.locations.find(({ id }) => id === 'jjs');
  assert.equal(jjs.days[0].status, 'Closed for Summer');
  assert.deepEqual(jjs.days[0].intervals, []);
});

test('preserves legitimate overnight intervals', () => {
  const dataset = completeDataset();
  const jjs = dataset.nodes.find(({ nid }) => String(nid) === '11');
  jjs.open_hours_fields[0].displayed_hours = 'Fall Hours';
  jjs.open_hours_fields[0].days.days_friday = [{ hours_from: '12:00', hours_to: '10:00' }];
  const snapshot = buildDiningSnapshot(dataset, new Date('2026-08-21T12:00:00Z'));
  assert.deepEqual(
    snapshot.locations.find(({ id }) => id === 'jjs').days[0].intervals,
    [['12:00', '10:00']],
  );
});

test('normalizes Columbia live ISO dates, compact times, array days, and display titles', () => {
  const dataset = completeDataset();
  const johnJay = dataset.nodes.find(({ nid }) => String(nid) === '10');
  johnJay.open_hours_fields = [{
    date_from: '2026-08-21T04:00:00',
    date_to: '2026-09-04T03:59:59',
    displayed_hours: [{ title: 'Summer Hours' }],
    excluded: [],
    days: [{
      days_friday: [{ hours_from: '930', hours_to: '2100' }],
    }],
  }];
  const snapshot = buildDiningSnapshot(dataset, new Date('2026-08-21T12:00:00Z'));
  const day = snapshot.locations.find(({ id }) => id === 'johnjay').days[0];
  assert.deepEqual(day, {
    date: '2026-08-21', intervals: [['09:30', '21:00']], status: 'Summer Hours',
  });
});

test('rejects missing official locations and malformed time values', () => {
  const missing = completeDataset();
  missing.nodes.pop();
  assert.throws(() => buildDiningSnapshot(missing, new Date('2026-08-21T12:00:00Z')), /missing source location/);

  const malformed = completeDataset();
  malformed.nodes[0].open_hours_fields[0].days.days_friday = [{ hours_from: '25:00', hours_to: '14:00' }];
  assert.throws(() => buildDiningSnapshot(malformed, new Date('2026-08-21T12:00:00Z')), /invalid dining time/);
});

test('publishes six independent Dining source attempts and always closes Chromium', async () => {
  const calls = [];
  let currentUrl = '';
  let barnardWeek = 0;
  const cafeEast = readFileSync(new URL('./fixtures/cafe-east-live.txt', import.meta.url), 'utf8');
  const articleByPath = new Map([
    ['/news/new-student-orientation-program-nsop-2026-dining-service', readFileSync(new URL('./fixtures/dining-nsop-2026.html', import.meta.url), 'utf8')],
    ['/news/labor-day-2026-operating-hours', readFileSync(new URL('./fixtures/dining-labor-day-2026.html', import.meta.url), 'utf8')],
    ['/news/fall-2026-operating-hours', readFileSync(new URL('./fixtures/dining-fall-2026.html', import.meta.url), 'utf8')],
  ]);
  const barnardWeeks = ['2026-08-23', '2026-08-30', '2026-09-06']
    .map(date => readFileSync(new URL(`./fixtures/barnard-dining-hours-week-${date}.html`, import.meta.url), 'utf8'));
  const page = {
    async goto(url, options) {
      currentUrl = url;
      calls.push(['goto', url, options]);
      return { status: () => 200 };
    },
    url() { return currentUrl; },
    async title() { return 'Columbia Dining'; },
    async waitForFunction(_fn, argument, options) { calls.push(['waitForFunction', argument, options]); },
    async evaluate() {
      calls.push(['evaluate']);
      return currentUrl.includes('dineoncampus.com') ? `barnard-week-${barnardWeek}` : JSON.stringify(completeDataset());
    },
    async content() { calls.push(['content', barnardWeek]); return barnardWeeks[barnardWeek]; },
    async waitForTimeout(value) { calls.push(['waitForTimeout', value]); },
    getByRole() {
      return {
        first() {
          return {
            async count() { return 1; },
            async isEnabled() { return barnardWeek < 2; },
            async click() { barnardWeek += 1; calls.push(['barnard-next', barnardWeek]); },
          };
        },
      };
    },
    locator(selector) {
      calls.push(['locator', selector]);
      return {
        async innerText() { return selector === 'main' ? cafeEast : ''; },
        async count() { return ['#main-article', 'main'].includes(selector) ? 1 : 0; },
        async innerHTML() {
          calls.push(['innerHTML', currentUrl]);
          return articleByPath.get(new URL(currentUrl).pathname);
        },
      };
    },
  };
  const browser = {
    async newPage() { calls.push(['newPage']); return page; },
    async close() { calls.push(['close']); },
  };
  const chromiumImpl = {
    async launch(options) { calls.push(['launch', options]); return browser; },
  };
  const directory = await mkdtemp(join(tmpdir(), 'lionhour-dining-'));
  const outputPath = join(directory, 'snapshot.json');

  const batch = await scrapeDiningHours({
    outputPath,
    now: new Date('2026-08-21T12:00:00Z'),
    chromiumImpl,
  });

  assert.equal(batch.schemaVersion, 3);
  assert.equal(batch.attempts.length, 6);
  assert.ok(batch.attempts.every(attempt => attempt.result === 'success'));
  assert.equal(batch.attempts[0].payload.locations.length, 16);
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), batch);
  assert.equal(calls[0][0], 'launch');
  assert.deepEqual(calls[0][1], { headless: false });
  assert.equal(calls.at(-1)[0], 'close');
  assert.equal(calls.filter(([name]) => name === 'goto').length, 6);
  assert.deepEqual(calls.filter(([name]) => name === 'goto').map((call) => new URL(call[1]).hostname), [
    'dining.columbia.edu', 'dining.columbia.edu', 'dining.columbia.edu', 'dining.columbia.edu',
    'lernerhall.columbia.edu', 'dineoncampus.com',
  ]);
  assert.ok(calls.some(([name]) => name === 'waitForFunction'));
  assert.deepEqual(calls.find(([name]) => name === 'waitForFunction').slice(1), [null, { timeout: 90_000 }]);
  assert.ok(calls.some(([name]) => name === 'evaluate'));
  assert.equal(calls.filter(([name]) => name === 'innerHTML').length, 3);
  assert.equal(calls.filter(([name]) => name === 'barnard-next').length, 2);
  assert.equal(batch.attempts.at(-1).payload.venues.length, 4);
  assert.equal(batch.attempts.at(-1).payload.venues[0].days.length, 21);
});

test('publishes fourteen Barnard days when the optional third week is unavailable', async () => {
  let currentUrl = '';
  let barnardWeek = 0;
  let nextClicks = 0;
  const barnardWeeks = ['2026-08-23', '2026-08-30']
    .map(date => readFileSync(new URL(`./fixtures/barnard-dining-hours-week-${date}.html`, import.meta.url), 'utf8'));
  const page = {
    async goto(url) {
      currentUrl = url;
      return { status: () => 200 };
    },
    url() { return currentUrl; },
    async title() { return 'Barnard Dining Hours'; },
    locator() { return { async innerText() { return ''; } }; },
    async waitForFunction() {},
    async evaluate() { return `stable-week-${barnardWeek}`; },
    async content() { return barnardWeeks[barnardWeek]; },
    async waitForTimeout() {},
    getByRole() {
      return {
        first() {
          return {
            async count() { return 1; },
            async isEnabled() { return barnardWeek === 0; },
            async click() { barnardWeek += 1; nextClicks += 1; },
          };
        },
      };
    },
  };

  const attempt = await acquireBarnardHoursAttempt(page, new Date('2026-08-24T12:00:00Z'));

  assert.equal(attempt.result, 'success');
  assert.equal(attempt.payload.windowStart, '2026-08-23');
  assert.equal(attempt.payload.windowEnd, '2026-09-05');
  assert.ok(attempt.payload.venues.every(({ days }) => days.length === 14));
  assert.equal(nextClicks, 1);
});

test('allows a passive 403 challenge to clear and isolates one that remains', async () => {
  let currentUrl = '';
  let laborChallengeActive = true;
  let laborArticleRead = false;
  let fallArticleRead = false;
  const challengeWaits = [];
  const articleByPath = new Map([
    ['/news/new-student-orientation-program-nsop-2026-dining-service', readFileSync(new URL('./fixtures/dining-nsop-2026.html', import.meta.url), 'utf8')],
    ['/news/labor-day-2026-operating-hours', readFileSync(new URL('./fixtures/dining-labor-day-2026.html', import.meta.url), 'utf8')],
    ['/news/fall-2026-operating-hours', readFileSync(new URL('./fixtures/dining-fall-2026.html', import.meta.url), 'utf8')],
  ]);
  const page = {
    async goto(url) {
      currentUrl = url;
      return {
        status: () => /labor-day|fall-2026/.test(new URL(url).pathname) ? 403 : 200,
      };
    },
    url() { return currentUrl; },
    async title() {
      const challenged = (currentUrl.includes('labor-day') && laborChallengeActive)
        || currentUrl.includes('fall-2026');
      return challenged ? 'Just a moment...' : 'Columbia Dining';
    },
    async waitForFunction() {},
    async waitForTimeout(value) {
      if (value === 12_000) {
        challengeWaits.push(currentUrl);
        if (currentUrl.includes('labor-day')) laborChallengeActive = false;
      }
    },
    async evaluate() { return JSON.stringify(completeDataset()); },
    locator(selector) {
      return {
        async innerText() {
          const challenged = (currentUrl.includes('labor-day') && laborChallengeActive)
            || currentUrl.includes('fall-2026');
          return challenged ? 'Performing security verification' : '';
        },
        async count() { return selector === '#main-article' ? 1 : 0; },
        async innerHTML() {
          if (currentUrl.includes('labor-day')) laborArticleRead = true;
          if (currentUrl.includes('fall-2026')) fallArticleRead = true;
          return articleByPath.get(new URL(currentUrl).pathname);
        },
      };
    },
  };
  const chromiumImpl = {
    async launch() {
      return {
        async newPage() { return page; },
        async close() {},
      };
    },
  };
  const directory = await mkdtemp(join(tmpdir(), 'lionhour-dining-challenge-'));
  const batch = await scrapeDiningHours({
    outputPath: join(directory, 'attempts.json'),
    now: new Date('2026-08-21T12:00:00Z'),
    chromiumImpl,
  });

  assert.equal(batch.attempts[2].sourceId, 'labor-day-2026');
  assert.equal(batch.attempts[2].result, 'success');
  assert.equal(batch.attempts[3].sourceId, 'fall-2026');
  assert.equal(batch.attempts[3].result, 'failure');
  assert.equal(batch.attempts[3].failureCode, 'challenge');
  assert.equal(laborArticleRead, true);
  assert.equal(fallArticleRead, false);
  assert.equal(challengeWaits.length, 2);
});

test('records source acquisition failures and closes Chromium', async () => {
  let closed = false;
  const chromiumImpl = {
    async launch() {
      return {
        async newPage() {
          return {
            async goto() { throw new Error('challenge did not complete'); },
          };
        },
        async close() { closed = true; },
      };
    },
  };
  const directory = await mkdtemp(join(tmpdir(), 'lionhour-dining-failed-'));
  const batch = await scrapeDiningHours({ outputPath: join(directory, 'attempts.json'), chromiumImpl });
  assert.ok(batch.attempts.every(attempt => attempt.result === 'failure'));
  assert.ok(batch.attempts.every(attempt => attempt.failureCode === 'navigation'));
  assert.equal(closed, true);
});
