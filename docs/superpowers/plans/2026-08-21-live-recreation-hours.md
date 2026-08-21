# Live Recreation Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish accurate live Recreation hours and availability for Dodge Fitness Center, its five independently scheduled spaces, Uris Pool, and Barnard Fitness Center using official current, seasonal, and modified-hours sources.

**Architecture:** A dedicated headed-Playwright job acquires official Columbia and Barnard pages, source adapters convert those pages into normalized schedule evidence, and a deterministic resolver applies source priority, seasonal date ranges, modifications, and Dodge parent constraints. A separately validated snapshot is stored under its own Redis key and atomically hydrates the Fitness UI, including a collapsed Dodge space list and explicit conflict or unavailable states.

**Tech Stack:** Node.js 22+, ES modules, Playwright Chromium, Cheerio 1.x, Node test runner, Vercel Functions, Upstash Redis, GitHub Actions, static HTML/CSS/JavaScript.

**Spec:** `docs/superpowers/specs/2026-08-21-live-recreation-hours-design.md`

## Global Constraints

- Use only official Columbia Recreation, Barnard, or officially linked scheduling sources; never use third-party business or community listings.
- Run Recreation as an independent four-hour pipeline with its own workflow, API endpoint, and Redis key.
- Use headed Playwright Chromium inside `xvfb`; do not attempt to bypass an interactive CAPTCHA.
- Require at minimum Dodge Fitness Center, Uris Pool, Barnard Fitness Center, Blue Gym, Levien Gymnasium, Functional Fitness Studio, Aerobics Room 4, and Squash Courts in every accepted snapshot; include any additional undergraduate-accessible facility only through an explicit catalog mapping confirmed during the official-source inventory.
- Never inherit Dodge operating intervals into a subspace without room-specific provenance.
- Uris Pool inherits Dodge closures but retains its own intervals and independent maintenance closures.
- Apply specific modified-hour and closure notices before room schedules, current recreation schedules, seasonal schedules, general facility pages, and directories.
- Preserve access restrictions separately from hours.
- Use `Closed for maintenance` only for an explicit official maintenance, construction, or repair notice.
- Surface unresolved official-source conflicts as `Hours need verification`; never guess.
- Keep embedded top-level schedules as immediate-render and failure fallbacks; never partially apply live Recreation data.
- Treat snapshots older than eight hours as stale.
- Preserve unrelated existing edits in `index.html` while executing this plan.

---

### Task 1: Acquire official Recreation sources with headed Playwright

**Files:**
- Create: `lib/recreation-hours-catalog.js`
- Create: `scripts/recreation-hours-acquire.mjs`
- Test: `tests/recreation-hours-acquire.test.mjs`

**Interfaces:**
- Produces: `RECREATION_SOURCE_URLS`, `RECREATION_FACILITIES`, and `DODGE_SPACES` constants.
- Produces: `acquireRecreationSources({ chromiumImpl, timeoutMs }): Promise<{ generated: Date, pages: Record<string, { url: string, html: string }> }>`.
- Consumes: Playwright's `chromium` implementation; tests inject a fake implementation.

- [ ] **Step 1: Write the failing acquisition tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireRecreationSources } from '../scripts/recreation-hours-acquire.mjs';

test('loads every official source in headed Chromium and closes the browser', async () => {
  const calls = [];
  const pages = new Map([
    ['https://perec.columbia.edu/hours-operation', '<main><h1>Hours of Operation</h1></main>'],
    ['https://perec.columbia.edu/content/modified-hours-closures', '<main><h1>Modified Hours & Closures</h1></main>'],
    ['https://barnard.edu/lefrak-center/physical-well-being', '<main><h1>Physical Well-Being</h1></main>'],
  ]);
  const chromiumImpl = fakeChromium({ pages, calls });

  const result = await acquireRecreationSources({ chromiumImpl, timeoutMs: 1000 });

  assert.deepEqual(Object.values(result.pages).map(page => page.url), [...pages.keys()]);
  assert.equal(calls[0].headless, false);
  assert.ok(calls.includes('browser.close'));
});

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
```

Before freezing the catalog, use the three approved entry pages to inventory linked official facility and scheduling pages. Record each candidate's official URL and published student-access rule in the test fixture notes. Add a candidate to `RECREATION_FACILITIES` only when the official source explicitly supports regular undergraduate use; record varsity-only, staff-only, or access-unclear candidates as excluded in `docs/recreation-hours-operations.md`. Add every accepted linked schedule URL to `RECREATION_SOURCE_URLS` so acquisition remains allowlisted rather than open-ended.

- [ ] **Step 2: Run the acquisition test to verify it fails**

Run: `node --test tests/recreation-hours-acquire.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `recreation-hours-acquire.mjs`.

- [ ] **Step 3: Add the fixed catalog**

