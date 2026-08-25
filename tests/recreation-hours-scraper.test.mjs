import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { validateRecreationHoursSnapshot } from '../lib/recreation-hours-schema.js';
import { runRecreationScraper } from '../scripts/recreation-hours-scraper.mjs';

test('acquires, parses, resolves, validates, and writes one snapshot', async () => {
  const writes = [];
  const result = await runRecreationScraper({
    acquire: async () => acquiredFixture(),
    parsers: parserFixture(),
    writeJson: async (path, value) => writes.push([path, value]),
    outputPath: '/tmp/recreation.json',
  });

  assert.equal(result.facilities.length, 3);
  assert.equal(result.facilities.find(item => item.id === 'dodge').spaces.length, 5);
  assert.deepEqual(writes, [['/tmp/recreation.json', result]]);
});

test('does not write when parsing yields an incomplete snapshot', async () => {
  let wrote = false;

  await assert.rejects(runRecreationScraper({
    acquire: async () => acquiredFixture(),
    parsers: invalidParserFixture(),
    writeJson: async () => { wrote = true; },
    outputPath: '/tmp/recreation.json',
  }), /invalid recreation snapshot/i);

  assert.equal(wrote, false);
});

test('turns sanitized current acquired pages into a conservative valid snapshot', async () => {
  const writes = [];
  const pages = Object.fromEntries(await Promise.all([
    ['columbiaHours', 'recreation-columbia-hours.html'],
    ['columbiaModifications', 'recreation-columbia-modifications.html'],
    ['barnardFitness', 'recreation-barnard-hours.html'],
  ].map(async ([sourceId, fixture]) => [sourceId, {
    url: `https://official.example/${sourceId}`,
    html: await readFile(new URL(`./fixtures/${fixture}`, import.meta.url), 'utf8'),
  }])));
  pages.columbiaHours.activityCalendars = Object.fromEntries(await Promise.all([
    ['blue-gym', 'Blue Gym', 'recreation-blue-gym-calendar.txt'],
    ['levien-gymnasium', null, 'recreation-levien-calendar.txt'],
    ['aerobics-room-4', 'Aerobics Room 4 Open Recreation', 'recreation-aerobics-calendar.txt'],
    ['functional-fitness-studio', 'Functional Fitness Studio Open Recreation', 'recreation-functional-fitness-calendar.txt'],
  ].map(async ([targetId, title, fixture]) => [targetId, {
    result: 'success',
    targetId,
    calendarUrl: `https://calendar.google.com/calendar/embed?ctz=America%2FNew_York${title ? `&title=${encodeURIComponent(title)}` : ''}&src=official-calendar-id`,
    weeks: [await readFile(new URL(`./fixtures/${fixture}`, import.meta.url), 'utf8')],
  }])));

  const snapshot = await runRecreationScraper({
    acquire: async () => ({ generated: new Date('2026-08-21T16:00:00-04:00'), pages }),
    writeJson: async (path, value) => writes.push([path, value]),
    outputPath: '/tmp/current-recreation.json',
  });

  assert.equal(validateRecreationHoursSnapshot(snapshot).ok, true);
  assert.equal(snapshot.facilities.length, 3);
  const dodge = snapshot.facilities.find(item => item.id === 'dodge');
  const barnard = snapshot.facilities.find(item => item.id === 'barnard-fitness');
  assert.equal(dodge.spaces.length, 5);
  assert.equal(dodge.days[0].status, 'Closed for maintenance');
  assert.deepEqual(dodge.days[0].intervals, []);
  const reopeningDay = dodge.days.find(day => day.date === '2026-08-24');
  const blueReopeningDay = dodge.spaces.find(space => space.id === 'blue-gym').days
    .find(day => day.date === '2026-08-24');
  const levienReopeningDay = dodge.spaces.find(space => space.id === 'levien-gymnasium').days
    .find(day => day.date === '2026-08-24');
  const aerobicsReopeningDay = dodge.spaces.find(space => space.id === 'aerobics-room-4').days
    .find(day => day.date === '2026-08-24');
  const functionalReopeningDay = dodge.spaces.find(space => space.id === 'functional-fitness-studio').days
    .find(day => day.date === '2026-08-24');
  assert.deepEqual(reopeningDay.restrictions, []);
  assert.deepEqual(blueReopeningDay.restrictions, []);
  assert.deepEqual(reopeningDay.intervals, [['06:00', '22:00']]);
  assert.deepEqual(blueReopeningDay.intervals, [['06:00', '09:30'], ['10:00', '16:00']]);
  assert.deepEqual(levienReopeningDay.intervals, [['17:30', '21:45']]);
  assert.equal(aerobicsReopeningDay.status, 'Closed for maintenance');
  assert.deepEqual(functionalReopeningDay.intervals, [['06:00', '10:00'], ['12:00', '15:00'], ['16:30', '21:45']]);
  assert.equal(barnard.days[0].status, 'Hours need verification');
  assert.deepEqual(barnard.days[0].intervals, []);
  assert.deepEqual(writes, [['/tmp/current-recreation.json', snapshot]]);
});

