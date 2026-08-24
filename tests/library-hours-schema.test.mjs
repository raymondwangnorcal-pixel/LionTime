import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLibraryHoursSnapshot } from '../lib/library-hours-schema.js';
import { makeValidSnapshot } from './helpers/library-hours-fixture.mjs';

test('accepts a complete current snapshot', () => {
  assert.equal(validateLibraryHoursSnapshot(makeValidSnapshot()).ok, true);
});

test('rejects malformed hours without coercing them to closed', () => {
  const snapshot = makeValidSnapshot();
  snapshot.libraries[0].schedules[0].hours['4'].open = '9 AM';
  const result = validateLibraryHoursSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /HH:MM/);
});

test('rejects missing libraries, untrusted URLs, scrape failures, and bad closure shape', () => {
  const snapshot = makeValidSnapshot();
  snapshot.libraries.pop();
  snapshot.libraries[0].url = 'https://example.com/hours';
  snapshot.libraries[1].scrapeFailed = true;
  snapshot.libraries[2].temporarilyClosed = true;
  const result = validateLibraryHoursSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing required library/);
  assert.match(result.errors.join('\n'), /must use hours\.library\.columbia\.edu/);
  assert.match(result.errors.join('\n'), /scrape failed/);
  assert.match(result.errors.join('\n'), /temporarily closed schedule/);
});

test('rejects schedules that do not cover the generated Eastern date', () => {
  const snapshot = makeValidSnapshot();
  snapshot.libraries[0].schedules[0].end = '2026-08-19';
  assert.match(validateLibraryHoursSnapshot(snapshot).errors.join('\n'), /no schedule covers generated date/);
});

test('rejects overnight hours for libraries other than Butler', () => {
  const snapshot = makeValidSnapshot();
  const lehman = snapshot.libraries.find((library) => library.id === 'lehman');
  lehman.schedules[0].hours['1'] = { open: '21:00', close: '17:00' };
  assert.match(validateLibraryHoursSnapshot(snapshot).errors.join('\n'), /lehman: overnight hours are not allowed/);
});

test('accepts only the explicit Lehman embedded-fallback shape', () => {
  const snapshot = makeValidSnapshot();
  const lehman = snapshot.libraries.find((library) => library.id === 'lehman');
  Object.assign(lehman, {
    useEmbeddedFallback: true,
    fallbackReason: 'unapproved-overnight-hours',
    schedules: [],
  });
  assert.equal(validateLibraryHoursSnapshot(snapshot).ok, true);

  lehman.id = 'avery';
  const result = validateLibraryHoursSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /embedded fallback is not allowed/);
});

test('requires exact Barnard holiday provenance only on Milstein', () => {
  const snapshot = makeValidSnapshot();
  const milstein = snapshot.libraries.find((library) => library.id === 'barnard');
  delete milstein.holidayUrl;
  assert.match(validateLibraryHoursSnapshot(snapshot).errors.join('\n'), /holidayUrl/);

  milstein.holidayUrl = 'https://example.com/visit/hours';
  assert.match(validateLibraryHoursSnapshot(snapshot).errors.join('\n'), /holidayUrl/);

  milstein.holidayUrl = 'https://library.barnard.edu/visit/hours';
  snapshot.libraries.find((library) => library.id === 'avery').holidayUrl = milstein.holidayUrl;
  assert.match(validateLibraryHoursSnapshot(snapshot).errors.join('\n'), /only barnard may use holidayUrl/);
});
