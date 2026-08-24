import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

import { createStudentServicesHoursService } from '../lib/student-services-hours-service.js';
import { makeStudentServicesAttemptBatch } from './helpers/student-services-hours-fixture.mjs';

const source = await readFile(new URL('../assets/student-services-hours.js', import.meta.url), 'utf8');
const context = { globalThis: {}, structuredClone };
vm.runInNewContext(source, context);
const client = context.globalThis.LionHourStudentServicesHours;

async function snapshot(failed = []) {
  let value = null;
  const service = createStudentServicesHoursService({
    updateSecret: 'secret', logger: { error() {} },
    store: { async getSnapshot() { return value; }, async putSnapshot(next) { value = structuredClone(next); } },
  });
  await service.handle({ method: 'PUT', authorization: 'Bearer secret', body: makeStudentServicesAttemptBatch({ failed }) });
  return value;
}

const venues = () => ['alice-health', 'bookstore', 'caps', 'disability', 'immunization', 'lerner', 'mail-center', 'medical', 'student-insurance', 'svr']
  .map(id => ({ id, hours: {} }));

test('builds ten updates and preserves access availability types', async () => {
  const updates = client.buildUpdates(await snapshot(), venues(), '2026-08-23', new Date('2026-08-23T17:00:00Z'));
  assert.equal(updates.ok, true);
  assert.equal(updates.entries.length, 10);
  assert.equal(updates.entries.find(([venue]) => venue.id === 'lerner')[1].studentServicesDays[0].availabilities[0].type, 'open-access');
});

test('isolates one malformed source and retains the other source updates', async () => {
  const value = await snapshot();
  value.sources.find(sourceItem => sourceItem.sourceId === 'health').venues[0].days[0].availabilities[0].type = 'invented';
  const updates = client.buildUpdates(value, venues(), '2026-08-23', new Date('2026-08-23T17:00:00Z'));
  assert.equal(updates.ok, true);
  assert.equal(updates.entries.length, 10);
  assert.equal(updates.states.find(item => item.sourceId === 'health').kind, 'verification');
  const healthFallback = updates.entries.find(([venue]) => venue.id === 'alice-health')[1];
  assert.equal(healthFallback.studentServicesSourceState, 'verification');
  assert.equal(Object.hasOwn(healthFallback, 'hours'), false);
});

test('marks a retained failed source stale and data older than 24 hours for verification', async () => {
  const value = await snapshot(['bookstore']);
  const prior = await snapshot();
  value.sources[0] = prior.sources[0];
  value.sources[0].lastAttemptResult = 'failure';
  value.sources[0].failureCode = 'challenge';
  let updates = client.buildUpdates(value, venues(), '2026-08-23', new Date('2026-08-23T17:00:00Z'));
  assert.equal(updates.states.find(item => item.sourceId === 'bookstore').kind, 'stale');
  updates = client.buildUpdates(value, venues(), '2026-08-23', new Date('2026-08-25T17:00:00Z'));
  assert.equal(updates.states.find(item => item.sourceId === 'bookstore').kind, 'verification');
});

test('uses inclusive eight-hour and twenty-four-hour freshness boundaries', async () => {
  const value = await snapshot();
  let updates = client.buildUpdates(value, venues(), '2026-08-23', new Date('2026-08-24T00:00:00Z'));
  assert.ok(updates.states.every(item => item.kind === 'live'));
  updates = client.buildUpdates(value, venues(), '2026-08-23', new Date('2026-08-24T00:00:00.001Z'));
  assert.ok(updates.states.every(item => item.kind === 'stale'));
  updates = client.buildUpdates(value, venues(), '2026-08-23', new Date('2026-08-24T16:00:00Z'));
  assert.ok(updates.states.every(item => item.kind === 'stale'));
  updates = client.buildUpdates(value, venues(), '2026-08-23', new Date('2026-08-24T16:00:00.001Z'));
  assert.ok(updates.states.every(item => item.kind === 'verification'));
});

test('aligns a retained prior-day source window by date instead of array position', async () => {
  const value = await snapshot();
  const bookstore = value.sources.find(item => item.sourceId === 'bookstore');
  bookstore.venues[0].days.unshift(structuredClone(bookstore.venues[0].days[0]));
  bookstore.venues[0].days.pop();
  bookstore.venues[0].days.forEach((day, index) => {
    const date = new Date(Date.UTC(2026, 7, 22 + index));
    day.date = date.toISOString().slice(0, 10);
  });
  const updates = client.buildUpdates(value, venues(), '2026-08-23', new Date('2026-08-23T17:00:00Z'));
  const next = updates.entries.find(([venue]) => venue.id === 'bookstore')[1];
  assert.equal(next.studentServicesDays[0].date, '2026-08-23');
});

test('hydrate rolls back every mutation when rendering fails', async () => {
  const items = venues();
  const before = JSON.stringify(items);
  const result = await client.hydrate({
    venues: items,
    today: '2026-08-23',
    now: new Date('2026-08-23T17:00:00Z'),
    fetchImpl: async () => ({ ok: true, async json() { return snapshot(); } }),
    render() { throw new Error('render failed'); },
    restore() {},
  });
  assert.equal(result.applied, false);
  assert.equal(JSON.stringify(items), before);
});
