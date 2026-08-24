import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../assets/student-services-hours-view.js', import.meta.url), 'utf8');
const context = { globalThis: {} };
vm.runInNewContext(source, context);
const view = context.globalThis.LionHourStudentServicesView;

function venue(availabilities, sourceState = 'live') {
  return { studentServicesSourceState: sourceState, studentServicesDays: { 0: { availabilities } } };
}

test('active office hours count as temporally open with a separate Office Hours label', () => {
  const state = view.stateFor(venue([{ type: 'office-hours', intervals: [['09:00', '17:00']], status: null, reason: null }]), { dow: 0, mins: 12 * 60 });
  assert.equal(state.status, 'open');
  assert.equal(state.label, 'Open');
  assert.equal(state.accessLabel, 'Office Hours');
});

test('keeps the access badge while using the temporal closing-soon state', () => {
  const state = view.stateFor(venue([{ type: 'office-hours', intervals: [['09:00', '17:00']], status: null, reason: null }]), { dow: 0, mins: 16 * 60 + 30 });
  assert.equal(state.status, 'closing-soon');
  assert.equal(state.label, 'Closing soon');
  assert.equal(state.accessLabel, 'Office Hours');
});

test('keeps 24/7 availability open near midnight', () => {
  const state = view.stateFor(venue([{ type: 'phone-support', intervals: [['00:00', '24:00']], status: null, reason: null }]), { dow: 0, mins: 23 * 60 + 50 });
  assert.equal(state.status, 'open');
  assert.equal(state.label, 'Open');
  assert.equal(state.accessLabel, 'Phone Support');
});

test('selects active access context and never labels appointment-only availability as public access', () => {
  const state = view.stateFor(venue([
    { type: 'phone-support', intervals: [['00:00', '24:00']], status: null, reason: null },
    { type: 'appointment-only', intervals: [['09:00', '17:00']], status: null, reason: null },
  ]), { dow: 0, mins: 10 * 60 });
  assert.equal(state.status, 'open');
  assert.equal(state.accessLabel, 'Appointment Only');
});

test('expired source data gets verification status while retaining access context', () => {
  const state = view.stateFor(venue([{ type: 'virtual-only', intervals: [['09:00', '17:00']], status: null, reason: null }], 'verification'), { dow: 0, mins: 12 * 60 });
  assert.equal(state.label, 'Needs verification');
  assert.equal(state.accessLabel, 'Virtual Only');
});

test('detail rendering escapes source text', () => {
  const html = view.renderDay({ availabilities: [{ type: 'office-hours', intervals: [['09:00', '17:00']], status: null, reason: '<script>' }] }, interval => interval.join('–'));
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
});
