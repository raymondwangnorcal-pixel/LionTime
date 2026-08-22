import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/recreation-hours-view.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const { LionHourRecreationView } = sandbox;

test('renders a collapsed Dodge space list with maintenance and access details', () => {
  const output = LionHourRecreationView.renderSpaces([{
    id: 'blue-gym',
    name: 'Blue Gym',
    intervals: [],
    status: 'Closed for maintenance',
    reason: 'Court repair',
    availabilityType: 'reservation-required',
    accessRestrictions: ['Reservation required'],
  }], { mins: 720 });

  assert.match(output, /recreation-spaces/);
  assert.match(output, /View spaces/);
  assert.match(output, /aria-expanded="false"/);
  assert.match(output, /Closed for maintenance/);
  assert.match(output, /Court repair/);
  assert.match(output, /Reservation required/);
});

test('renders unavailable and verification states without guessing Dodge hours', () => {
  const output = LionHourRecreationView.renderSpaces([
    {
      id: 'levien-gymnasium', name: 'Levien Gymnasium', intervals: [],
      status: 'Separate hours not published', reason: null,
      availabilityType: null, accessRestrictions: [],
    },
    {
      id: 'squash-courts', name: 'Squash Courts', intervals: [],
      status: 'Hours need verification', reason: 'Conflicting official notices',
      availabilityType: null, accessRestrictions: [],
    },
  ], { mins: 720 });

  assert.match(output, /Separate hours not published/);
  assert.match(output, /Hours need verification/);
  assert.doesNotMatch(output, /Open 24 hours|12 PM/);
});

test('escapes source-derived room copy before it reaches the renderer output', () => {
  const output = LionHourRecreationView.renderSpaces([{
    id: 'blue-gym', name: '<img src=x onerror=alert(1)>', intervals: [],
    status: 'Closed for maintenance', reason: '<script>alert(1)</script>',
    availabilityType: null, accessRestrictions: ['<b>Reservation required</b>'],
  }], { mins: 720 });

  assert.doesNotMatch(output, /<img|<script|<b>/);
  assert.match(output, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(output, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(output, /&lt;b&gt;Reservation required&lt;\/b&gt;/);
});

test('uses maintenance and reservation restrictions only while their Eastern-time windows are active', () => {
  const baseSpace = {
    id: 'blue-gym',
    name: 'Blue Gym',
    intervals: [['10:00', '12:00'], ['14:00', '18:00']],
    status: null,
    reason: null,
    availabilityType: 'open-recreation',
    accessRestrictions: [],
  };

  for (const { status, reason, availabilityType } of [
    { status: 'Closed for maintenance', reason: 'Annual maintenance', availabilityType: 'facility-hours' },
    { status: 'Reservation required', reason: 'Private reservation', availabilityType: 'reservation-required' },
  ]) {
    const space = {
      ...baseSpace,
      restrictions: [{
        targetId: 'dodge',
        intervals: [['12:00', '14:00']],
        status,
        reason,
        availabilityType,
        accessRestrictions: [],
        sourceRefs: ['columbiaModifications'],
        evidenceRefs: ['columbiaModifications:dodge'],
      }],
    };
    const before = LionHourRecreationView.renderSpaces([space], { mins: 630 });
    const during = LionHourRecreationView.renderSpaces([space], { mins: 780 });
    const after = LionHourRecreationView.renderSpaces([space], { mins: 900 });

    assert.match(before, /recreation-space-status">Open</);
    assert.doesNotMatch(before, new RegExp(reason));
    assert.match(during, new RegExp(`recreation-space-status">${status}<`));
    assert.match(during, new RegExp(reason));
    assert.match(after, /recreation-space-status">Open</);
    assert.doesNotMatch(after, new RegExp(reason));
  }
});

test('renders closing soon and human-readable availability labels', () => {
  const output = LionHourRecreationView.renderSpaces([{
    id: 'blue-gym',
    name: 'Blue Gym',
    intervals: [['10:00', '18:00']],
    status: null,
    reason: null,
    availabilityType: 'open-recreation',
    accessRestrictions: [],
    restrictions: [],
  }], { mins: 1_050 });

  assert.match(output, /recreation-space-status">Closing soon</);
  assert.match(output, /Availability:\s*<\/span>Open recreation/);
  assert.doesNotMatch(output, /open-recreation/);
});
