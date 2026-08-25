import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  parseBarnardHours,
  parseActivityCalendar,
  parseColumbiaHours,
  parseColumbiaModifications,
  isSafeEmptyColumbiaModificationsPage,
} from '../lib/recreation-source-parser.js';
import { resolveRecreationSnapshot } from '../lib/recreation-hours-resolver.js';

test('current Columbia DOM preserves maintenance and rejects unbounded seasonal times', async () => {
  const html = await readFixture('recreation-columbia-hours.html');
  const evidence = parseColumbiaHours(html);

  const dodgeUnavailable = find(evidence, 'dodge', item => item.unavailableStatus === 'Hours need verification');
  assert.equal(dodgeUnavailable.weeklyIntervals, null);
  assert.equal(dodgeUnavailable.evidenceRef, 'columbiaHours:dodge');
  assert.equal(find(evidence, 'uris-pool').unavailableStatus, 'Hours need verification');
  assert.equal(find(evidence, 'blue-gym').unavailableStatus, 'Hours need verification');
  assert.equal(find(evidence, 'squash-courts').unavailableStatus, 'Separate hours not published');

  const maintenance = evidence.filter(item => item.status === 'Closed for maintenance');
  assert.equal(maintenance.length, 8);
  assert.deepEqual(find(maintenance, 'dodge', item => item.effectiveStart === '2026-08-21').dateIntervals, []);
  assert.deepEqual(find(maintenance, 'dodge', item => item.effectiveStart === '2026-08-24').dateIntervals, [['00:00', '06:00']]);
  assert.equal(maintenance[0].reason, 'Annual maintenance week');
});

test('bounds the current Columbia schedule from an exact adjacent semester transition', () => {
  const generated = new Date('2026-08-24T13:00:00-04:00');
  const evidence = parseColumbiaHours(columbiaTransitionHtml(), { generated });

  for (const targetId of ['dodge', 'uris-pool']) {
    const item = find(evidence, targetId);
    assert.equal(item.effectiveStart, '2026-08-24');
    assert.equal(item.effectiveEnd, '2026-09-04');
    assert.equal(item.priority, 3);
    assert.deepEqual(item.weeklyIntervals['1'], [['06:00', '22:00']]);
  }
  for (const targetId of ['blue-gym', 'levien-gymnasium', 'aerobics-room-4', 'functional-fitness-studio']) {
    assert.equal(find(evidence, targetId).unavailableStatus, 'Hours need verification');
  }
  assert.equal(find(evidence, 'squash-courts').unavailableStatus, 'Separate hours not published');
});

test('rejects a malformed Columbia semester transition instead of inferring bounds', () => {
  const generated = new Date('2026-08-24T13:00:00-04:00');
  const malformed = columbiaTransitionHtml().replace(
    'Saturday, September 5th',
    'Sunday, September 6th',
  );

  assert.equal(find(parseColumbiaHours(malformed, { generated }), 'dodge').unavailableStatus, 'Hours need verification');
});

test('derives Blue Gym openings and a bounded Dodge envelope from the official calendar', async () => {
  const calendarText = await readFixture('recreation-blue-gym-calendar.txt');
  const evidence = parseActivityCalendar({
    targetId: 'blue-gym',
    calendarUrl: blueGymCalendarUrl(),
    weeks: [calendarText],
  }, { generated: new Date('2026-08-24T13:00:00-04:00') });

  assert.deepEqual(find(evidence, 'blue-gym', item => item.effectiveStart === '2026-08-24').dateIntervals, [
    ['06:00', '09:30'],
    ['10:00', '16:00'],
  ]);
  assert.deepEqual(find(evidence, 'dodge', item => item.effectiveStart === '2026-08-24').dateIntervals, [['06:00', '22:00']]);
  assert.deepEqual(find(evidence, 'blue-gym', item => item.effectiveStart === '2026-09-05').dateIntervals, [
    ['08:00', '12:30'],
    ['19:00', '21:45'],
  ]);
  assert.deepEqual(find(evidence, 'dodge', item => item.effectiveStart === '2026-09-05').dateIntervals, [['08:00', '22:00']]);
  assert.equal(evidence.some(item => item.effectiveStart === '2026-08-23'), false);
  assert.ok(evidence.filter(item => item.targetId === 'blue-gym').every(item => item.priority === 2));
  assert.ok(evidence.filter(item => item.targetId === 'dodge').every(item => item.priority === 4));
});

