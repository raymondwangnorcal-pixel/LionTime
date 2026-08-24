import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { resolveStudentServicesSource } from '../lib/student-services-hours-resolver.js';
import { parseHealthSource, parseMailSource } from '../lib/student-services-source-parser.js';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('resolves fourteen Eastern dates and exact Mail closure before recurring hours', () => {
  const result = resolveStudentServicesSource({ sourceId: 'mail', evidence: parseMailSource(fixture('student-services-mail.html')),
    generated: new Date('2026-08-31T16:00:00Z') });
  assert.equal(result.windowStart, '2026-08-31');
  assert.equal(result.windowEnd, '2026-09-13');
  assert.equal(result.venues[0].days.length, 14);
  const labor = result.venues[0].days.find(day => day.date === '2026-09-07');
  assert.equal(labor.availabilities[0].status, 'Closed');
});

test('keeps Health sibling availability separate and preserves overlapping access modes', () => {
  const result = resolveStudentServicesSource({ sourceId: 'health', evidence: parseHealthSource(fixture('student-services-health.html')),
    generated: new Date('2026-08-24T12:00:00-04:00') });
  assert.equal(result.venues.length, 7);
  const monday = result.venues.find(venue => venue.id === 'student-insurance').days[0];
  assert.deepEqual(monday.availabilities.map(item => item.type), ['appointment-only', 'walk-in']);
});

test('surfaces conflicting same-type official evidence instead of guessing', () => {
  const evidence = parseMailSource(fixture('student-services-mail.html'));
  evidence.push({ ...evidence[0], intervals: [['13:00', '16:00']], evidenceRef: 'mail:mail-center:conflict' });
  assert.throws(() => resolveStudentServicesSource({ sourceId: 'mail', evidence,
    generated: new Date('2026-08-24T12:00:00-04:00') }), /ambiguous/);
});
