import assert from 'node:assert/strict';
import test from 'node:test';

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

function acquiredFixture() {
  return {
    generated: new Date('2026-08-21T16:00:00-04:00'),
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
  return {
    targetId: 'dodge',
    sourceId: 'columbiaHours',
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
    ...overrides,
  };
}