test('parses open recreation and explicit closures from each official activity calendar', async () => {
  const generated = new Date('2026-08-24T13:00:00-04:00');
  const cases = [
    {
      targetId: 'levien-gymnasium',
      fixture: 'recreation-levien-calendar.txt',
      calendarUrl: activityCalendarUrl(),
      openDate: '2026-08-24',
      intervals: [['17:30', '21:45']],
      closedDate: '2026-08-27',
      closedStatus: 'Closed for maintenance',
    },
    {
      targetId: 'aerobics-room-4',
      fixture: 'recreation-aerobics-calendar.txt',
      calendarUrl: activityCalendarUrl('Aerobics Room 4 Open Recreation'),
      closedDate: '2026-08-24',
      closedStatus: 'Closed for maintenance',
    },
    {
      targetId: 'functional-fitness-studio',
      fixture: 'recreation-functional-fitness-calendar.txt',
      calendarUrl: activityCalendarUrl('Functional Fitness Studio Open Recreation'),
      openDate: '2026-08-24',
      intervals: [['06:00', '10:00'], ['12:00', '15:00'], ['16:30', '21:45']],
    },
  ];

  for (const item of cases) {
    const evidence = parseActivityCalendar({
      targetId: item.targetId,
      calendarUrl: item.calendarUrl,
      weeks: [await readFixture(item.fixture)],
    }, { generated });
    if (item.openDate) {
      assert.deepEqual(find(evidence, item.targetId, candidate => candidate.effectiveStart === item.openDate).dateIntervals, item.intervals);
    }
    if (item.closedDate) {
      const closure = find(evidence, item.targetId, candidate => candidate.effectiveStart === item.closedDate);
      assert.deepEqual(closure.dateIntervals, []);
      assert.equal(closure.status, item.closedStatus);
    }
    assert.equal(evidence.some(candidate => candidate.targetId === 'dodge'), false);
  }
});

test('rejects mismatched calendar URLs and event identities', async () => {
  const calendarText = await readFixture('recreation-blue-gym-calendar.txt');

  assert.deepEqual(parseActivityCalendar({
    targetId: 'blue-gym',
    calendarUrl: 'https://calendar.google.com/calendar/embed?ctz=America%2FNew_York&title=Uris%20Pool&src=cuperec%40gmail.com',
    weeks: [calendarText],
  }, { generated: new Date('2026-08-24T13:00:00-04:00') }), []);
  assert.deepEqual(parseActivityCalendar({
    targetId: 'levien-gymnasium',
    calendarUrl: activityCalendarUrl(),
    weeks: [calendarText],
  }, { generated: new Date('2026-08-24T13:00:00-04:00') }), []);
});

test('parses specific closures, reasons, and maintenance without guessing', async () => {
  const html = columbiaDatedModificationsHtml();
  const evidence = parseColumbiaModifications(html);

  assert.deepEqual(find(evidence, 'levien-gymnasium'), {
    targetId: 'levien-gymnasium',
    sourceId: 'columbiaModifications',
    evidenceRef: 'columbiaModifications:levien-gymnasium',
    priority: 1,
    effectiveStart: '2026-08-21',
    effectiveEnd: '2026-08-21',
    weeklyIntervals: null,
    dateIntervals: [],
    status: 'Closed for Athletics event',
    reason: 'Varsity practice',
    availabilityType: 'open-recreation',
    accessRestrictions: [],
    sourceUpdatedAt: null,
    unavailableStatus: null,
  });
  assert.equal(find(evidence, 'uris-pool').status, 'Closed for maintenance');
  assert.deepEqual(find(evidence, 'blue-gym').dateIntervals, [['16:00', '18:00']]);
  assert.equal(find(evidence, 'blue-gym').availabilityType, 'reservation-required');
});

test('rejects a date section instead of dropping an unsupported known-target sibling', async () => {
  const html = await readFixture('recreation-columbia-modifications-partial-known-target.html');

  assert.deepEqual(parseColumbiaModifications(html), []);
  assert.equal(isSafeEmptyColumbiaModificationsPage(html), false);
});

