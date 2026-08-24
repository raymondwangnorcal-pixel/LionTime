import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDiningAttemptBatch } from '../lib/dining-hours-source-schema.js';
import { makeValidDiningAttemptBatch } from './helpers/dining-hours-fixture.mjs';

test('accepts successful and challenged Dining source attempts independently', () => {
  const batch = makeValidDiningAttemptBatch({ failures: ['labor-day-2026', 'fall-2026'] });
  assert.equal(validateDiningAttemptBatch(batch).ok, true);
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
});