```js
export const RECREATION_SOURCE_URLS = Object.freeze({
  columbiaHours: 'https://perec.columbia.edu/hours-operation',
  columbiaModifications: 'https://perec.columbia.edu/content/modified-hours-closures',
  barnardFitness: 'https://barnard.edu/lefrak-center/physical-well-being',
});

export const RECREATION_FACILITIES = Object.freeze({
  dodge: Object.freeze({ name: 'Dodge Fitness Center', kind: 'facility' }),
  'uris-pool': Object.freeze({ name: 'Uris Pool', kind: 'facility', parentId: 'dodge' }),
  'barnard-fitness': Object.freeze({ name: 'Barnard Fitness Center', kind: 'facility' }),
});

export const DODGE_SPACES = Object.freeze({
  'blue-gym': Object.freeze({ name: 'Blue Gym' }),
  'levien-gymnasium': Object.freeze({ name: 'Levien Gymnasium' }),
  'functional-fitness-studio': Object.freeze({ name: 'Functional Fitness Studio' }),
  'aerobics-room-4': Object.freeze({ name: 'Aerobics Room 4' }),
  'squash-courts': Object.freeze({ name: 'Squash Courts' }),
});
```

- [ ] **Step 4: Implement browser acquisition and challenge detection**

```js
export async function acquireRecreationSources({ chromiumImpl = chromium, timeoutMs = 60_000 } = {}) {
  const browser = await chromiumImpl.launch({ headless: false });
  try {
    const pages = {};
    for (const [sourceId, url] of Object.entries(RECREATION_SOURCE_URLS)) {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
      const title = await page.title();
      const html = await page.content();
      if (/just a moment|attention required/i.test(title) || !/<main\b|<article\b/i.test(html)) {
        throw new Error(`${sourceId}: managed challenge or missing official content`);
      }
      pages[sourceId] = { url, html };
      await page.close();
    }
    return { generated: new Date(), pages };
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 5: Run the test and commit**

Run: `node --test tests/recreation-hours-acquire.test.mjs`

Expected: 2 tests PASS.

```bash
git add lib/recreation-hours-catalog.js scripts/recreation-hours-acquire.mjs tests/recreation-hours-acquire.test.mjs
git commit -m "feat: acquire official recreation sources"
```

---

### Task 2: Parse official schedules and modifications into source evidence

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/recreation-source-parser.js`
- Create: `tests/fixtures/recreation-columbia-hours.html`
- Create: `tests/fixtures/recreation-columbia-modifications.html`
- Create: `tests/fixtures/recreation-barnard-hours.html`
- Test: `tests/recreation-source-parser.test.mjs`

**Interfaces:**
- Consumes: HTML strings from `acquireRecreationSources`.
- Produces: `parseColumbiaHours(html): SourceEvidence[]`.
- Produces: `parseColumbiaModifications(html): SourceEvidence[]`.
- Produces: `parseBarnardHours(html): SourceEvidence[]`.
- `SourceEvidence` shape: `{ targetId, sourceId, priority, effectiveStart, effectiveEnd, weeklyIntervals, dateIntervals, status, reason, availabilityType, accessRestrictions, sourceUpdatedAt }`. Baselines use `weeklyIntervals` keyed by weekday number; one-date modifications use `dateIntervals`. Exactly one interval field is non-null.

- [ ] **Step 1: Capture minimal official-structure fixtures**

Run the acquisition module against the live pages and save its raw output only under `/tmp`. From those pages, reproduce the smallest semantic `<section>`, `<table>`, or schedule structure needed to represent:

- one current Columbia seasonal schedule with Dodge and Uris Pool
- one modified closure and one time-limited room restriction
- Barnard Fitness Center's schedule and access copy

Use the deterministic dates and times asserted in Step 3 as synthetic test values rather than claiming they are current production hours. Redact unrelated navigation, analytics, tokens, scripts, names, and contact information. Commit only the minimal schedule structure in the three fixture files; live values are verified separately in Task 8.

- [ ] **Step 2: Install the HTML parser**

Run: `npm install cheerio@1`

Expected: `cheerio` appears in `dependencies`; `package-lock.json` is updated without removing Playwright or Upstash.

- [ ] **Step 3: Write failing parser tests**