test('safe-empty rejects a known target beneath an unrecognized sibling section', async () => {
  const html = await readFixture('recreation-columbia-modifications-unrecognized-section.html');

  assert.deepEqual(parseColumbiaModifications(html), []);
  assert.equal(isSafeEmptyColumbiaModificationsPage(html), false);
});

test('recognizes the current recurring-closures layout without widening an uncataloged area', async () => {
  const html = await readFixture('recreation-columbia-modifications.html');

  assert.deepEqual(parseColumbiaModifications(html), []);
  assert.equal(isSafeEmptyColumbiaModificationsPage(html), true);

  const knownTarget = parseColumbiaModifications(html.replace(
    'Middle Tri Level (Fitness Area)',
    'Blue Gym',
  ));
  assert.equal(find(knownTarget, 'blue-gym').unavailableStatus, 'Hours need verification');
  assert.equal(find(knownTarget, 'blue-gym').evidenceRef, 'columbiaModifications:blue-gym');
  assert.equal(find(knownTarget, 'blue-gym').weeklyIntervals, null);
  assert.equal(isSafeEmptyColumbiaModificationsPage(html.replace(
    'Middle Tri Level (Fitness Area)',
    'Blue Gym',
  )), false);
});

test('rejects modifications with unsupported or non-increasing time-limited wording', () => {
  for (const notice of [
    'Reservation required from four PM to six PM',
    'Reservation required from 5 PM - 9 AM',
    'Closed for maintenance from 9 AM - 9 AM',
  ]) {
    assert.deepEqual(parseColumbiaModifications(columbiaModificationHtml(notice)), []);
  }
});

test('rejects modifications with multiple or unmatched temporal expressions', () => {
  for (const notice of [
    'Reservation required from 4 PM - 6 PM and 7 PM - 8 PM',
    'Closed for maintenance from 9 AM - 11 AM; reopens at 1 PM',
  ]) {
    assert.deepEqual(parseColumbiaModifications(columbiaModificationHtml(notice)), []);
  }
});

test('rejects a supported range followed by an unsupported 24-hour clock cue', () => {
  const notice = 'Reservation required from 4 PM - 6 PM; reopens at 19:00';

  assert.deepEqual(parseColumbiaModifications(columbiaModificationHtml(notice)), []);
});

test('rejects a supported range followed by an unsupported named time cue', () => {
  const notice = 'Closed for maintenance from 9 AM - 11 AM; reopens at noon';

  assert.deepEqual(parseColumbiaModifications(columbiaModificationHtml(notice)), []);
});

test('current Barnard DOM publishes verification instead of unbounded seasonal times', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const item = find(parseBarnardHours(html), 'barnard-fitness');

  assert.deepEqual(item.accessRestrictions, ['Barnard students, faculty, and staff']);
  assert.equal(item.weeklyIntervals, null);
  assert.equal(item.dateIntervals, null);
  assert.equal(item.unavailableStatus, 'Hours need verification');
  assert.equal(item.evidenceRef, 'barnardFitness:barnard-fitness');
});

test('publishes the displayed Barnard schedule after September 8 and notes a stale seasonal heading', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const generated = new Date('2026-09-08T08:00:00-04:00');
  const stale = find(parseBarnardHours(html, { generated }), 'barnard-fitness');

  assert.equal(stale.effectiveStart, '2026-09-08');
  assert.equal(stale.effectiveEnd, '2026-09-21');
  assert.deepEqual(stale.weeklyIntervals['2'], [['09:00', '19:00']]);
  assert.equal(stale.unavailableStatus, null);
  assert.equal(stale.reason, "Barnard's seasonal heading may be outdated.");

  const updated = find(parseBarnardHours(
    html.replaceAll('Summer 2026', 'Fall 2026'),
    { generated },
  ), 'barnard-fitness');
  assert.deepEqual(updated.weeklyIntervals['2'], [['09:00', '19:00']]);
  assert.equal(updated.reason, null);
});

