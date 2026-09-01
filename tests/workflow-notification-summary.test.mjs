import assert from 'node:assert/strict';
import test from 'node:test';

import { formatNotificationSummary } from '../scripts/workflow-notification-summary.mjs';

const generated = '2026-08-26T16:58:00.000Z';

test('formats a published Library result with live and embedded counts', () => {
  const summary = formatNotificationSummary('library', {
    generated,
    generatedDisplay: 'August 26, 2026 at 12:58 PM',
    libraries: [{ id: 'butler' }, { id: 'lehman', useEmbeddedFallback: true }, { id: 'avery' }],
  }, { publishEnabled: true });

  assert.equal(summary, 'Library hours updated: August 26, 2026 at 12:58 PM ET · 2 of 3 live; 1 library using embedded schedules');
});

test('formats a validated-but-unpublished Dining batch', () => {
  const summary = formatNotificationSummary('dining', {
    generated,
    attempts: [{ result: 'success' }, { result: 'failure' }, { result: 'success' }],
  }, { publishEnabled: false });

  assert.equal(summary, 'Dining hours validated: Aug 26, 2026, 12:58 PM ET · publication disabled; 2 of 3 sources live');
});

test('formats Recreation facilities and Student Life source counts', () => {
  assert.equal(formatNotificationSummary('recreation', { generated, facilities: [{ id: 'dodge' }, { id: 'uris-pool' }, { id: 'barnard-fitness' }] }, { publishEnabled: true }), 'Recreation hours updated: Aug 26, 2026, 12:58 PM ET · 3 of 3 live');
  assert.equal(formatNotificationSummary('student-life', { generated, attempts: [{ result: 'success' }, { result: 'success' }, { result: 'failure' }, { result: 'success' }] }, { publishEnabled: true }), 'Student Life hours updated: Aug 26, 2026, 12:58 PM ET · 3 of 4 sources live');
});

test('includes access-denied buildings in Recreation notification', () => {
  const summary = formatNotificationSummary('recreation', {
    generated,
    facilities: [{ id: 'dodge' }, { id: 'uris-pool' }, { id: 'barnard-fitness' }],
    accessDenied: [
      { id: 'dodge', name: 'Dodge Fitness Center' },
      { id: 'uris-pool', name: 'Uris Pool' },
    ],
  }, { publishEnabled: true });

  assert.ok(summary.startsWith('Recreation hours updated: Aug 26, 2026, 12:58 PM ET · 1 of 3 live'));
  assert.ok(summary.includes('⚠️ Access denied: Dodge Fitness Center, Uris Pool'));
});

test('rejects unsupported snapshots', () => {
  assert.throws(() => formatNotificationSummary('unknown', { generated }, { publishEnabled: true }), /unsupported notification kind/);
  assert.throws(() => formatNotificationSummary('library', { generated, libraries: [] }, { publishEnabled: true }), /library snapshot/);
});