```js
test('parses current Columbia facility and room schedules with date ranges', async () => {
  const html = await readFixture('recreation-columbia-hours.html');
  const evidence = parseColumbiaHours(html);
  assert.deepEqual(find(evidence, 'dodge').weeklyIntervals['1'], [['06:00', '23:00']]);
  assert.equal(find(evidence, 'dodge').effectiveStart, '2026-08-17');
  assert.equal(find(evidence, 'blue-gym').availabilityType, 'open-recreation');
  assert.notDeepEqual(find(evidence, 'blue-gym').intervals, find(evidence, 'dodge').intervals);
});

test('parses specific closures, reasons, and maintenance without guessing', async () => {
  const html = await readFixture('recreation-columbia-modifications.html');
  const evidence = parseColumbiaModifications(html);
  assert.deepEqual(find(evidence, 'levien-gymnasium'), {
    targetId: 'levien-gymnasium',
    sourceId: 'columbiaModifications',
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
  });
  assert.equal(find(evidence, 'uris-pool').status, 'Closed for maintenance');
});

test('keeps Barnard access restrictions separate from operating intervals', async () => {
  const html = await readFixture('recreation-barnard-hours.html');
  const item = find(parseBarnardHours(html), 'barnard-fitness');
  assert.deepEqual(item.accessRestrictions, ['Barnard ID required']);
  assert.deepEqual(item.weeklyIntervals['1'], [['07:00', '22:00']]);
});

const readFixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const find = (items, targetId) => {
  const item = items.find(candidate => candidate.targetId === targetId);
  assert.ok(item, `missing evidence for ${targetId}`);
  return item;
};
```

- [ ] **Step 4: Run the parser tests to verify they fail**

Run: `node --test tests/recreation-source-parser.test.mjs`

Expected: FAIL because the parser exports do not exist.

- [ ] **Step 5: Implement semantic heading, date-range, weekday, and time parsing**

Implement source-specific adapters on top of shared bounded helpers:

```js
const TARGET_PATTERNS = Object.freeze([
  [/dodge fitness/i, 'dodge'],
  [/uris pool/i, 'uris-pool'],
  [/blue gym/i, 'blue-gym'],
  [/levien gym/i, 'levien-gymnasium'],
  [/functional fitness studio/i, 'functional-fitness-studio'],
  [/aerobics room 4/i, 'aerobics-room-4'],
  [/squash courts?/i, 'squash-courts'],
  [/fitness center|physical well-being/i, 'barnard-fitness'],
]);

function boundedText(value, limit = 200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > limit || /[<>\u0000-\u001f]/.test(text)) return null;
  return text;
}

function maintenanceStatus(text) {
  return /maintenance|construction|repair/i.test(text || '') ? 'Closed for maintenance' : null;
}
```

Use explicit source section boundaries and current-date-range labels from the captured fixtures. Reject unknown time formats and unknown target headings instead of creating new IDs. Convert `Reservation required`, `lap swim`, and `open recreation` into `availabilityType`; do not place them in interval strings.

- [ ] **Step 6: Run parser tests and commit**

Run: `node --test tests/recreation-source-parser.test.mjs`

Expected: all parser tests PASS.

```bash
git add package.json package-lock.json lib/recreation-source-parser.js tests/fixtures/recreation-*.html tests/recreation-source-parser.test.mjs
git commit -m "feat: parse official recreation schedules"
```

---

### Task 3: Resolve source priority, seasonal schedules, and parent constraints

**Files:**
- Create: `lib/recreation-hours-resolver.js`
- Create: `tests/helpers/recreation-hours-fixture.mjs`
- Test: `tests/recreation-hours-resolver.test.mjs`

**Interfaces:**
- Consumes: arrays of `SourceEvidence` from Task 2 and a timezone-aware `generated` date.
- Produces: `resolveRecreationSnapshot({ evidence, generated }): RecreationSnapshot`.
- Produces: `ResolvedDay`: `{ date, intervals, status, reason, availabilityType, sourceRefs, conflict }`.
- Produces test helpers from `tests/helpers/recreation-hours-fixture.mjs`: `evidence(overrides)`, `resolveWith(items)`, `day(snapshot, facilityId, date?)`, `spaceDay(snapshot, spaceId, date?)`, `validSnapshot()`, and immutable evidence constants used below.

- [ ] **Step 1: Write failing priority and seasonal tests**

```js
test('selects only the baseline schedule covering the target date', () => {
  const snapshot = resolveRecreationSnapshot({
    generated: new Date('2026-08-21T16:00:00-04:00'),
    evidence: [springDodge, fallDodge],
  });
  assert.deepEqual(day(snapshot, 'dodge', '2026-08-21').intervals, [['06:00', '23:00']]);
  assert.deepEqual(day(snapshot, 'dodge', '2026-08-22').sourceRefs, ['fall-dodge']);
});

test('applies a specific modified close before the baseline', () => {
  const result = resolveWith([fallDodge, modifiedDodgeClose]);
  assert.deepEqual(day(result, 'dodge', '2026-08-21').intervals, [['06:00', '18:00']]);
});

test('surfaces equal-priority unresolved conflicts instead of guessing', () => {
  const result = resolveWith([conflictingBlueGymA, conflictingBlueGymB]);
  assert.equal(spaceDay(result, 'blue-gym').status, 'Hours need verification');
  assert.equal(spaceDay(result, 'blue-gym').conflict, true);
});
```

- [ ] **Step 2: Write failing Dodge, pool, and room inheritance tests**

