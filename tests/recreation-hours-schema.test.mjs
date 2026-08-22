import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRecreationHoursSnapshot } from '../lib/recreation-hours-schema.js';
import {
  setDay,
  setSpaceDay,
  validSnapshot,
  withoutFacility,
  withoutSpace,
  withSource,
} from './helpers/recreation-hours-fixture.mjs';

test('accepts the complete fourteen-day recreation snapshot', () => {
  assert.equal(validateRecreationHoursSnapshot(validSnapshot()).ok, true);
});

test('rejects missing facilities, spaces, and untrusted sources', () => {
  assert.match(validateRecreationHoursSnapshot(withoutFacility('barnard-fitness')).errors.join('\n'), /missing required facility/);
  assert.match(validateRecreationHoursSnapshot(withoutSpace('blue-gym')).errors.join('\n'), /missing required Dodge space/);
  assert.match(validateRecreationHoursSnapshot(withSource('https://example.com')).errors.join('\n'), /official source/);
});

test('rejects pool states that violate the Dodge parent closure', () => {
  let snapshot = validSnapshot();
  snapshot = setDay(snapshot, 'dodge', { intervals: [], status: 'Closed' });
  snapshot = setDay(snapshot, 'uris-pool', { intervals: [['12:00', '14:00']], status: null });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /pool cannot open while Dodge is closed/);
});

test('rejects intervals paired with an unavailable status', () => {
  const snapshot = setDay(validSnapshot(), 'barnard-fitness', {
    intervals: [['08:00', '20:00']], status: 'Closed',
  });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /Closed status cannot include intervals/);
});

test('rejects room intervals without room-specific provenance', () => {
  const snapshot = setSpaceDay(validSnapshot(), 'blue-gym', {
    intervals: [['10:00', '12:00']], sourceRefs: ['dodge-baseline'],
  });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /room-specific provenance/);
});

test('rejects malformed dates, intervals, text, and noncanonical source references without mutation', () => {
  const snapshot = validSnapshot();
  const original = structuredClone(snapshot);
  snapshot.facilities[0].days[1].date = snapshot.facilities[0].days[0].date;
  snapshot.facilities[0].days[0].intervals = [['10:00', '12:00'], ['11:00', '13:00']];
  snapshot.facilities[0].days[0].reason = '<script>';
  snapshot.facilities[0].days[0].sourceRefs = ['columbiaHours', 'columbiaHours'];
  const beforeValidation = structuredClone(snapshot);
  const result = validateRecreationHoursSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /date must be/);
  assert.match(result.errors.join('\n'), /must not overlap/);
  assert.match(result.errors.join('\n'), /bounded plain text/);
  assert.match(result.errors.join('\n'), /canonical unique order/);
  assert.notDeepEqual(snapshot, original);
  assert.deepEqual(snapshot, beforeValidation);
});
