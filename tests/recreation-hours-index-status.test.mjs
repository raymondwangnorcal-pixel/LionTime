import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const start = html.indexOf("const DAY_NAMES = ['Sunday'");
const end = html.indexOf('/* ══════════════════════════════════════════════════\n   STATE', start);
if (start < 0 || end < 0) throw new Error('could not isolate the index status engine');

const sandbox = { Intl, Date };
vm.runInNewContext(`${html.slice(start, end)}\nglobalThis.recreationStatusApi = { getStatus, todayHoursText };`, sandbox);
const { getStatus, todayHoursText } = sandbox.recreationStatusApi;

test('uses a timed Recreation restriction only during its Eastern-day window', () => {
  const venue = {
    hours: { 5: [['10:00', '12:00'], ['14:00', '18:00']] },
    sourceStatuses: { 5: null },
    sourceRestrictions: { 5: [{
      intervals: [['12:00', '14:00']],
      status: 'Closed for maintenance',
      reason: 'Annual maintenance',
    }] },
  };

  assert.equal(getStatus(venue, { dow: 5, mins: 630 }).label, 'Open');
  assert.equal(getStatus(venue, { dow: 5, mins: 780 }).label, 'Closed for maintenance');
  assert.equal(getStatus(venue, { dow: 5, mins: 900 }).label, 'Open');
});

test('uses a concise Closed badge when Today explains a seasonal dining closure', () => {
  const venue = {
    hours: { 5: [] },
    sourceStatuses: { 5: 'Closed for Summer' },
  };
  const now = { dow: 5, mins: 720 };

  assert.equal(todayHoursText(venue, now), 'Closed for Summer');
  assert.equal(getStatus(venue, now).label, 'Closed');
});