```js
test('Dodge maintenance closes Dodge and Uris Pool', () => {
  const result = resolveWith([openDodge, openPool, dodgeMaintenance]);
  assert.equal(day(result, 'dodge').status, 'Closed for maintenance');
  assert.equal(day(result, 'uris-pool').status, 'Closed for maintenance');
  assert.deepEqual(day(result, 'uris-pool').intervals, []);
});

test('pool-only maintenance does not close Dodge', () => {
  const result = resolveWith([openDodge, openPool, poolMaintenance]);
  assert.equal(day(result, 'dodge').status, null);
  assert.equal(day(result, 'uris-pool').status, 'Closed for maintenance');
});

test('missing room schedule never inherits Dodge intervals', () => {
  const result = resolveWith([openDodge, openPool]);
  assert.deepEqual(spaceDay(result, 'functional-fitness-studio').intervals, []);
  assert.equal(spaceDay(result, 'functional-fitness-studio').status, 'Separate hours not published');
});
```

Create the helper module in the same step with deterministic evidence factories:

```js
export const evidence = (overrides = {}) => ({
  targetId: 'dodge', sourceId: 'fall-dodge', priority: 3,
  effectiveStart: '2026-08-17', effectiveEnd: '2026-12-23',
  weeklyIntervals: { 0: [], 1: [['06:00', '23:00']], 2: [['06:00', '23:00']], 3: [['06:00', '23:00']], 4: [['06:00', '23:00']], 5: [['06:00', '23:00']], 6: [] },
  dateIntervals: null,
  status: null, reason: null, availabilityType: 'facility-hours',
  accessRestrictions: [], sourceUpdatedAt: null, ...overrides,
});
export const openDodge = evidence();
export const fallDodge = openDodge;
export const springDodge = evidence({ sourceId: 'spring-dodge', effectiveStart: '2026-01-20', effectiveEnd: '2026-05-15', weeklyIntervals: { 1: [['07:00', '22:00']] } });
export const openPool = evidence({ targetId: 'uris-pool', sourceId: 'pool-lap-swim', priority: 2, weeklyIntervals: { 5: [['12:00', '14:00']] }, availabilityType: 'lap-swim' });
export const dodgeMaintenance = evidence({ sourceId: 'dodge-maintenance', priority: 1, effectiveStart: '2026-08-21', effectiveEnd: '2026-08-21', weeklyIntervals: null, dateIntervals: [], status: 'Closed for maintenance', reason: 'Floor maintenance' });
export const poolMaintenance = evidence({ targetId: 'uris-pool', sourceId: 'pool-maintenance', priority: 1, effectiveStart: '2026-08-21', effectiveEnd: '2026-08-21', weeklyIntervals: null, dateIntervals: [], status: 'Closed for maintenance', reason: 'Pool maintenance' });
export const modifiedDodgeClose = evidence({ sourceId: 'modified-dodge-close', priority: 1, effectiveStart: '2026-08-21', effectiveEnd: '2026-08-21', weeklyIntervals: null, dateIntervals: [['06:00', '18:00']] });
export const conflictingBlueGymA = evidence({ targetId: 'blue-gym', sourceId: 'blue-a', priority: 2, weeklyIntervals: { 5: [['10:00', '12:00']] }, availabilityType: 'open-recreation' });
export const conflictingBlueGymB = evidence({ targetId: 'blue-gym', sourceId: 'blue-b', priority: 2, weeklyIntervals: { 5: [['14:00', '16:00']] }, availabilityType: 'open-recreation' });
```

`resolveWith`, `day`, and `spaceDay` call the public resolver and assert that the requested facility, space, and date exist before returning them.

- [ ] **Step 3: Run resolver tests to verify they fail**

Run: `node --test tests/recreation-hours-resolver.test.mjs`

Expected: FAIL with missing `resolveRecreationSnapshot`.

- [ ] **Step 4: Implement deterministic resolution**

For each of fourteen Eastern dates:

1. discard evidence whose effective range does not cover the date
2. group by target ID
3. choose the lowest numeric priority
4. prefer greater facility/date/time specificity within that priority
5. flag incompatible equal-specificity evidence as a conflict
6. apply interval overrides and closure subtraction
7. apply Dodge-to-pool closure inheritance
8. emit explicit unavailable states for required spaces without distinct evidence

Use this parent constraint after resolving both facilities:

```js
function constrainPool(dodgeDay, poolDay) {
  if (dodgeDay.status === 'Closed for maintenance') {
    return { ...poolDay, intervals: [], status: 'Closed for maintenance', reason: dodgeDay.reason };
  }
  if (dodgeDay.intervals.length === 0) {
    return { ...poolDay, intervals: [], status: dodgeDay.status || 'Closed', reason: dodgeDay.reason };
  }
  return poolDay;
}
```

