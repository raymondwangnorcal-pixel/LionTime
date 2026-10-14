import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const venuesStart = html.indexOf('const D = (mon, tue, wed, thu, fri, sat, sun)');
const venuesEnd = html.indexOf('/* ══════════════════════════════════════════════════\n   TIME HELPERS', venuesStart);
const start = html.indexOf("const DAY_NAMES = ['Sunday'");
const end = html.indexOf('/* ══════════════════════════════════════════════════\n   STATE', start);
if (venuesStart < 0 || venuesEnd < 0 || start < 0 || end < 0) throw new Error('could not isolate the index status engine');

const sandbox = { Intl, Date, window: {} };
vm.runInNewContext(`${html.slice(venuesStart, venuesEnd)}\n${html.slice(start, end)}
globalThis.statusApi = { VENUES, ALL, getStatus, todayHoursText, fmtRange };`, sandbox);
const { VENUES, ALL, getStatus, todayHoursText, fmtRange } = sandbox.statusApi;
const venue = id => VENUES.find(item => item.id === id);

test('a venue open around the clock every day never shows an invented closing time', () => {
  // Embedded shape and the live library feed's "Open 24 hours" shape (00:00-00:00).
  for (const hours of [ALL([['00:00', '24:00']]), ALL([['00:00', '00:00']])]) {
    const butler = { ...venue('butler'), hours };
    for (const now of [{ dow: 2, mins: 20 * 60 }, { dow: 5, mins: 23 * 60 + 30 }, { dow: 6, mins: 3 * 60 }]) {
      const status = getStatus(butler, now);
      assert.equal(status.status, 'open');
      assert.equal(status.detail, 'Open 24/7');
      assert.equal(todayHoursText(butler, now), 'Open 24 hours');
    }
  }
  assert.equal(fmtRange(['00:00', '00:00']), 'Open 24 hours');
});

test('embedded library hours follow the Fall 2026 schedule including 3 AM closes', () => {
  const noco = venue('noco');
  // Tuesday 1 AM: still inside Monday's 9 AM - 3 AM block.
  const late = getStatus(noco, { dow: 2, mins: 60 });
  assert.equal(late.status, 'open');
  assert.match(late.detail, /3 AM/);
  // Saturday 1 AM: Friday closed at 11 PM.
  assert.equal(getStatus(noco, { dow: 6, mins: 60 }).status, 'closed');
  assert.match(getStatus(venue('avery'), { dow: 2, mins: 22 * 60 }).detail, /11 PM/);
  assert.match(getStatus(venue('math'), { dow: 6, mins: 13 * 60 }).detail, /5 PM/);
  assert.match(getStatus(venue('uris'), { dow: 3, mins: 23 * 60 }).detail, /3 AM/);
  assert.match(getStatus(venue('lehman'), { dow: 0, mins: 12 * 60 }).detail, /10 PM/);
});

test('overnight spill uses the real previous day when the overlay supplies it', () => {
  // A live overlay fills slots today..today+6, so Thursday's slot (dow 4) before
  // Friday Oct 30 actually holds next Thursday's normal 12 PM - 10 AM.
  const jjs = { ...venue('jjs'), hours: { 0: [['10:00', '19:00']], 1: [['10:00', '19:00']], 2: [['10:00', '19:00']],
    3: [['12:00', '10:00']], 4: [['12:00', '10:00']], 5: [['10:00', '19:00']], 6: [['10:00', '19:00']] } };
  const fridayOneAm = { dow: 5, mins: 60 };
  assert.equal(getStatus(jjs, fridayOneAm).status, 'open', 'without the real yesterday the next-week slot leaks in');
  const withPrior = { ...jjs, previousDayHours: { dow: 4, intervals: [['12:00', '20:00']] } };
  assert.equal(getStatus(withPrior, fridayOneAm).status, 'closed');
  assert.match(getStatus(withPrior, fridayOneAm).detail, /10 AM today/);
  // A stale previous day for another weekday is ignored.
  const stale = { ...jjs, previousDayHours: { dow: 2, intervals: [] } };
  assert.equal(getStatus(stale, fridayOneAm).status, 'open');
});