test('applies the bounded Barnard Fitness manual override confirmed on August 24', async () => {
  const snapshot = await runRecreationScraper({
    acquire: async () => acquiredFixture(new Date('2026-08-24T20:00:00-04:00')),
    parsers: parserFixture(),
    writeJson: async () => {},
    outputPath: '/tmp/barnard-manual-override.json',
  });
  const barnard = snapshot.facilities.find(item => item.id === 'barnard-fitness');
  const day = date => barnard.days.find(item => item.date === date);

  assert.deepEqual(day('2026-08-24').intervals, []);
  assert.equal(day('2026-08-24').status, 'Closed');
  assert.deepEqual(day('2026-08-25').intervals, [['09:00', '14:00']]);
  assert.deepEqual(day('2026-08-26').intervals, [['09:00', '19:00']]);
  assert.deepEqual(day('2026-08-27').intervals, [['09:00', '19:00']]);
  assert.deepEqual(day('2026-08-28').intervals, []);
  assert.equal(day('2026-08-28').status, 'Closed');
  assert.deepEqual(day('2026-09-06').intervals, []);
  assert.equal(day('2026-09-06').status, 'Closed');
  assert.ok(day('2026-08-25').sourceRefs.includes('barnardManualOverride'));
  assert.ok(day('2026-08-25').evidenceRefs.includes('barnardManualOverride:barnard-fitness'));
});

test('expires the Barnard Fitness override after September 7', async () => {
  const parsers = {
    ...parserFixture(),
    parseBarnardHours: () => [evidence({
      targetId: 'barnard-fitness',
      sourceId: 'barnardFitness',
      effectiveStart: null,
      effectiveEnd: null,
      weeklyIntervals: null,
      dateIntervals: null,
      unavailableStatus: 'Hours need verification',
      availabilityType: 'facility-hours',
      accessRestrictions: ['Barnard students, faculty, and staff'],
    })],
  };
  const snapshot = await runRecreationScraper({
    acquire: async () => acquiredFixture(new Date('2026-09-07T12:00:00-04:00')),
    parsers,
    writeJson: async () => {},
    outputPath: '/tmp/barnard-manual-override-expiry.json',
  });
  const barnard = snapshot.facilities.find(item => item.id === 'barnard-fitness');
  const day = date => barnard.days.find(item => item.date === date);

  assert.equal(day('2026-09-07').status, 'Closed');
  assert.equal(day('2026-09-08').status, 'Hours need verification');
  assert.deepEqual(day('2026-09-08').intervals, []);
  assert.deepEqual(day('2026-09-08').sourceRefs, ['barnardFitness']);
});

function acquiredFixture(generated = new Date('2026-08-21T16:00:00-04:00')) {
  return {
    generated,
    pages: {
      columbiaHours: { url: 'https://perec.columbia.edu/hours-operation', html: '<main>hours</main>' },
      columbiaModifications: { url: 'https://perec.columbia.edu/content/modified-hours-closures', html: '<main>changes</main>' },
      barnardFitness: { url: 'https://barnard.edu/lefrak-center/physical-well-being', html: '<main>barnard</main>' },
    },
  };
}

function parserFixture() {
  return {
    parseColumbiaHours: () => [
      evidence({ targetId: 'dodge', sourceId: 'columbiaHours', availabilityType: 'facility-hours' }),
      evidence({ targetId: 'uris-pool', sourceId: 'columbiaHours', availabilityType: 'lap-swim' }),
    ],
    parseColumbiaModifications: () => [evidence({
      targetId: 'blue-gym',
      sourceId: 'columbiaModifications',
      priority: 1,
      weeklyIntervals: null,
      dateIntervals: [],
      status: 'Closed for Athletics event',
      reason: 'Varsity practice',
      availabilityType: 'open-recreation',
    })],
    parseBarnardHours: () => [evidence({
      targetId: 'barnard-fitness', sourceId: 'barnardFitness', availabilityType: 'facility-hours',
    })],
  };
}

function invalidParserFixture() {
  return {
    ...parserFixture(),
    parseBarnardHours: () => [],
  };
}

function evidence(overrides = {}) {
  const targetId = overrides.targetId || 'dodge';
  const sourceId = overrides.sourceId || 'columbiaHours';
  return {
    targetId,
    sourceId,
    evidenceRef: `${sourceId}:${targetId}`,
    priority: 3,
    effectiveStart: '2026-08-17',
    effectiveEnd: '2026-12-23',
    weeklyIntervals: {
      0: [['06:00', '23:00']], 1: [['06:00', '23:00']], 2: [['06:00', '23:00']],
      3: [['06:00', '23:00']], 4: [['06:00', '23:00']], 5: [['06:00', '23:00']],
      6: [['06:00', '23:00']],
    },
    dateIntervals: null,
    status: null,
    reason: null,
    availabilityType: 'facility-hours',
    accessRestrictions: [],
    sourceUpdatedAt: null,
    unavailableStatus: null,
    ...overrides,
  };
}