- [ ] **Step 5: Run resolver tests and commit**

Run: `node --test tests/recreation-hours-resolver.test.mjs`

Expected: all resolver tests PASS.

```bash
git add lib/recreation-hours-resolver.js tests/helpers/recreation-hours-fixture.mjs tests/recreation-hours-resolver.test.mjs
git commit -m "feat: resolve recreation schedule priority"
```

---

### Task 4: Validate and persist Recreation snapshots

**Files:**
- Create: `lib/recreation-hours-schema.js`
- Create: `lib/recreation-hours-store.js`
- Create: `lib/recreation-hours-service.js`
- Create: `api/recreation-hours.js`
- Modify: `vercel.json`
- Test: `tests/recreation-hours-schema.test.mjs`
- Test: `tests/recreation-hours-service.test.mjs`

**Interfaces:**
- Produces: `validateRecreationHoursSnapshot(value): { ok: true, value } | { ok: false, errors }`.
- Produces: `createRecreationHoursStore(redis)` using `lionhour:recreation-hours:v1`.
- Produces: `createRecreationHoursService({ store, updateSecret, logger }).handle(request)`.
- Consumes: `LIBRARY_HOURS_UPDATE_SECRET` for authenticated `PUT` requests.

- [ ] **Step 1: Write failing schema tests**

```js
test('accepts the complete fourteen-day recreation snapshot', () => {
  assert.equal(validateRecreationHoursSnapshot(validSnapshot()).ok, true);
});

test('rejects missing facilities, spaces, and untrusted sources', () => {
  assert.match(validateRecreationHoursSnapshot(withoutFacility('barnard-fitness')).errors.join('\n'), /missing required facility/);
  assert.match(validateRecreationHoursSnapshot(withoutSpace('blue-gym')).errors.join('\n'), /missing required Dodge space/);
  assert.match(validateRecreationHoursSnapshot(withSource('https:\/\/example.com')).errors.join('\n'), /official source/);
});

test('rejects pool states that violate the Dodge parent closure', () => {
  const snapshot = validSnapshot();
  setDay(snapshot, 'dodge', { intervals: [], status: 'Closed' });
  setDay(snapshot, 'uris-pool', { intervals: [['12:00', '14:00']], status: null });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /pool cannot open while Dodge is closed/);
});

test('rejects room intervals without room-specific provenance', () => {
  const snapshot = validSnapshot();
  setSpaceDay(snapshot, 'blue-gym', { intervals: [['10:00', '12:00']], sourceRefs: ['dodge-baseline'] });
  assert.match(validateRecreationHoursSnapshot(snapshot).errors.join('\n'), /room-specific provenance/);
});
```

Extend `tests/helpers/recreation-hours-fixture.mjs` in this step with immutable-copy helpers `withoutFacility(id)`, `withoutSpace(id)`, `withSource(url)`, `setDay(snapshot, id, changes)`, `setSpaceDay(snapshot, id, changes)`, and `nextSnapshot()`. Each helper starts from `structuredClone(validSnapshot())`; setters modify only the first day and return the snapshot.

- [ ] **Step 2: Run schema tests to verify they fail**

Run: `node --test tests/recreation-hours-schema.test.mjs`

Expected: FAIL because `recreation-hours-schema.js` does not exist.

- [ ] **Step 3: Implement strict validation**

Validate exact catalog membership, trusted source URLs, timezone-aware generation, fourteen ordered dates, non-overlapping intervals, bounded plain-text fields, enumerated availability types and statuses, separate access restrictions, Dodge-space provenance, and pool parent constraints. Return every validation error without mutating the input.

- [ ] **Step 4: Write failing service tests**

```js
test('GET returns an uninitialized response until a snapshot exists', async () => {
  const service = createRecreationHoursService({ store: memoryStore(null), updateSecret: 'secret' });
  assert.equal((await service.handle({ method: 'GET' })).status, 503);
});

test('authenticated valid PUT replaces the snapshot and invalid PUT preserves it', async () => {
  const store = memoryStore(validSnapshot());
  const service = createRecreationHoursService({ store, updateSecret: 'secret' });
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer secret', body: nextSnapshot() })).status, 204);
  const preserved = await store.getSnapshot();
  assert.equal((await service.handle({ method: 'PUT', authorization: 'Bearer secret', body: {} })).status, 422);
  assert.deepEqual(await store.getSnapshot(), preserved);
});
```

- [ ] **Step 5: Implement store, service, API, and Vercel route**

Follow the existing dining service's constant-time bearer-secret comparison and cache policy. Use `RECREATION_HOURS_KEY = 'lionhour:recreation-hours:v1'`. Add `/api/recreation-hours` to the bounded Vercel function configuration without changing existing library or dining routes.

- [ ] **Step 6: Run component tests and commit**

Run: `node --test tests/recreation-hours-schema.test.mjs tests/recreation-hours-service.test.mjs`