test('rejects partial Barnard schedules and missing trusted access copy', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const generated = new Date('2026-09-08T08:00:00-04:00');

  assert.deepEqual(parseBarnardHours(
    html.replace(/\s*<strong>Saturday and Sunday<\/strong>:[^<]+/, ''),
    { generated },
  ), []);
  assert.deepEqual(parseBarnardHours(
    html.replace('open to Barnard students, faculty, and staff', 'open to the campus community'),
    { generated },
  ), []);
});

test('rejects an unparsed Barnard weekday row instead of ignoring a closure', async () => {
  const html = (await readFixture('recreation-barnard-hours.html')).replace(
    '</p>',
    '<br><strong>Monday</strong>: Closed for Labor Day</p>',
  );

  assert.deepEqual(parseBarnardHours(html, {
    generated: new Date('2026-09-08T08:00:00-04:00'),
  }), []);
});

test('does not prefill Barnard live hours before September 8 even when the page has dates', async () => {
  const html = (await readFixture('recreation-barnard-hours.html'))
    .replace('</h3>', '</h3><p>Effective August 1, 2026 through September 30, 2026.</p>');
  const item = find(parseBarnardHours(html, {
    generated: new Date('2026-09-07T08:00:00-04:00'),
  }), 'barnard-fitness');

  assert.equal(item.weeklyIntervals, null);
  assert.equal(item.unavailableStatus, 'Hours need verification');
});

test('uses the rolling window and stale-heading note for dated Barnard pages after September 8', async () => {
  const html = (await readFixture('recreation-barnard-hours.html'))
    .replace('</h3>', '</h3><p>Effective August 1, 2026 through September 30, 2026.</p>');
  const item = find(parseBarnardHours(html, {
    generated: new Date('2026-09-08T08:00:00-04:00'),
  }), 'barnard-fitness');

  assert.equal(item.effectiveStart, '2026-09-08');
  assert.equal(item.effectiveEnd, '2026-09-21');
  assert.equal(item.reason, "Barnard's seasonal heading may be outdated.");
});

test('rejects Barnard seasonal headings that are not relevant to the generated date', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const generated = new Date('2026-09-08T08:00:00-04:00');

  for (const heading of ['Spring 2025', 'Winter 2099', 'Spring 2026']) {
    assert.deepEqual(parseBarnardHours(
      html.replaceAll('Summer 2026', heading),
      { generated },
    ), [], heading);
  }
});

test('does not restore the stale-heading note after Barnard changes to Fall 2026', async () => {
  const html = (await readFixture('recreation-barnard-hours.html'))
    .replaceAll('Summer 2026', 'Fall 2026');
  const item = find(parseBarnardHours(html, {
    generated: new Date('2026-12-01T08:00:00-05:00'),
  }), 'barnard-fitness');

  assert.equal(item.reason, null);
});

test('keeps the approved Summer 2026 schedule live with a warning after November', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const item = find(parseBarnardHours(html, {
    generated: new Date('2026-12-01T08:00:00-05:00'),
  }), 'barnard-fitness');

  assert.deepEqual(item.weeklyIntervals['2'], [['09:00', '19:00']]);
  assert.equal(item.reason, "Barnard's seasonal heading may be outdated.");
});

test('preserves Barnard provenance and access after an explicit range ends mid-window', async () => {
  const html = (await readFixture('recreation-barnard-hours.html'))
    .replace('</h3>', '</h3><p>Effective August 1, 2026 through September 10, 2026.</p>');
  const generated = new Date('2026-09-08T08:00:00-04:00');
  const snapshot = resolveRecreationSnapshot({
    evidence: parseBarnardHours(html, { generated }),
    generated,
  });
  const barnard = snapshot.facilities.find(facility => facility.id === 'barnard-fitness');
  const afterRange = barnard.days.find(day => day.date === '2026-09-11');

  assert.equal(afterRange.status, 'Hours need verification');
  assert.deepEqual(afterRange.accessRestrictions, ['Barnard students, faculty, and staff']);
  assert.deepEqual(afterRange.sourceRefs, ['barnardFitness']);
  assert.deepEqual(afterRange.evidenceRefs, ['barnardFitness:barnard-fitness']);
});

