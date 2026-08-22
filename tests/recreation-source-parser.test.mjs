import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  parseBarnardHours,
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

test('retains an explicit Barnard ID requirement as a separate access restriction', async () => {
  const html = (await readFixture('recreation-barnard-hours.html'))
    .replace('Barnard students, faculty, and staff', 'Barnard ID required')
    .replace('</h3>', '</h3><p>Effective August 1, 2026 through September 30, 2026.</p>');
  const item = find(parseBarnardHours(html), 'barnard-fitness');

  assert.deepEqual(item.accessRestrictions, ['Barnard ID required']);
  assert.deepEqual(item.weeklyIntervals['1'], [['09:00', '19:00']]);
});

test('uses only exact current Barnard bounds across stale, future, ambiguous, and current DOM shapes', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const generated = new Date('2026-08-21T16:00:00-04:00');
  const cases = [
    ['stale', 'Effective May 1, 2026 through July 31, 2026.', false],
    ['future', 'Effective September 1, 2026 through December 20, 2026.', false],
    ['current', 'Effective August 1, 2026 through September 30, 2026.', true],
  ];

  const ambiguous = resolveRecreationSnapshot({ evidence: parseBarnardHours(html), generated });
  assert.equal(facilityDay(ambiguous, 'barnard-fitness').status, 'Hours need verification');
  assert.deepEqual(facilityDay(ambiguous, 'barnard-fitness').intervals, []);

  for (const [label, bounds, publishesTimes] of cases) {
    const bounded = html.replace('</h3>', `</h3><p>${bounds}</p>`);
    const snapshot = resolveRecreationSnapshot({ evidence: parseBarnardHours(bounded), generated });
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