Expected: all schema and service tests PASS.

```bash
git add lib/recreation-hours-schema.js lib/recreation-hours-store.js lib/recreation-hours-service.js api/recreation-hours.js vercel.json tests/recreation-hours-schema.test.mjs tests/recreation-hours-service.test.mjs
git commit -m "feat: validate and store recreation snapshots"
```

---

### Task 5: Build the production scraper CLI and independent workflow

**Files:**
- Create: `scripts/recreation-hours-scraper.mjs`
- Create: `.github/workflows/update-recreation-hours.yml`
- Test: `tests/recreation-hours-scraper.test.mjs`
- Test: `tests/recreation-hours-workflow.test.mjs`

**Interfaces:**
- Consumes: `acquireRecreationSources`, all three parser functions, `resolveRecreationSnapshot`, and `validateRecreationHoursSnapshot`.
- Produces: CLI `node scripts/recreation-hours-scraper.mjs --json-out <path>`.
- Produces: a standalone four-hour GitHub workflow.

- [ ] **Step 1: Write the failing CLI composition test**

```js
test('acquires, parses, resolves, validates, and writes one snapshot', async () => {
  const writes = [];
  const result = await runRecreationScraper({
    acquire: async () => acquiredFixture(),
    parsers: parserFixture(),
    writeJson: async (path, value) => writes.push([path, value]),
    outputPath: '/tmp/recreation.json',
  });
  assert.ok(result.facilities.length >= 3);
  assert.equal(result.facilities.find(item => item.id === 'dodge').spaces.length, 5);
  assert.deepEqual(writes, [['/tmp/recreation.json', result]]);
});

test('does not write when parsing or validation fails', async () => {
  let wrote = false;
  await assert.rejects(runRecreationScraper({
    acquire: async () => acquiredFixture(),
    parsers: invalidParserFixture(),
    writeJson: async () => { wrote = true; },
    outputPath: '/tmp/recreation.json',
  }), /invalid recreation snapshot/i);
  assert.equal(wrote, false);
});
```

- [ ] **Step 2: Run CLI tests to verify they fail**

Run: `node --test tests/recreation-hours-scraper.test.mjs`

Expected: FAIL with missing `runRecreationScraper`.

- [ ] **Step 3: Implement the CLI composition root**

Parse only `--json-out`. Acquire all sources, parse each source with its matching adapter, resolve the snapshot, validate it, and write formatted JSON only after successful validation. Print the number of facilities and final date; send bounded errors to stderr and exit nonzero.

- [ ] **Step 4: Write the failing workflow assertions**

```js
test('recreation publishing runs independently every four hours', async () => {
  const workflow = await readFile('.github/workflows/update-recreation-hours.yml', 'utf8');
  assert.match(workflow, /cron: ['"](?:7|17|27|37|57) \*\/4 \* \* \*['"]/);
  assert.match(workflow, /xvfb-run --auto-servernum node scripts\/recreation-hours-scraper\.mjs/);
  assert.match(workflow, /vars\.RECREATION_HOURS_PUBLISH_ENABLED == 'true'/);
  assert.match(workflow, /vars\.RECREATION_HOURS_API_URL/);
  assert.match(workflow, /secrets\.LIBRARY_HOURS_UPDATE_SECRET/);
  assert.doesNotMatch(workflow, /DINING_HOURS_API_URL|LIBRARY_HOURS_API_URL/);
});
```

- [ ] **Step 5: Add the workflow**

Use cron `17 */4 * * *`, read-only contents permission, a unique `update-recreation-hours` concurrency group, Node 22, `npm ci`, `npx playwright install --with-deps chromium`, focused Recreation tests, headed Chromium under `xvfb-run`, and a gated retrying `curl` PUT. Set a 12-minute timeout to cover three official pages.

- [ ] **Step 6: Run workflow and CLI tests and commit**

Run: `node --test tests/recreation-hours-scraper.test.mjs tests/recreation-hours-workflow.test.mjs`

Expected: all tests PASS.

```bash
git add scripts/recreation-hours-scraper.mjs .github/workflows/update-recreation-hours.yml tests/recreation-hours-scraper.test.mjs tests/recreation-hours-workflow.test.mjs
git commit -m "feat: publish recreation hours independently"
```

---

### Task 6: Atomically hydrate top-level Recreation facilities

**Files:**
- Create: `assets/recreation-hours.js`
- Test: `tests/recreation-hours-client.test.mjs`

**Interfaces:**
- Consumes: `/api/recreation-hours` and the schema contract from Task 4.
- Produces: `globalThis.LionHourRecreationHours.buildUpdates(snapshot, venues, today)`.
- Produces: `globalThis.LionHourRecreationHours.hydrate({ venues, fetchImpl, render, setStatus, today, now })`.
- Adds to live venues: `hours`, `sourceStatuses`, `accessRestrictions`, `recreationLive`, and `recreationSpaces`.

