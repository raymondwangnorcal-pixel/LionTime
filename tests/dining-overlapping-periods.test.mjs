/**
 * Columbia lets a location's hours periods overlap, and on 2026-09-20 reading only the
 * first period that covered a date was wrong three different ways on the live site:
 * Faculty House 2nd Floor published breakfast and hid lunch and dinner; The Fac Shack
 * published nothing for fourteen days because its normal period excluded them; and a short
 * override period (holiday hours, a private-event closure) lost to the semester one.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDiningSnapshot, periodsForDate } from '../scripts/dining-hours-scraper.mjs';
import { DINING_LOCATION_MAP } from '../scripts/dining-hours-scraper.mjs';

const GENERATED = new Date('2026-09-20T16:00:00Z'); // Sunday, Eastern

function period({ from, to, displayed, days = {}, excluded = [] }) {
  return { date_from: from, date_to: to, displayed_hours: [{ title: displayed }], excluded, days: [days] };
}

/** Every mapped location must exist, so unrelated ones get a single inert period. */
function dataset(sourceId, periods) {
  return {
    nodes: Object.entries(DINING_LOCATION_MAP).map(([id, mapping]) => ({
      nid: id,
      title: mapping.name,
      open_hours_fields: String(id) === String(sourceId) ? periods : [period({
        from: '2026-01-01T05:00:00', to: '2026-12-31T04:59:59', displayed: 'Closed for the year',
      })],
    })),
  };
}

const daysOf = (snapshot, id) => snapshot.locations.find(location => location.id === id).days;
const on = (snapshot, id, date) => daysOf(snapshot, id).find(day => day.date === date);

test('concurrent meal periods are published together, not just the first', () => {
  // Faculty House 2nd Floor: breakfast, lunch and dinner, each its own period, same range
  // (Columbia ends two on Dec 30 and one on Dec 31, so the tier allows a few days' slack).
  const snapshot = buildDiningSnapshot(dataset(7351, [
    period({ from: '2026-09-08T04:00:00', to: '2026-12-30T04:59:59', displayed: 'Open for Breakfast Monday - Thursday 7:30 a.m. - 11:00 a.m.', days: { days_monday: [{ hours_from: '730', hours_to: '1100' }] } }),
    period({ from: '2026-09-08T04:00:00', to: '2026-12-30T04:59:59', displayed: 'Open for Lunch Monday - Thursday, 11:00 a.m. - 2:30 p.m.', days: { days_monday: [{ hours_from: '1100', hours_to: '1430' }] } }),
    period({ from: '2026-09-08T04:00:00', to: '2026-12-31T04:59:59', displayed: 'Open Monday - Thursday for Dinner from 5:00 p.m. - 9:00 p.m.', days: { days_monday: [{ hours_from: '1700', hours_to: '2100' }] } }),
  ]), GENERATED);

  const monday = on(snapshot, 'facultyhouse', '2026-09-21');
  assert.deepEqual(monday.intervals, [['07:30', '14:30'], ['17:00', '21:00']]);
  // The status joins the periods' own wording and stays within cleanStatus's 160-character
  // cap, so a long third sentence is dropped there — the intervals above carry the hours.
  assert.match(monday.status, /Breakfast/);
  assert.match(monday.status, /Lunch/);
  assert.ok(monday.status.length <= 160, monday.status);

  // Sunday is in none of the three, so it is closed — not "Open for Breakfast Monday…".
  assert.deepEqual(on(snapshot, 'facultyhouse', '2026-09-20'), {
    date: '2026-09-20', intervals: [], status: 'Closed',
  });
});

test('an excluded date falls through to the period written for it', () => {
  // The Fac Shack, 2026-09-17..10-01: same hours, different place, its own period.
  const snapshot = buildDiningSnapshot(dataset(7487, [
    period({
      from: '2026-09-08T04:00:00',
      to: '2026-12-31T01:00:00',
      displayed: 'Open Monday - Thursday, 12 p.m. - 8 p.m. & Sunday, 3 - 8 p.m.',
      excluded: ['2026-09-20', '2026-09-21'],
      days: { days_sunday: [{ hours_from: '1500', hours_to: '2000' }], days_monday: [{ hours_from: '1200', hours_to: '2000' }] },
    }),
    period({
      from: '2026-09-17T04:00:00',
      to: '2026-10-01T03:59:00',
      displayed: 'Meals available for pick-up on the first floor of Faculty House',
      days: { days_sunday: [{ hours_from: '1500', hours_to: '2000' }], days_monday: [{ hours_from: '1200', hours_to: '2000' }] },
    }),
  ]), GENERATED);

  const sunday = on(snapshot, 'facshack', '2026-09-20');
  assert.deepEqual(sunday.intervals, [['15:00', '20:00']]);
  assert.equal(sunday.status, 'Meals available for pick-up on the first floor of Faculty House');
});

test('a short override period wins over the semester schedule, in both directions', () => {
  const semester = period({ from: '2026-09-04T04:00:00', to: '2026-12-31T04:59:59', displayed: 'Open Monday - Friday, 7:30 a.m. - 8:00 p.m.', days: { days_monday: [{ hours_from: '730', hours_to: '2000' }] } });

  const holiday = buildDiningSnapshot(dataset(12, [
    semester,
    period({ from: '2026-09-21T04:00:00', to: '2026-09-22T03:59:59', displayed: 'Modified Hours for Labor Day Holiday', days: { days_monday: [{ hours_from: '900', hours_to: '2000' }] } }),
  ]), GENERATED);
  assert.deepEqual(on(holiday, 'ferris', '2026-09-21').intervals, [['09:00', '20:00']]);

  const closed = buildDiningSnapshot(dataset(12, [
    semester,
    period({ from: '2026-09-21T04:00:00', to: '2026-09-22T03:59:59', displayed: 'Closed for a private event' }),
  ]), GENERATED);
  assert.deepEqual(on(closed, 'ferris', '2026-09-21'), {
    date: '2026-09-21', intervals: [], status: 'Closed for a private event',
  });
});

test('a date every period excludes is closed, and a date no period covers is unpublished', () => {
  const snapshot = buildDiningSnapshot(dataset(7355, [
    period({
      from: '2026-09-21T04:00:00',
      to: '2026-09-22T03:59:59',
      displayed: 'Open Monday - Thursday, 11 a.m. - 7:30 p.m.',
      excluded: ['2026-09-21'],
      days: { days_monday: [{ hours_from: '1100', hours_to: '1930' }] },
    }),
  ]), GENERATED);

  assert.deepEqual(on(snapshot, 'gracedodge', '2026-09-21'), {
    date: '2026-09-21', intervals: [], status: 'Closed',
  });
  assert.deepEqual(on(snapshot, 'gracedodge', '2026-09-23'), {
    date: '2026-09-23', intervals: [], status: 'Hours not published',
  });
});

test('periodsForDate keeps the tier that decides the date', () => {
  const broad = period({ from: '2026-09-01T04:00:00', to: '2026-12-31T04:59:59', displayed: 'Semester' });
  const narrow = period({ from: '2026-09-20T04:00:00', to: '2026-09-21T03:59:59', displayed: 'Override' });
  assert.deepEqual(periodsForDate([broad, narrow], '2026-09-20').map(p => p.displayed_hours[0].title), ['Override']);
  assert.deepEqual(periodsForDate([broad, narrow], '2026-09-25').map(p => p.displayed_hours[0].title), ['Semester']);
  assert.deepEqual(periodsForDate([], '2026-09-20'), []);
});
