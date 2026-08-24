import assert from 'node:assert/strict';
import test from 'node:test';

import { acquireRecreationSources } from '../scripts/recreation-hours-acquire.mjs';

/*
 * Official-source inventory (2026-08-21):
 * - https://perec.columbia.edu/hours-operation is the authoritative baseline for
 *   Dodge Fitness Center and Uris Pool. Its official linked membership page,
 *   https://perec.columbia.edu/membershipinfo, publishes student eligibility:
 *   students paying the listed student/university fees receive a Dodge membership;
 *   other students may purchase one. It is access policy, not a schedule URL.
 * - https://perec.columbia.edu/content/modified-hours-closures is the authoritative
 *   date-specific override source for those facilities and Dodge spaces.
 * - https://barnard.edu/lefrak-center/physical-well-being publishes Barnard Fitness
 *   Center hours and says it is open to current Barnard students, faculty, and staff.
 * - The linked https://recreation.columbia.edu/ booking portal is reservation-only;
 *   it publishes no general undergraduate-access rule or fixed schedule, so it is not
 *   an acquisition source. Athletics-only, staff-only, and access-unclear candidates
 *   are likewise excluded from the fixed catalog.
 */

test('loads every official source in headed Chromium and closes the browser', async () => {
  const calls = [];
  const pages = new Map([
    ['https://perec.columbia.edu/hours-operation', '<main><h1>Hours of Operation</h1></main>'],
    ['https://perec.columbia.edu/content/modified-hours-closures', '<main><h1>Modified Hours & Closures</h1></main>'],
    ['https://barnard.edu/lefrak-center/physical-well-being', '<main><h1>Physical Well-Being</h1></main>'],
  ]);
  const chromiumImpl = fakeChromium({ pages, calls });

  const result = await acquireRecreationSources({
    chromiumImpl,
    timeoutMs: 1000,
    calendarsImpl: async () => activityCalendarResults(),
  });

  assert.deepEqual(Object.values(result.pages).map((page) => page.url), [...pages.keys()]);
  assert.deepEqual(Object.keys(result.pages.columbiaHours.activityCalendars), [
    'blue-gym', 'levien-gymnasium', 'aerobics-room-4', 'functional-fitness-studio',
  ]);
  assert.ok(Object.values(result.pages.columbiaHours.activityCalendars).every(calendar => calendar.result === 'success'));
  assert.equal(calls[0].headless, false);
  assert.ok(calls.includes('browser.close'));
});

test('preserves successful activity calendars when one embedded calendar fails', async () => {
  const calls = [];
  const pages = new Map([
    ['https://perec.columbia.edu/hours-operation', '<main><h1>Hours of Operation</h1></main>'],
    ['https://perec.columbia.edu/content/modified-hours-closures', '<main><h1>Modified Hours & Closures</h1></main>'],
    ['https://barnard.edu/lefrak-center/physical-well-being', '<main><h1>Physical Well-Being</h1></main>'],
  ]);

  const result = await acquireRecreationSources({
    chromiumImpl: fakeChromium({ pages, calls }),
    timeoutMs: 1000,
    calendarsImpl: async () => ({
      ...activityCalendarResults(),
      'levien-gymnasium': { result: 'failure', failureCode: 'missing-content' },
    }),
  });

  assert.equal(result.pages.columbiaHours.activityCalendars['blue-gym'].result, 'success');
  assert.equal(result.pages.columbiaHours.activityCalendars['levien-gymnasium'].result, 'failure');
  assert.equal(result.pages.columbiaHours.html, pages.get('https://perec.columbia.edu/hours-operation'));
  assert.ok(calls.includes('browser.close'));
});

function activityCalendarResults() {
  return Object.fromEntries([
    ['blue-gym', 'Blue Gym'],
    ['levien-gymnasium', null],
    ['aerobics-room-4', 'Aerobics Room 4 Open Recreation'],
    ['functional-fitness-studio', 'Functional Fitness Studio Open Recreation'],
  ].map(([targetId, title]) => [targetId, {
    result: 'success',
    targetId,
    calendarUrl: `https://calendar.google.com/calendar/embed?ctz=America%2FNew_York${title ? `&title=${encodeURIComponent(title)}` : ''}&src=official-calendar-id`,
    weeks: ['week one'],
  }]));
}

test('closes Chromium and rejects when a managed challenge remains', async () => {
  const calls = [];
  const chromiumImpl = fakeChromium({
    pages: new Map([['https://perec.columbia.edu/hours-operation', '<title>Just a moment...</title>']]),
    calls,
  });
  await assert.rejects(
    acquireRecreationSources({ chromiumImpl, timeoutMs: 1000 }),
    /managed challenge|missing official content/i,
  );
  assert.ok(calls.includes('browser.close'));
});

function fakeChromium({ pages, calls }) {
  return {
    async launch(options) {
      calls.push(options);
      return {
        async newPage() {
          let currentUrl;
          return {
            async goto(url) { currentUrl = url; },
            async waitForLoadState() {},
            async title() {
              return /<title>Just a moment<\/title>/i.test(pages.get(currentUrl) || '')
                ? 'Just a moment...'
                : 'Official hours';
            },
            async content() { return pages.get(currentUrl) || ''; },
            async close() { calls.push('page.close'); },
          };
        },
        async close() { calls.push('browser.close'); },
      };
    },
  };
}
