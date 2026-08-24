import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { makeValidSnapshot } from './helpers/library-hours-fixture.mjs';

const source = fs.readFileSync(new URL('../assets/library-hours.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, sandbox);
const api = sandbox.LionHourLibraryHours;

function venues() {
  return [
    { id: 'butler', hours: { 4: [['00:00', '24:00']] }, note: 'embedded' },
    { id: 'noco', hours: { 4: [['09:00', '23:00']] } },
    { id: 'lehman', hours: {} },
    { id: 'uris', hours: {} },
    { id: 'avery', hours: {} },
    { id: 'math', hours: {} },
    { id: 'milstein', hours: {}, sourceStatuses: { 4: 'Hours load from official schedule' }, note: 'embedded' },
    { id: 'dodge', hours: { 4: [['06:00', '22:00']] } },
  ];
}

test('valid hydration atomically updates only mapped venues and reports freshness', async () => {
  const list = venues();
  const dodgeBefore = structuredClone(list.at(-1));
  let renders = 0;
  let status;
  const result = await api.hydrate({
    venues: list,
    fetchImpl: async () => ({ ok: true, json: async () => makeValidSnapshot() }),
    render: () => { renders += 1; },
    setStatus: (next) => { status = next; },
    today: '2026-08-20',
    now: new Date('2026-08-20T17:00:00Z'),
  });
  assert.equal(result.applied, true);
  assert.equal(renders, 1);
  assert.equal(status.kind, 'live');
  assert.deepEqual(list.at(-1), dodgeBefore);
  assert.equal(list[0].hours[4][0][0], '09:00');
  assert.equal(list.find((venue) => venue.id === 'milstein').hours[4][0][0], '09:00');
  assert.equal(list.find((venue) => venue.id === 'milstein').sourceStatuses, null);
});

test('keeps embedded schedules and marks fallback when request or data fails', async () => {
  for (const fetchImpl of [
    async () => { throw new Error('offline'); },
    async () => ({ ok: true, json: async () => ({ schemaVersion: 1, libraries: [] }) }),
  ]) {
    const list = venues();
    const before = structuredClone(list);
    let status;
    const result = await api.hydrate({
      venues: list,
      fetchImpl,
      render: () => assert.fail('failed hydration must not rerender'),
      setStatus: (next) => { status = next; },
      today: '2026-08-20',
    });
    assert.equal(result.applied, false);
    assert.equal(status.kind, 'fallback');
    assert.deepEqual(list, before);
  }
});

test('marks a valid snapshot older than eight hours as stale', async () => {
  let status;
  await api.hydrate({
    venues: venues(),
    fetchImpl: async () => ({ ok: true, json: async () => makeValidSnapshot() }),
    render() {},
    setStatus: (next) => { status = next; },
    today: '2026-08-20',
    now: new Date('2026-08-21T02:01:00Z'),
  });
  assert.equal(status.kind, 'stale');
});

test('does not apply an unapproved overnight interval', () => {
  const snapshot = makeValidSnapshot();
  const lehman = snapshot.libraries.find((library) => library.id === 'lehman');
  lehman.schedules[0].hours['1'] = { open: '21:00', close: '17:00' };
  assert.equal(api.buildUpdates(snapshot, venues(), '2026-08-20').ok, false);
});

test('updates six libraries while preserving embedded Lehman hours', async () => {
  const snapshot = makeValidSnapshot();
  const lehman = snapshot.libraries.find((library) => library.id === 'lehman');
  Object.assign(lehman, {
    useEmbeddedFallback: true,
    fallbackReason: 'unapproved-overnight-hours',
    schedules: [],
  });
  const list = venues();
  const embeddedLehman = structuredClone(list.find((venue) => venue.id === 'lehman'));
  let status;
  const result = await api.hydrate({
    venues: list,
    fetchImpl: async () => ({ ok: true, json: async () => snapshot }),
    render() {},
    setStatus: (next) => { status = next; },
    today: '2026-08-20',
    now: new Date('2026-08-20T17:00:00Z'),
  });
  assert.equal(result.applied, true);
  assert.equal(result.updatedCount, 6);
  assert.deepEqual(Array.from(result.fallbackIds), ['lehman']);
  assert.deepEqual(list.find((venue) => venue.id === 'lehman'), embeddedLehman);
  assert.equal(status.kind, 'partial');
  assert.equal(status.updatedCount, 6);
  assert.deepEqual(Array.from(status.fallbackIds), ['lehman']);
});

test('rejects missing or untrusted Milstein holiday provenance atomically', () => {
  for (const holidayUrl of [undefined, 'https://example.com/visit/hours']) {
    const snapshot = makeValidSnapshot();
    const milstein = snapshot.libraries.find((library) => library.id === 'barnard');
    if (holidayUrl === undefined) delete milstein.holidayUrl;
    else milstein.holidayUrl = holidayUrl;
    const list = venues();
    const before = structuredClone(list);
    assert.equal(api.buildUpdates(snapshot, list, '2026-08-20').ok, false);
    assert.deepEqual(list, before);
  }
});