test('rejects multiple or partially malformed Barnard effective-date claims', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const generated = new Date('2026-09-08T08:00:00-04:00');
  for (const claim of [
    'Effective August 1, 2026 through September 30, 2026. Effective October 1, 2026 through December 1, 2026.',
    'Effective August 1, 2026 through September 30, 2026. Effective TBD.',
  ]) {
    assert.deepEqual(parseBarnardHours(
      html.replace('</h3>', `</h3><p>${claim}</p>`),
      { generated },
    ), [], claim);
  }
});

test('retains an explicit Barnard ID requirement as a separate access restriction', async () => {
  const html = (await readFixture('recreation-barnard-hours.html'))
    .replace('Barnard students, faculty, and staff', 'Barnard ID required')
    .replace('</h3>', '</h3><p>Effective August 1, 2026 through September 30, 2026.</p>');
  const item = find(parseBarnardHours(html, {
    generated: new Date('2026-09-08T08:00:00-04:00'),
  }), 'barnard-fitness');

  assert.deepEqual(item.accessRestrictions, ['Barnard ID required']);
  assert.deepEqual(item.weeklyIntervals['1'], [['09:00', '19:00']]);
});

test('uses exact Barnard bounds only when they cover the rolling scrape date', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const generated = new Date('2026-09-08T08:00:00-04:00');
  const cases = [
    ['stale', 'Effective May 1, 2026 through July 31, 2026.', false],
    ['future', 'Effective September 20, 2026 through December 20, 2026.', false],
    ['current', 'Effective August 1, 2026 through September 30, 2026.', true],
  ];

  const ambiguous = resolveRecreationSnapshot({ evidence: parseBarnardHours(html, { generated }), generated });
  assert.equal(facilityDay(ambiguous, 'barnard-fitness').status, null);
  assert.deepEqual(facilityDay(ambiguous, 'barnard-fitness').intervals, [['09:00', '19:00']]);

  for (const [label, bounds, publishesTimes] of cases) {
    const bounded = html.replace('</h3>', `</h3><p>${bounds}</p>`);
    const snapshot = resolveRecreationSnapshot({ evidence: parseBarnardHours(bounded, { generated }), generated });
    const resolved = facilityDay(snapshot, 'barnard-fitness');
    assert.equal(resolved.intervals.length > 0, publishesTimes, label);
    assert.equal(resolved.status, publishesTimes ? null : 'Hours need verification', label);
  }
});

test('does not merge modification evidence into a Columbia baseline', () => {
  const hours = columbiaSeasonalHtml('Effective August 17, 2026 through December 20, 2026.');
  const modifications = columbiaDatedModificationsHtml();

  assert.equal(find(parseColumbiaHours(hours), 'dodge').status, null);
  assert.equal(find(parseColumbiaModifications(modifications), 'blue-gym').weeklyIntervals, null);
});

test('publishes verification for an unlabeled season and rejects malformed explicit ranges', () => {
  const ambiguous = find(parseColumbiaHours(columbiaSeasonalHtml('')), 'dodge');
  assert.equal(ambiguous.unavailableStatus, 'Hours need verification');
  assert.equal(ambiguous.weeklyIntervals, null);

  for (const range of [
    'Effective February 30, 2026 through March 3, 2026.',
    'Effective August 17, 2026 through.',
    'Effective December 20, 2026 through August 17, 2026.',
  ]) {
    assert.deepEqual(parseColumbiaHours(columbiaSeasonalHtml(range)), []);
  }
});

test('reads a valid Columbia date range from its bounded label in a large seasonal slice', () => {
  const html = columbiaSeasonalHtml('Effective August 17, 2026 through December 20, 2026.')
    .replace('</div></div></main>', `<p>${'x'.repeat(501)}</p></div></div></main>`);

  assert.equal(find(parseColumbiaHours(html), 'dodge').effectiveEnd, '2026-12-20');
});

test('rejects malformed weekday labels instead of treating them as split sessions', () => {
  const html = columbiaSeasonalHtml('Effective August 17, 2026 through December 20, 2026.', `
    <tr><td>Monday</td><td>6 AM - 11 PM</td></tr>
    <tr><td>Holiday schedule</td><td>9 AM - 5 PM</td></tr>
  `);

  assert.deepEqual(find(parseColumbiaHours(html), 'dodge').weeklyIntervals['1'], [['06:00', '23:00']]);
});

