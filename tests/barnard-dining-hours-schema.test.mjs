import assert from 'node:assert/strict';
import test from 'node:test';

import { validateBarnardDiningHoursSnapshot } from '../lib/barnard-dining-hours-schema.js';
import { makeValidBarnardDiningSnapshot } from './helpers/dining-hours-fixture.mjs';

test('accepts the exact retained Barnard Dining projection', () => {
  const snapshot = makeValidBarnardDiningSnapshot();
  const validation = validateBarnardDiningHoursSnapshot(snapshot);

  assert.equal(validation.ok, true);
  assert.equal(validation.value, snapshot);
});

test('rejects untrusted provenance, missing venues, and malformed days', () => {
  const cases = [
    (snapshot) => { snapshot.source = 'https://example.com/hours'; },
    (snapshot) => { snapshot.venues.pop(); },
    (snapshot) => { snapshot.venues[0].days[0].date = '2026-08-31'; },
    (snapshot) => { snapshot.venues[0].days[0].intervals = [['12:00', '11:00'], ['11:30', '13:00']]; },
    (snapshot) => {
      const openDay = snapshot.venues[0].days.find(({ intervals }) => intervals.length);
      openDay.status = 'Closed';
    },
  ];

  for (const mutate of cases) {
    const snapshot = makeValidBarnardDiningSnapshot();
    mutate(snapshot);
    assert.equal(validateBarnardDiningHoursSnapshot(snapshot).ok, false);
  }
});
