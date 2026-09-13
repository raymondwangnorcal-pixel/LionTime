import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  EXPECTED_UNRESOLVED,
  MAX_SNAPSHOT_AGE_MS,
  auditAll,
  auditCategory,
  describeAudit,
} from '../lib/hours-audit.js';

const NOW = new Date('2026-09-13T06:00:00.000Z');
const FRESH = '2026-09-13T05:00:00.000Z';
const THREE_DAYS_OLD = '2026-09-10T19:35:42.635Z';

const days = (count, day) => Array.from({ length: count }, (_, index) => ({ date: `2026-09-${13 + index}`, ...day }));
const audit = (category, snapshot) => auditCategory({ category, snapshot, now: NOW }).findings;
const kinds = findings => findings.map(finding => `${finding.kind}${finding.id ? `:${finding.id}` : ''}`);

test('a fresh snapshot with hours everywhere reports nothing', () => {
  assert.deepEqual(audit('recreation', {
    generated: FRESH,
    facilities: [{ id: 'dodge', days: days(14, { intervals: [['06:00', '24:00']], status: null }), spaces: [] }],
  }), []);
});

test('the three-day publish freeze is reported as stale', () => {
  const findings = audit('dining', {
    generated: THREE_DAYS_OLD,
    locations: [{ id: 'ferris', days: days(14, { intervals: [['07:30', '20:00']], status: null }) }],
  });
  assert.deepEqual(kinds(findings), ['stale']);
  assert.match(findings[0].detail, /2\.4d ago/);
  assert.match(findings[0].detail, /budget is 24\.0h/);
});

test('a venue unresolved across the whole window is reported, a venue merely closed today is not', () => {
  const findings = audit('recreation', {
    generated: FRESH,
    facilities: [
      { id: 'uris-pool', days: days(14, { intervals: [], status: 'Hours need verification' }), spaces: [] },
      // Closed every day is a real answer from the source, not a blind spot.
      { id: 'winter-rink', days: days(14, { intervals: [], status: 'Closed' }), spaces: [] },
      {
        id: 'dodge',
        days: days(14, { intervals: [['06:00', '24:00']], status: null }),
        spaces: [{ id: 'levien-gymnasium', days: [
          ...days(7, { intervals: [], status: 'Separate hours not published' }),
          ...days(7, { intervals: [['18:00', '22:00']], status: null }),
        ] }],
      },
    ],
  });
  assert.deepEqual(kinds(findings), ['unresolved:uris-pool']);
  assert.match(findings[0].detail, /no hours on any of the 14 published days/);
});

test('an allowlisted venue stays quiet and carries its reason', () => {
  const findings = audit('recreation', {
    generated: FRESH,
    facilities: [{ id: 'dodge', days: days(14, { intervals: [['06:00', '24:00']] }), spaces: [
      { id: 'squash-courts', days: days(14, { intervals: [], status: 'Separate hours not published' }) },
    ] }],
  });
  assert.deepEqual(findings, []);
  assert.match(EXPECTED_UNRESOLVED['recreation:squash-courts'], /reservations only/);
});

test('student services counts an explicit Closed as an answer and a bare day as a blind spot', () => {
  const findings = audit('student-services', {
    generated: FRESH,
    sources: [{
      sourceId: 'health',
      venues: [
        { id: 'medical', days: days(14, { availabilities: [{ type: 'office-hours', intervals: [['09:00', '17:00']] }] }) },
        { id: 'caps', days: days(14, { availabilities: [{ type: 'office-hours', intervals: [], status: 'Closed' }] }) },
        { id: 'svr', days: days(14, { availabilities: [{ type: 'office-hours', intervals: [], status: 'Needs verification' }] }) },
      ],
    }],
  });
  assert.deepEqual(kinds(findings), ['unresolved:svr']);
});

test('library schedules are judged on the week, not on dated days', () => {
  assert.deepEqual(audit('library', {
    generated: FRESH,
    libraries: [{ id: 'butler', schedules: [{ hours: { 0: { open: '09:00', close: '24:00' }, 1: null } }] }],
  }), []);
  assert.deepEqual(kinds(audit('library', {
    generated: FRESH,
    libraries: [{ id: 'barnard', schedules: [] }],
  })), ['unresolved:barnard']);
});

test('a missing or timestampless snapshot is reported rather than passing quietly', () => {
  assert.deepEqual(kinds(audit('dining', null)), ['unreadable']);
  assert.deepEqual(kinds(audit('dining', { locations: [] })), ['unreadable', 'empty-snapshot']);
});

test('auditAll rolls the categories up and describeAudit names every finding', () => {
  const result = auditAll({
    now: NOW,
    snapshots: {
      library: { generated: FRESH, libraries: [{ id: 'butler', schedules: [{ hours: { 0: { open: '09:00', close: '24:00' } } }] }] },
      recreation: { generated: THREE_DAYS_OLD, facilities: [{ id: 'uris-pool', days: days(14, { intervals: [], status: 'Hours need verification' }), spaces: [] }] },
    },
  });
  assert.equal(result.ok, false);

  const message = describeAudit(result);
  assert.match(message, /recreation — stale/);
  assert.match(message, /recreation \/ uris-pool — unresolved/);
  assert.doesNotMatch(message, /library/);

  assert.match(describeAudit(auditAll({ now: NOW, snapshots: {} })), /every published snapshot is fresh/);
});

test('the freshness budget matches the stated SLO and is overridable', () => {
  assert.equal(MAX_SNAPSHOT_AGE_MS, 24 * 60 * 60 * 1000);
  const snapshot = { generated: '2026-09-13T00:00:00.000Z', locations: [{ id: 'ferris', days: days(14, { intervals: [['07:30', '20:00']] }) }] };
  assert.deepEqual(auditCategory({ category: 'dining', snapshot, now: NOW }).findings, []);
  assert.deepEqual(
    kinds(auditCategory({ category: 'dining', snapshot, now: NOW, maxAgeMs: 3_600_000 }).findings),
    ['stale'],
  );
});

test('the audit workflow reports through Telegram and stays quiet when clean', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/audit-published-hours.yml', import.meta.url), 'utf8');
  assert.match(workflow, /audit-published-hours\.mjs/);
  assert.match(workflow, /cron: '7 \*\/6 \* \* \*'/);
  assert.match(workflow, /needs\.audit\.result != 'success'/);
  assert.match(workflow, /source_label: Hours audit/);
  assert.doesNotMatch(workflow, /LIBRARY_HOURS_UPDATE_SECRET|ANTHROPIC_API_KEY/);
  assert.doesNotMatch(workflow, /contents: write/);
});
