import assert from 'node:assert/strict';
import test from 'node:test';

import { validateDiningHoursSnapshot } from '../lib/dining-hours-schema.js';
import {
  makeValidDiningSnapshot,
  makeValidDiningSnapshotV2,
  makeValidDiningSnapshotV3,
  makeValidDiningSnapshotV4,
} from './helpers/dining-hours-fixture.mjs';

test('accepts the complete fourteen-day dining snapshot', () => {
  assert.equal(validateDiningHoursSnapshot(makeValidDiningSnapshot()).ok, true);
});

test('rejects missing, unexpected, duplicate, and mismatched locations', () => {
  const missing = makeValidDiningSnapshot();
  missing.locations.pop();
  assert.match(validateDiningHoursSnapshot(missing).errors.join('\n'), /missing required location/);

  const unexpected = makeValidDiningSnapshot();
  unexpected.locations.push(structuredClone(unexpected.locations[0]));
  unexpected.locations.at(-1).id = 'untrusted';
  unexpected.locations.at(-1).sourceId = '999';
  assert.match(validateDiningHoursSnapshot(unexpected).errors.join('\n'), /unexpected location|unexpected source/);

  const duplicate = makeValidDiningSnapshot();
  duplicate.locations[1].id = duplicate.locations[0].id;
  assert.match(validateDiningHoursSnapshot(duplicate).errors.join('\n'), /must be unique/);

  const mismatched = makeValidDiningSnapshot();
  mismatched.locations[0].category = mismatched.locations[0].category === 'dining' ? 'cafe' : 'dining';
  assert.match(validateDiningHoursSnapshot(mismatched).errors.join('\n'), /category does not match/);
});

test('rejects untrusted sources and invalid date windows', () => {
  const source = makeValidDiningSnapshot();
  source.source = 'https://example.com/hours';
  assert.match(validateDiningHoursSnapshot(source).errors.join('\n'), /official Columbia Dining URL/);

  const generated = makeValidDiningSnapshot();
  generated.generated = '2026-08-20T23:00:00Z';
  assert.match(validateDiningHoursSnapshot(generated).errors.join('\n'), /generated Eastern date/);

  const window = makeValidDiningSnapshot();
  window.windowEnd = '2026-09-02';
  window.locations[0].days.pop();
  assert.match(validateDiningHoursSnapshot(window).errors.join('\n'), /fourteen consecutive dates|windowEnd/);
});

test('rejects malformed intervals, status text, and day ordering', () => {
  const time = makeValidDiningSnapshot();
  time.locations[0].days[0].intervals = [['8 AM', '20:00']];
  assert.match(validateDiningHoursSnapshot(time).errors.join('\n'), /HH:MM/);

  const overlap = makeValidDiningSnapshot();
  overlap.locations[0].days[0].intervals = [['08:00', '14:00'], ['13:00', '18:00']];
  assert.match(validateDiningHoursSnapshot(overlap).errors.join('\n'), /must not overlap/);

  const status = makeValidDiningSnapshot();
  status.locations[0].days[0].status = '<script>alert(1)</script>';
  assert.match(validateDiningHoursSnapshot(status).errors.join('\n'), /plain text/);

  const order = makeValidDiningSnapshot();
  order.locations[0].days[1].date = order.locations[0].days[0].date;
  assert.match(validateDiningHoursSnapshot(order).errors.join('\n'), /date must be/);
});

test('accepts split and overnight dining intervals', () => {
  const snapshot = makeValidDiningSnapshot();
  snapshot.locations[0].days[0].intervals = [['10:00', '14:00'], ['16:00', '20:00']];
  snapshot.locations.find(({ id }) => id === 'jjs').days[0].intervals = [['12:00', '10:00']];
  assert.equal(validateDiningHoursSnapshot(snapshot).ok, true);
});

test('accepts provenance and restricted services in schema version 2', () => {
  assert.equal(validateDiningHoursSnapshot(makeValidDiningSnapshotV2()).ok, true);
});

test('accepts Café East provenance in schema version 3', () => {
  assert.equal(validateDiningHoursSnapshot(makeValidDiningSnapshotV3()).ok, true);
});

test('accepts Barnard provenance with independent source freshness in schema version 4', () => {
  const snapshot = makeValidDiningSnapshotV4({ barnardFetchedAt: '2026-08-20T16:00:00.000Z' });
  assert.equal(validateDiningHoursSnapshot(snapshot).ok, true);
});

test('rejects unapproved Barnard locations, categories, and source overrides', () => {
  const category = makeValidDiningSnapshotV4();
  category.locations.find(({ id }) => id === 'lizs-place').category = 'dining';
  assert.match(validateDiningHoursSnapshot(category).errors.join('\n'), /category does not match/);

  const source = makeValidDiningSnapshotV4();
  source.locations.find(({ id }) => id === 'hewitt').days[0].sourceId = 'locations-feed';
  assert.match(validateDiningHoursSnapshot(source).errors.join('\n'), /cannot override Barnard evidence/);

  const extra = makeValidDiningSnapshotV4();
  extra.locations.push({
    ...structuredClone(extra.locations.find(({ id }) => id === 'hewitt')),
    id: 'lefrak-byte-kiosk',
  });
  assert.match(validateDiningHoursSnapshot(extra).errors.join('\n'), /unexpected location/);
});

test('rejects unsafe version 2 source and NSOP open-count claims', () => {
  const source = makeValidDiningSnapshotV2();
  source.sources[0].url = 'https://example.com/hours';
  assert.match(validateDiningHoursSnapshot(source).errors.join('\n'), /does not match source ID/);

  const nsop = makeValidDiningSnapshotV2();
  nsop.specialServices[0].countsAsOpen = true;
  assert.match(validateDiningHoursSnapshot(nsop).errors.join('\n'), /countsAsOpen must be false/);

  const venue = makeValidDiningSnapshotV2();
  venue.locations[0].days[0].sourceId = 'nsop-2026';
  assert.match(validateDiningHoursSnapshot(venue).errors.join('\n'), /cannot use restricted NSOP evidence/);

  const nested = makeValidDiningSnapshotV2();
  nested.locations[0].unsafe = true;
  assert.match(validateDiningHoursSnapshot(nested).errors.join('\n'), /unexpected fields/);
});
