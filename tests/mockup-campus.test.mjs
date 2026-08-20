import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const mockupPath = new URL('../mockup-campus-V1.html', import.meta.url);
const html = readFileSync(mockupPath, 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)?.[1];

if (!script) {
  throw new Error('mockup-campus.html does not contain an inline script');
}

const testableScript = script.replace(
  /\/\* ── Events[\s\S]*/,
  `globalThis.mockupTestApi = { VENUES, getStatus, todayHoursText, updateClock };`,
);

const clock = { textContent: '' };
const sandbox = {
  Intl,
  document: {
    getElementById() {
      return clock;
    },
  },
};
vm.runInNewContext(testableScript, sandbox);
const api = sandbox.mockupTestApi;

test('keeps Butler open through its consecutive overnight schedule', () => {
  const butler = api.VENUES.find(({ id }) => id === 'butler');
  const status = api.getStatus(butler, { dow: 1, mins: 720 });

  assert.equal(status.status, 'open');
  assert.match(status.detail, /Friday at 11 PM/);
});

test('reports Uris Pool as closed between its daily swim sessions', () => {
  const pool = api.VENUES.find(({ id }) => id === 'uris-pool');
  const status = api.getStatus(pool, { dow: 1, mins: 870 });

  assert.equal(status.status, 'closed');
  assert.match(status.detail, /Opens.*7 PM today/);
});

test('shows the overnight block that is still open from the prior day', () => {
  const jjs = api.VENUES.find(({ id }) => id === 'jjs');

  assert.equal(
    api.todayHoursText(jjs, { dow: 0, mins: 540 }),
    'Sat 12 PM – 10 AM, 12 PM – 10 AM Mon',
  );
});

test('puts the Eastern time on a line below the date', () => {
  api.updateClock();

  assert.match(
    clock.textContent,
    /^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}\n\d{1,2}:\d{2}:\d{2} [AP]M ET$/,
  );
});

test('bolds the clock date without bolding the Eastern time line', () => {
  assert.match(html, /\.clock::first-line\s*\{[^}]*font-weight:\s*700;/);
});

test('adds a little space between the clock date and Eastern time', () => {
  assert.match(html, /\.clock\s*\{[^}]*line-height:\s*1\.58;/);
});
