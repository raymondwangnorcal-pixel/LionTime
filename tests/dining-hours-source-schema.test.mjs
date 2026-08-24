import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDiningAttemptBatch } from '../lib/dining-hours-source-schema.js';
import { makeValidDiningAttemptBatch } from './helpers/dining-hours-fixture.mjs';

test('accepts successful and challenged Dining source attempts independently', () => {
  const batch = makeValidDiningAttemptBatch({ failures: ['labor-day-2026', 'fall-2026'] });
  assert.equal(validateDiningAttemptBatch(batch).ok, true);
});

test('accepts a six-source batch with either fourteen or twenty-one Barnard days', () => {
  const full = makeValidDiningAttemptBatch({ schemaVersion: 3, generated: '2026-08-24T12:00:00.000Z' });
  assert.equal(validateDiningAttemptBatch(full).ok, true);

  const twoWeeks = structuredClone(full);
  const barnard = twoWeeks.attempts.at(-1).payload;
  barnard.windowEnd = '2026-09-05';
  for (const venue of barnard.venues) venue.days = venue.days.slice(0, 14);
  assert.equal(validateDiningAttemptBatch(twoWeeks).ok, true);
});

test('rejects malformed Barnard coverage and venue identity', () => {
  const coverage = makeValidDiningAttemptBatch({ schemaVersion: 3, generated: '2026-08-24T12:00:00.000Z' });
  coverage.attempts.at(-1).payload.venues[0].days.pop();
  assert.match(validateDiningAttemptBatch(coverage).errors.join('\n'), /days must match Barnard coverage/);

  const identity = makeValidDiningAttemptBatch({ schemaVersion: 3, generated: '2026-08-24T12:00:00.000Z' });
  identity.attempts.at(-1).payload.venues[0].id = 'lefrak-byte-kiosk';
  assert.match(validateDiningAttemptBatch(identity).errors.join('\n'), /invalid Barnard identity/);
});

test('rejects mismatched sources, unbounded failures, and malformed retained evidence', () => {
  const source = makeValidDiningAttemptBatch();
  source.attempts[0].sourceUrl = 'https://example.com/hours';
  assert.match(validateDiningAttemptBatch(source).errors.join('\n'), /source identity/);

  const failure = makeValidDiningAttemptBatch({ failures: ['labor-day-2026'] });
  failure.attempts[2].failureCode = 'cloudflare said something arbitrary';
  assert.match(validateDiningAttemptBatch(failure).errors.join('\n'), /failure code/);

  const payload = makeValidDiningAttemptBatch();
  payload.attempts[3].payload.venues.ferris['2'] = [['not-a-time', '20:00']];
  assert.match(validateDiningAttemptBatch(payload).errors.join('\n'), /HH:MM/);

  const cafeEast = makeValidDiningAttemptBatch();
  cafeEast.attempts[4].payload.weekdays['6'] = [['19:30', '11:00']];
  assert.match(validateDiningAttemptBatch(cafeEast).errors.join('\n'), /must increase/);
});