- [ ] **Step 1: Write failing client validation and inheritance tests**

```js
test('atomically overlays Dodge, Uris Pool, and Barnard', () => {
  const venues = venueFixture();
  const result = buildUpdates(validSnapshot(), venues, '2026-08-21');
  assert.equal(result.ok, true);
  assert.deepEqual(result.entries.map(([venue]) => venue.id), ['dodge', 'uris-pool', 'barnard-fitness']);
  assert.equal(result.entries.find(([venue]) => venue.id === 'dodge')[1].recreationSpaces.length, 5);
});

test('rejects the whole overlay when one required facility or space is invalid', () => {
  assert.equal(buildUpdates(withoutSpace('levien-gymnasium'), venueFixture(), '2026-08-21').ok, false);
});

test('preserves embedded schedules when fetch fails and marks stale data', async () => {
  const original = structuredClone(venueFixture());
  const fallback = await hydrateFixture({ responseStatus: 503 });
  assert.equal(fallback.applied, false);
  assert.deepEqual(fallback.venues, original);
  assert.equal((await hydrateFixture({ ageHours: 9 })).status.kind, 'stale');
});
```

- [ ] **Step 2: Run client tests to verify they fail**

Run: `node --test tests/recreation-hours-client.test.mjs`

Expected: FAIL because `assets/recreation-hours.js` does not exist.

- [ ] **Step 3: Implement guarded client hydration**

Validate the full source manifest, the exact catalog declared by `RECREATION_FACILITIES`, the exact five-space Dodge catalog, fourteen dates, bounded statuses, access restrictions, room provenance, and pool parent constraints before producing updates. Apply every update only after the complete snapshot passes. Return `live`, `stale`, `fallback`, or `verification` status to the footer callback.

- [ ] **Step 4: Run client tests and commit**

Run: `node --test tests/recreation-hours-client.test.mjs`

Expected: all client tests PASS.

```bash
git add assets/recreation-hours.js tests/recreation-hours-client.test.mjs
git commit -m "feat: hydrate live recreation hours"
```

---

### Task 7: Render Barnard and the nested Dodge space experience

**Files:**
- Modify: `index.html`
- Create: `assets/recreation-hours-view.js`
- Modify: `tests/header-controls.test.mjs`
- Create: `tests/recreation-hours-ui.test.mjs`

**Interfaces:**
- Consumes: `recreationSpaces` and access/status fields applied in Task 6.
- Produces: a separate `barnard-fitness` top-level card.
- Produces: `globalThis.LionHourRecreationView.renderSpaces(spaces, now)` and a collapsed `View spaces` control inside Dodge details.
- Produces: footer callback `setRecreationHoursStatus(status)`.

- [ ] **Step 1: Write failing markup and behavior tests**

```js
test('loads recreation hydration after embedded Fitness cards', () => {
  assert.match(html, /<script src="assets\/recreation-hours\.js"><\/script>/);
  assert.match(html, /id="recreation-hours-status"/);
  assert.match(html, /id:'barnard-fitness'.*cat:'fitness'/s);
});

test('Dodge renders a collapsed five-space list without adding five venue cards', () => {
  assert.match(html, /<script src="assets\/recreation-hours-view\.js"><\/script>/);
  assert.match(html, /LionHourRecreationView\.renderSpaces/);
  assert.match(html, /View spaces/);
  assert.match(html, /recreation-spaces/);
  for (const id of ['blue-gym', 'levien-gymnasium', 'functional-fitness-studio', 'aerobics-room-4', 'squash-courts']) {
    assert.doesNotMatch(html, new RegExp(`id:'${id}'.*cat:'fitness'`));
  }
});

test('renders explicit maintenance, conflict, unavailable, and access copy safely', () => {
  const output = LionHourRecreationView.renderSpaces([{
    id: 'blue-gym', name: 'Blue Gym', intervals: [],
    status: 'Closed for maintenance',
    reason: 'Court repair',
    accessRestrictions: ['Reservation required'],
  }], { mins: 720 });
  assert.match(output, /Closed for maintenance/);
  assert.match(output, /Court repair/);
  assert.match(output, /Reservation required/);
});
```

- [ ] **Step 2: Run UI tests to verify they fail**

Run: `node --test tests/recreation-hours-ui.test.mjs tests/header-controls.test.mjs`

Expected: FAIL because the Recreation script, footer, Barnard card, and nested renderer are absent.

- [ ] **Step 3: Add the Barnard fallback card and Recreation footer**

Add `barnard-fitness` with conservative embedded hours only when confirmed by the official current fixture; otherwise embed `hours: ALL(null)` and the note `Current hours load from Barnard's official schedule.` Add a footer anchor to the Columbia Recreation hours page with fallback copy `Recreation hours: embedded fallback · Verify before you go`.