test('rejects equal and backwards schedule intervals', () => {
  for (const hours of ['9 AM - 9 AM', '5 PM - 9 AM']) {
    const html = columbiaSeasonalHtml('Effective August 17, 2026 through December 20, 2026.', `
      <tr><td>Monday</td><td>${hours}</td></tr>
    `);
    assert.deepEqual(parseColumbiaHours(html), []);
  }
});

const readFixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

function find(items, targetId, predicate = () => true) {
  const item = items.find(candidate => candidate.targetId === targetId && predicate(candidate));
  assert.ok(item, `missing evidence for ${targetId}`);
  return item;
}

function facilityDay(snapshot, targetId) {
  return snapshot.facilities.find(facility => facility.id === targetId).days[0];
}

function columbiaSeasonalHtml(range, rows = '<tr><td>Monday</td><td>6 AM - 11 PM</td></tr>') {
  return `<main><div class="paragraph paragraph--type--cu-page-slice"><div class="container">
    <h2>Fall 2026 Facility Hours</h2><p>${range}</p>
    <div class="paragraph paragraph--type--table"><h3>Fall Session Building Hours</h3>
      <table><tbody>${rows}</tbody></table>
    </div>
  </div></div></main>`;
}

function columbiaTransitionHtml() {
  return `<main><article>
    <p>Dodge Fitness Center will be operating on its Summer session schedule through Friday, September 4th.</p>
    <p>On Saturday, September 5th, we will resume Fall Semester operating hours.</p>
    <div class="paragraph paragraph--type--cu-page-slice"><div class="container">
      <h2>Summer 2026 Facility Hours</h2>
      <div class="paragraph paragraph--type--table"><h3>Summer Session Building Hours</h3>
        <table><tbody><tr><td>Monday</td><td>6 AM - 10 PM</td></tr></tbody></table>
      </div>
      <div class="paragraph paragraph--type--table"><h3>Uris Pool</h3>
        <table><tbody><tr><td>Monday</td><td>6 AM - 10 PM</td></tr></tbody></table>
      </div>
      <section class="paragraph"><h2>Open Recreation and Activity Spaces</h2>
        <section class="paragraph--type--cu-tabbed-content-tab"><h3>Blue Gym</h3><iframe src="https://calendar.google.com/calendar/embed"></iframe></section>
        <section class="paragraph--type--cu-tabbed-content-tab"><h3>Levien Gymnasium</h3><iframe src="https://calendar.google.com/calendar/embed"></iframe></section>
        <section class="paragraph--type--cu-tabbed-content-tab"><h3>Aerobics Room 4</h3><iframe src="https://calendar.google.com/calendar/embed"></iframe></section>
        <section class="paragraph--type--cu-tabbed-content-tab"><h3>Functional Fitness Studio</h3><iframe src="https://calendar.google.com/calendar/embed"></iframe></section>
        <section class="paragraph--type--cu-tabbed-content-tab"><h3>Squash Courts</h3><a href="https://perec.columbia.edu/squash">Reservations</a></section>
      </section>
    </div></div>
  </article></main>`;
}

function blueGymCalendarUrl() {
  return 'https://calendar.google.com/calendar/embed?ctz=America%2FNew_York&title=Blue%20Gym&src=cuperec%40gmail.com';
}

function activityCalendarUrl(title) {
  const titleQuery = title ? `&title=${encodeURIComponent(title)}` : '';
  return `https://calendar.google.com/calendar/embed?ctz=America%2FNew_York${titleQuery}&src=official-calendar-id`;
}

function columbiaModificationHtml(notice) {
  return `<main><article><h1>Modified Hours &amp; Closures</h1>
    <div><h2>August 21, 2026</h2><h3>Blue Gym</h3><p>${notice}</p></div>
  </article></main>`;
}

function columbiaDatedModificationsHtml() {
  return `<main><article><h1>Modified Hours &amp; Closures</h1>
    <div><h2>August 21, 2026</h2>
      <h3>Levien Gymnasium</h3><p>Closed for Athletics event</p><p>Varsity practice</p>
      <h3>Uris Pool</h3><p>Closed for maintenance</p><p>Filter repair</p>
      <h3>Blue Gym</h3><p>Reservation required from 4 PM - 6 PM</p><p>Private event</p>
    </div>
  </article></main>`;
}
