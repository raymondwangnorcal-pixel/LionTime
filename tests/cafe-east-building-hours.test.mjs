import assert from 'node:assert/strict';
import test from 'node:test';

import {
  LERNER_CLOSED_STATUS,
  applyLernerHoursToCafeEast,
  lernerDaysFromStudentServices,
} from '../lib/cafe-east-building-hours.js';
import { createDiningHoursService } from '../lib/dining-hours-service.js';
import { validateDiningHoursSnapshot } from '../lib/dining-hours-schema.js';
import { makeValidDiningSnapshotV4 } from './helpers/dining-hours-fixture.mjs';

const NOW = new Date('2026-08-22T12:00:00Z');

// Lerner as the Student Life feed publishes it: 08-21 regular, 08-22 closed (as on
// Thanksgiving 2026), 08-23 closing at 6 PM, 08-24 with no evidence.
function studentLife({ lastSuccessAt = '2026-08-21T12:00:00.000Z' } = {}) {
  const day = (date, availabilities) => ({ date, availabilities, sourceRefs: ['lerner'], evidenceRefs: [] });
  return {
    sources: [{
      sourceId: 'lerner', lastSuccessAt, venues: [{
        id: 'lerner',
        days: [
          day('2026-08-21', [{ type: 'open-access', intervals: [['00:00', '00:30']], status: null, reason: null },
            { type: 'open-access', intervals: [['07:30', '24:00']], status: null, reason: 'Regular Hours' }]),
          day('2026-08-22', [{ type: 'open-access', intervals: [], status: 'Closed', reason: 'Thanksgiving' }]),
          day('2026-08-23', [{ type: 'open-access', intervals: [['09:00', '18:00']], status: null, reason: null }]),
          day('2026-08-24', []),
        ],
      }],
    }],
  };
}

const cafe = snapshot => snapshot.locations.find(location => location.id === 'cafe-east');
const on = (snapshot, date) => cafe(snapshot).days.find(day => day.date === date);

test('Café East closes when Lerner is closed and is clipped to Lerner hours otherwise', () => {
  const snapshot = makeValidDiningSnapshotV4();
  const adjusted = applyLernerHoursToCafeEast(snapshot, lernerDaysFromStudentServices(studentLife(), NOW));

  assert.deepEqual(on(adjusted, '2026-08-21').intervals, [['10:30', '19:30']]);
  assert.deepEqual(on(adjusted, '2026-08-22').intervals, []);
  assert.equal(on(adjusted, '2026-08-22').status, LERNER_CLOSED_STATUS);
  assert.deepEqual(on(adjusted, '2026-08-23').intervals, [['11:00', '18:00']]);
  assert.deepEqual(on(adjusted, '2026-08-24'), on(snapshot, '2026-08-24'));
  assert.ok(validateDiningHoursSnapshot(adjusted).ok);
  // Nothing else in the snapshot changes, and the input is not mutated.
  assert.deepEqual(adjusted.locations.filter(location => location.id !== 'cafe-east'),
    snapshot.locations.filter(location => location.id !== 'cafe-east'));
  assert.deepEqual(on(snapshot, '2026-08-22').intervals, [['11:00', '19:30']]);
});

test('a Student Life snapshot over a week old is not trusted', () => {
  const days = lernerDaysFromStudentServices(studentLife({ lastSuccessAt: '2026-08-10T12:00:00.000Z' }), NOW);
  assert.equal(days.size, 0);
  const snapshot = makeValidDiningSnapshotV4();
  assert.equal(applyLernerHoursToCafeEast(snapshot, days), snapshot);
});

test('the Dining API applies Lerner hours on GET and falls back when Lerner is unavailable', async () => {
  const snapshot = makeValidDiningSnapshotV4();
  const store = { async getSnapshot() { return structuredClone(snapshot); }, async putSnapshot() {} };

  const withLerner = createDiningHoursService({
    store, updateSecret: 'secret', buildingHours: async () => lernerDaysFromStudentServices(studentLife(), NOW),
  });
  const served = await withLerner.handle({ method: 'GET' });
  assert.equal(served.status, 200);
  assert.equal(on(served.body, '2026-08-22').status, LERNER_CLOSED_STATUS);

  const quiet = { error() {} };
  const failing = createDiningHoursService({
    store, updateSecret: 'secret', logger: quiet, buildingHours: async () => { throw new Error('redis down'); },
  });
  const fallback = await failing.handle({ method: 'GET' });
  assert.equal(fallback.status, 200);
  assert.deepEqual(on(fallback.body, '2026-08-22').intervals, [['11:00', '19:30']]);
});
