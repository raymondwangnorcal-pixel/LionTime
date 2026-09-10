import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { parseBookstoreSource, parseHealthSource, parseLernerSource, parseMailSource } from '../lib/student-services-source-parser.js';

const fixture = name => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('parses Lerner baseline and only a directly linked official calendar', () => {
  const evidence = parseLernerSource({ homeHtml: fixture('student-services-lerner-home.html'),
    calendarHtml: fixture('student-services-lerner-calendar.html'), calendarUrl: 'https://lernerhall.columbia.edu/events' });
  assert.deepEqual(evidence[0].intervals, [['07:30', '20:00']]);
  assert.equal(evidence.at(-1).exactDate, '2024-05-16');
  assert.throws(() => parseLernerSource({ homeHtml: fixture('student-services-lerner-home.html'),
    calendarHtml: '', calendarUrl: 'https://example.com/events' }), /provenance/);
  const embeddedText = Array.from({ length: 14 }, (_unused, index) => {
    const date = new Date(Date.UTC(2026, 7, 23 + index));
    const label = date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' });
    return `All day, 9:00 AM - 5:00 PM, Calendar: Abbreviated Hours , No location, ${label}`;
  }).join('\n');
  const embedded = parseLernerSource({ homeHtml: fixture('student-services-lerner-home.html'),
    calendarText: embeddedText,
    calendarUrl: 'https://calendar.google.com/calendar/embed?title=Lerner%20Hall%20Operating%20Hours&src=official-calendar-id' });
  assert.equal(embedded.at(-1).exactDate, '2026-09-05');
});

test('parses Mail seasonal ranges and exact Labor Day closure without Administrative Mail', () => {
  const evidence = parseMailSource(fixture('student-services-mail.html'));
  assert.ok(evidence.every(item => item.targetId === 'mail-center'));
  assert.equal(evidence.find(item => item.exactDate === '2026-09-07').status, 'Closed');
});

test('parses seven distinct Health services and preserves access modes', () => {
  const evidence = parseHealthSource(fixture('student-services-health.html'));
  assert.equal(new Set(evidence.map(item => item.targetId)).size, 7);
  assert.ok(evidence.some(item => item.targetId === 'alice-health' && item.type === 'office-hours'));
  assert.ok(evidence.some(item => item.targetId === 'student-insurance' && item.type === 'walk-in'));
  assert.ok(evidence.some(item => item.targetId === 'immunization' && item.type === 'virtual-only'));
});

test('parses the live Drupal text shapes without relying on fixture data attributes', () => {
  const mailEvidence = parseMailSource(fixture('student-services-mail-live.html'));
  assert.ok(mailEvidence.some(item => item.exactDate === '2026-09-07' && item.status === 'Closed'));
  const healthEvidence = parseHealthSource(fixture('student-services-health-live.html'));
  assert.deepEqual([...new Set(healthEvidence.map(item => item.targetId))].sort(), [
    'alice-health', 'caps', 'disability', 'immunization', 'medical', 'student-insurance', 'svr',
  ]);
  assert.ok(healthEvidence.some(item => item.targetId === 'caps' && item.type === 'phone-support'));
  assert.ok(healthEvidence.some(item => item.targetId === 'student-insurance' && item.type === 'walk-in'));
});

test('requires the exact official Bookstore identity and seven weekdays', () => {
  const data = fixture('student-services-bookstore.json');
  assert.equal(parseBookstoreSource(data).length, 7);
  assert.throws(() => parseBookstoreSource(data.replace('45552', 'other')), /identity/);
  const visible = parseBookstoreSource(fixture('student-services-bookstore-live.txt'));
  assert.equal(visible.length, 7);
  assert.deepEqual(visible.find(item => item.weekdays[0] === 1).intervals, [['09:00', '18:00']]);
});

test('parses the Fall 2026 Health page: seasonal heading and split Alice! office hours', () => {
  const evidence = parseHealthSource(fixture('student-services-health-fall-2026.html'));
  assert.deepEqual([...new Set(evidence.map(item => item.targetId))].sort(), [
    'alice-health', 'caps', 'disability', 'immunization', 'medical', 'student-insurance', 'svr',
  ]);
  const alice = evidence.filter(item => item.targetId === 'alice-health' && item.type === 'office-hours');
  assert.deepEqual(alice.map(item => [item.weekdays, item.intervals]), [
    [[1, 2, 3, 4], [['09:00', '18:00']]],
    [[5], [['09:00', '17:00']]],
  ]);
  assert.deepEqual(evidence.find(item => item.targetId === 'caps' && item.type === 'walk-in').intervals, [['17:30', '20:00']]);
  assert.deepEqual(evidence.find(item => item.targetId === 'student-insurance' && item.weekdays[0] === 2).intervals, [['13:00', '15:00']]);
});

test('parses the Mail page after Check-In Week has dropped off it', () => {
  const evidence = parseMailSource(fixture('student-services-mail-fall-2026.html'));
  assert.ok(evidence.every(item => item.targetId === 'mail-center'));
  assert.ok(!evidence.some(item => item.reason === 'Check-In Week'));
  const rushMonday = evidence.find(item => item.reason === 'Fall Rush' && item.weekdays.includes(1));
  assert.deepEqual(rushMonday.intervals, [['11:00', '20:00']]);
  const regularTuesday = evidence.find(item => item.reason === 'Regular Fall Hours' && item.weekdays.includes(2));
  assert.deepEqual(regularTuesday.intervals, [['09:00', '19:00']]);
});