- [ ] **Step 4: Render nested Dodge spaces**

Add a Dodge-only nested details block. Keep its internal `View spaces` control collapsed on first render and independent from the top-level row expansion. Use text content escaping for name, status, reason, availability type, and access restrictions. Do not count nested spaces as top-level Fitness venues or sidebar totals.

Put nested rendering and HTML escaping in `assets/recreation-hours-view.js`, expose only `renderSpaces`, and load that script before the main inline renderer. This keeps source data out of string interpolation helpers embedded in `index.html` and lets the Node test execute the IIFE in a VM context.

For each nested space, derive current state from its own intervals and status. Render `Separate hours not published` and `Hours need verification` as explicit non-open states. Render reason and access restrictions on separate lines from hours.

- [ ] **Step 5: Wire hydration after initial render**

Load `assets/recreation-hours.js` after the embedded venue declaration, add `setRecreationHoursStatus`, and call:

```js
LionHourRecreationHours.hydrate({
  venues: VENUES,
  render,
  setStatus: setRecreationHoursStatus,
  today: easternISODate(),
});
```

Do not change library or dining hydration order or fallback behavior.

- [ ] **Step 6: Run all UI tests and commit**

Run: `node --test tests/recreation-hours-ui.test.mjs tests/recreation-hours-client.test.mjs tests/header-controls.test.mjs`

Expected: all UI, client, and header tests PASS.

```bash
git add index.html assets/recreation-hours-view.js tests/recreation-hours-ui.test.mjs tests/header-controls.test.mjs
git commit -m "feat: show live recreation spaces"
```

---

### Task 8: Document deployment and verify the complete system

**Files:**
- Create: `docs/recreation-hours-operations.md`
- Modify: `docs/decisions.md` only through the decisiontracker workflow after implementation commits are reachable

**Interfaces:**
- Documents: GitHub variables, shared secret, first seed, API checks, live-source failure behavior, and rollback/fallback expectations.
- Verifies: the complete implementation against the approved specification.

- [ ] **Step 1: Write operations documentation**

Document these exact repository variables:

- `RECREATION_HOURS_PUBLISH_ENABLED=true`
- `RECREATION_HOURS_API_URL=https://www.lionhour.com/api/recreation-hours`

Document that `LIBRARY_HOURS_UPDATE_SECRET` must exist as the same repository secret and Vercel environment value already used by library and dining publishing. Include the official-source inventory and exclusion reasons, first-seed steps, expected pre-seed `503`, post-seed `200`, at least the three required facilities, five nested Dodge spaces, fourteen dates, and footer live/stale/fallback states.

- [ ] **Step 2: Run the complete automated suite**

Run: `npm test`

Expected: every JavaScript test passes with zero failures.

Run: `python3 -m unittest tests/test_scrape.py -v`

Expected: all existing library scraper tests pass.

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 3: Run a live read-only Recreation scrape**

Run:

```bash
node scripts/recreation-hours-scraper.mjs --json-out /tmp/lionhour-recreation-hours.json
```

Expected: exit code 0 and a message reporting the catalog facility count, five Dodge spaces, and the fourteen-day end date. If Columbia presents an interactive challenge or an official current schedule is unavailable, report the source-specific failure and do not weaken validation to force a green run.

- [ ] **Step 4: Validate the live snapshot independently**

Run:

```bash
node -e "import('./lib/recreation-hours-schema.js').then(async ({validateRecreationHoursSnapshot}) => { const fs = await import('node:fs/promises'); const value = JSON.parse(await fs.readFile('/tmp/lionhour-recreation-hours.json', 'utf8')); const result = validateRecreationHoursSnapshot(value); console.log(JSON.stringify({ valid: result.ok, facilities: value.facilities?.length, dodgeSpaces: value.facilities?.find(item => item.id === 'dodge')?.spaces?.length, dates: value.facilities?.[0]?.days?.length, errors: result.errors }, null, 2)); process.exitCode = result.ok ? 0 : 1; })"
```

Expected: `valid: true`, `facilities` of at least `3`, `dodgeSpaces: 5`, and `dates: 14`.

- [ ] **Step 5: Commit operations documentation**

```bash
git add docs/recreation-hours-operations.md
git commit -m "docs: operate live recreation hours"
```

- [ ] **Step 6: Reconcile the approved Recreation decisions**

Verify the full reachable implementation hashes with the decisiontracker validator. Append implementation updates for the active Recreation pipeline, facility hierarchy, source-priority, and no-guessing decisions. Never edit or reorder earlier ledger entries.

- [ ] **Step 7: Perform final branch verification**

Run `npm test`, `python3 -m unittest tests/test_scrape.py -v`, `git diff --check`, and `git status --short` again on the exact tree to be integrated. Proceed to branch finishing only with zero failures and no unintended uncommitted files.
