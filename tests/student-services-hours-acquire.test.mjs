import assert from 'node:assert/strict';
import test from 'node:test';

import { acquireStudentServicesSources } from '../scripts/student-services-hours-acquire.mjs';

function chromiumFake({ challenges = new Set(), allFail = false } = {}) {
  const closedPages = [];
  let browserClosed = false;
  return {
    state: { closedPages, get browserClosed() { return browserClosed; } },
    chromium: {
      async launch() {
        return {
          async newPage() {
            let url = '';
            const listeners = new Map();
            const sourceId = ['bookstore', 'health', 'lerner', 'mail'][closedPages.length];
            return {
              async goto(next) {
                url = next;
                if (allFail) throw new Error('offline');
                if (sourceId === 'bookstore' && !challenges.has(sourceId)) {
                  const listener = listeners.get('response');
                  await listener?.({
                    url: () => 'https://columbia.bncollege.com/api/store-hours',
                    allHeaders: async () => ({ 'content-type': 'application/json' }),
                    json: async () => ({ store: { name: 'Columbia University Bookstore' }, hours: { Monday: '9 AM - 5 PM' } }),
                  });
                }
              },
              url: () => url,
              title: async () => challenges.has(sourceId) ? 'Just a moment...' : 'Official page',
              locator(selector) {
                return {
                  innerText: async () => challenges.has(sourceId) ? 'Verify you are human' : 'Official content',
                  evaluateAll: async () => sourceId === 'lerner' ? ['https://lernerhall.columbia.edu/events'] : [],
                };
              },
              content: async () => '<main>Official content</main>',
              on(type, listener) { listeners.set(type, listener); },
              off(type) { listeners.delete(type); },
              waitForTimeout: async () => {},
              async close() { closedPages.push(sourceId); },
            };
          },
          async close() { browserClosed = true; },
        };
      },
    },
  };
}

test('isolates one managed challenge and closes every page and browser', async () => {
  const fake = chromiumFake({ challenges: new Set(['bookstore']) });
  const result = await acquireStudentServicesSources({ chromiumImpl: fake.chromium,
    now: new Date('2026-08-23T12:00:00-04:00') });
  assert.equal(result.sources.length, 4);
  assert.equal(result.sources[0].failureCode, 'challenge');
  assert.equal(result.sources.filter(source => source.result === 'success').length, 3);
  assert.equal(fake.state.closedPages.length, 4);
  assert.equal(fake.state.browserClosed, true);
});

test('rejects an all-failure run after closing resources', async () => {
  const fake = chromiumFake({ allFail: true });
  await assert.rejects(() => acquireStudentServicesSources({ chromiumImpl: fake.chromium }), /all Student Life sources failed/);
  assert.equal(fake.state.closedPages.length, 4);
  assert.equal(fake.state.browserClosed, true);
});
