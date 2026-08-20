# Hybrid Library Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep LionHour static-first while refreshing its six displayed library schedules every four hours through GitHub Actions, a protected Vercel API, and a latest-good Redis snapshot.

**Architecture:** GitHub Actions executes the existing Python scraper and uploads a schema-valid JSON snapshot to a Vercel Function. The function validates and atomically stores the snapshot in Upstash Redis; the static browser app renders its embedded schedules immediately, fetches the dynamic snapshot, and overlays it only after client-side validation succeeds.

**Tech Stack:** Static HTML/CSS/JavaScript, Python 3.12, `requests`, Beautiful Soup 4, Node.js 22, Vercel Functions, Upstash Redis, GitHub Actions, Node's built-in test runner, Python `unittest`.

**Spec:** `docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md`

**Implementation status (2026-08-20):** Tasks 1–5 are implemented and locally verified. A post-review amendment permits an explicit Lehman-only embedded fallback for Columbia's suspicious overnight source interval, allowing five live updates without guessed Lehman hours. Task 6 remains an external rollout checklist because provisioning Upstash, configuring Vercel/GitHub secrets and variables, deploying, and enabling production publishing require the project owner's accounts.

## Global Constraints

- Keep `index.html` and static assets as the primary website; do not migrate to Next.js or another frontend framework.
- Only the six existing library cards (`butler`, `noco`, `lehman`, `uris`, `avery`, and `math`) receive dynamic hours in this release.
- Keep scraper IDs, Columbia slugs, and frontend venue IDs explicit; never derive application identity from a source slug.
- Treat explicit closure and unparseable source text as distinct parser outcomes; any parse error rejects publication.
- Allow overnight-style intervals only for Butler; convert the known Lehman anomaly to an explicit embedded-fallback entry and reject raw close times at or before opening for the other displayed libraries.
- Render embedded schedules before making a network request, and retain them on every dynamic-data failure path.
- Show the generated timestamp for live data and visibly mark data older than eight hours or embedded fallback data as stale.
- Never overwrite the latest successful snapshot with partial, missing, unparseable, unauthenticated, or schema-invalid data.
- Use GitHub Actions schedule `17 */4 * * *` and retain a manual `workflow_dispatch` trigger.
- Store the update secret only in GitHub Actions secrets and Vercel environment variables.
- Use `lionhour:library-hours:v1` as the sole Redis key and schema version `1` as the only accepted payload version.
- Preserve unrelated working-tree changes and do not modify non-library venue hours.

---

## File Structure

### Create

- `tests/fixtures/butler-august-2026.html` — minimal representative Columbia calendar markup, including open, closed, and intersession days.
- `tests/fixtures/butler-august-2026-full.html` — fuller captured Columbia calendar table with adjacent-month cells and notes.
- `tests/test_scrape.py` — Python parser, payload, and failure-policy tests.
- `lib/library-hours-schema.js` — runtime validator shared by the API and frontend-compatible tests.
- `lib/library-hours-service.js` — method dispatch, authentication, and response construction independent of Vercel and Redis.
- `lib/library-hours-store.js` — Upstash-backed `getSnapshot` and `putSnapshot` adapter.
- `api/library-hours.js` — thin Vercel request/response adapter.
- `assets/library-hours.js` — browser fetch, validation, and venue-overlay functions.
- `tests/library-hours-schema.test.mjs` — JSON-contract tests.
- `tests/library-hours-service.test.mjs` — API behavior tests using an in-memory store.
- `tests/library-hours-client.test.mjs` — static-first hydration and fallback tests.
- `tests/helpers/library-hours-fixture.mjs` — one complete valid snapshot factory shared by Node tests.
- `.github/workflows/update-library-hours.yml` — scheduled and manually dispatched scraper publisher.
- `package.json` and `package-lock.json` — Node runtime dependency and test commands.

### Modify

- `scrape.py` — separate scraping from output, validate the six displayed libraries, and add JSON-file output for CI.
- `requirements.txt` — pin compatible major versions for CI reproducibility.
- `.gitignore` — stop ignoring `requirements.txt`; ignore `node_modules/` and `.venv/`; continue ignoring generated `data.js` and logs.
- `index.html` — load the browser helper, replace the synchronous `data.js` overlay, and hydrate asynchronously after the first render.
- `vercel.json` — configure the Node function duration and retain static output settings without adding Vercel Cron.
- `docs/decisions.md` — append the approved architecture decision using the decision-tracker workflow.

---

### Task 1: Establish the scraper's tested output contract

**Files:**
- Create: `tests/fixtures/butler-august-2026.html`
- Create: `tests/test_scrape.py`
- Modify: `scrape.py`
- Modify: `requirements.txt`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `build_payload(reference_datetime: datetime, fetcher: Callable) -> dict`
- Produces: `validate_publishable_payload(payload: dict, required_ids: set[str]) -> list[str]`
- Produces: CLI option `--json-out PATH` that writes the raw payload as UTF-8 JSON and exits nonzero when validation fails.
- Preserves: `python3 scrape.py --dry-run` for human-readable JavaScript output.

- [ ] **Step 1: Make Python dependencies trackable and reproducible**

Replace `requirements.txt` with:

```text
beautifulsoup4>=4.12,<5
requests>=2.32,<3
```

Remove only the `requirements.txt` line from `.gitignore`; add `node_modules/` and `.venv/`; leave `scrape.log` and `data.js` ignored. Confirm `git status --short` reports `requirements.txt` as an untracked file before it is added with the rest of this task.

- [ ] **Step 2: Add a representative calendar fixture**

Create `tests/fixtures/butler-august-2026.html` with the source DOM classes the scraper relies on:

```html
<table class="calendar">
  <tr>
    <td><div class="day-date">19</div><div class="fulldate d-none">2026-08-19</div><div class="day-hours">9:00AM-9:00PM</div></td>
    <td><div class="day-date">20</div><div class="fulldate d-none">2026-08-20</div><div class="day-hours">9:00AM-9:00PM</div><div class="day-note">Intersession</div></td>
    <td><div class="day-date">23</div><div class="fulldate d-none">2026-08-23</div><div class="day-hours">Closed</div></td>
  </tr>
</table>
```

- [ ] **Step 3: Write failing parser and validation tests**

In `tests/test_scrape.py`, import the production functions and assert real behavior:

```python
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup

from scrape import (
    DISPLAYED_LIBRARY_IDS,
    extract_schedule_from_page,
    parse_hours_text,
    validate_publishable_payload,
)


class ScraperContractTests(unittest.TestCase):
    def test_extracts_open_and_closed_calendar_days(self):
        html = Path("tests/fixtures/butler-august-2026.html").read_text()
        schedule = extract_schedule_from_page(BeautifulSoup(html, "html.parser"))
        self.assertEqual(schedule["2026-08-20"], {"open": "09:00", "close": "21:00"})
        self.assertIsNone(schedule["2026-08-23"])

    def test_rejects_snapshot_missing_a_displayed_library(self):
        payload = {
            "schemaVersion": 1,
            "generated": "2026-08-20T12:00:00-04:00",
            "generatedDisplay": "August 20, 2026 at 12:00 PM",
            "libraries": [],
        }
        errors = validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS)
        self.assertIn("missing required library: butler_24", errors)

    def test_closed_is_valid_but_scrape_failed_is_not_publishable(self):
        payload = make_complete_payload()
        payload["libraries"][0]["scrapeFailed"] = True
        errors = validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS)
        self.assertIn("butler_24: scrape failed", errors)
```

Add this complete test-data factory in the test module; do not call the network from unit tests:

```python
def make_complete_payload():
    required = ["avery", "business", "butler_24", "lehman", "math", "science_engineering"]
    libraries = []
    for library_id in required:
        slug = library_id.replace("_", "-")
        libraries.append({
            "id": library_id,
            "name": library_id,
            "url": f"https://hours.library.columbia.edu/locations/{slug}",
            "note": None,
            "temporarilyClosed": False,
            "schedules": [{
                "label": "Current",
                "start": "2026-08-16",
                "end": "2026-08-22",
                "hours": {
                    "0": None,
                    "1": {"open": "09:00", "close": "21:00"},
                    "2": {"open": "09:00", "close": "21:00"},
                    "3": {"open": "09:00", "close": "21:00"},
                    "4": {"open": "09:00", "close": "21:00"},
                    "5": {"open": "09:00", "close": "19:00"},
                    "6": {"open": "11:00", "close": "18:00"},
                },
            }],
        })
    return {
        "schemaVersion": 1,
        "generated": "2026-08-20T12:00:00-04:00",
        "generatedDisplay": "August 20, 2026 at 12:00 PM",
        "libraries": libraries,
    }
```

- [ ] **Step 4: Run the tests and verify the expected red state**

Run:

```bash
python3 -m unittest tests/test_scrape.py -v
```

Expected: failure because `DISPLAYED_LIBRARY_IDS` and `validate_publishable_payload` do not exist.

- [ ] **Step 5: Add the displayed-library contract and payload validator**

In `scrape.py`, add:

```python
DISPLAYED_LIBRARIES = [
    {"id": "butler_24", "slug": "butler-24", "venue_id": "butler", "name": "Butler Library"},
    {"id": "science_engineering", "slug": "science-engineering", "venue_id": "noco", "name": "NoCo Library"},
    {"id": "lehman", "slug": "lehman", "venue_id": "lehman", "name": "Lehman Social Sciences Library"},
    {"id": "business", "slug": "business", "venue_id": "uris", "name": "Uris Library"},
    {"id": "avery", "slug": "avery", "venue_id": "avery", "name": "Avery Library"},
    {"id": "math", "slug": "math", "venue_id": "math", "name": "Mathematics Library"},
]
DISPLAYED_LIBRARY_IDS = {entry["id"] for entry in DISPLAYED_LIBRARIES}


def validate_publishable_payload(payload: dict, required_ids: set[str]) -> list[str]:
    errors = []
    if payload.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    libraries = {entry.get("id"): entry for entry in payload.get("libraries", [])}
    for library_id in sorted(required_ids):
        entry = libraries.get(library_id)
        if entry is None:
            errors.append(f"missing required library: {library_id}")
            continue
        if entry.get("scrapeFailed"):
            errors.append(f"{library_id}: scrape failed")
        if not entry.get("schedules"):
            errors.append(f"{library_id}: no schedules")
    return errors
```

Extend this minimum implementation in the same TDD loop with one failing test at a time for schedule coverage of the generated Eastern date, canonical time strings, and allowed Columbia source URLs.

- [ ] **Step 6: Run the scraper tests and verify green**

Run:

```bash
python3 -m unittest tests/test_scrape.py -v
```

Expected: all scraper contract tests pass without network requests.

- [ ] **Step 7: Add test-first JSON output and pure payload construction**

Add a failing test that injects a fake `fetcher`, calls `build_payload`, and asserts `schemaVersion`, generated timestamps, and all library entries. Add a second failing CLI-level test that invokes `main(["--json-out", output_path])` with an injected builder and asserts that invalid data returns `1` without creating the destination file.

Refactor the production code to these signatures:

```python
def build_payload(reference_datetime: datetime, fetcher=fetch_library_page) -> dict:
    results = [scrape_library(definition, reference_datetime, fetcher) for definition in LIBRARIES]
    return {
        "schemaVersion": 1,
        "generated": reference_datetime.astimezone().isoformat(),
        "generatedDisplay": reference_datetime.strftime("%B %d, %Y at %I:%M %p"),
        "libraries": results,
    }


def write_json_atomic(path: str, payload: dict) -> None:
    destination = Path(path)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary.replace(destination)
```

Change `scrape_library` to accept the injected fetcher. Parse CLI arguments with `argparse`, validate before any `--json-out` write, and retain the existing JavaScript dry-run renderer as a separate pure function.

- [ ] **Step 8: Verify the complete Python task**

Run:

```bash
python3 -m unittest tests/test_scrape.py -v
python3 scrape.py --help
```

Expected: tests pass; help documents `--dry-run` and `--json-out PATH`.

- [ ] **Step 9: Commit the scraper contract**

```bash
git add .gitignore requirements.txt scrape.py tests/test_scrape.py tests/fixtures/butler-august-2026.html
git commit -m "feat: validate library hours snapshots"
```

---

### Task 2: Add the shared JavaScript schema validator

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `lib/library-hours-schema.js`
- Create: `tests/helpers/library-hours-fixture.mjs`
- Create: `tests/library-hours-schema.test.mjs`

**Interfaces:**
- Produces: `validateLibraryHoursSnapshot(value, options?) -> { ok: true, value } | { ok: false, errors }`
- Produces: `REQUIRED_LIBRARY_IDS` and `SCRAPER_TO_VENUE_ID` constants.
- Consumes: schema version `1` and the JSON contract from Task 1.

- [ ] **Step 1: Add the Node project test command**

Create `package.json`:

```json
{
  "name": "lionhour",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22 <23" },
  "scripts": {
    "test": "node --test tests/*.test.mjs"
  },
  "dependencies": {
    "@upstash/redis": "^1.35.0"
  }
}
```

Run `npm install` to generate `package-lock.json`. Use the current compatible `@upstash/redis` release if npm resolves a newer `1.x` version, and commit the exact lockfile resolution.

- [ ] **Step 2: Create the shared valid snapshot fixture**

Create `tests/helpers/library-hours-fixture.mjs`:

```js
const ids = ['avery', 'business', 'butler_24', 'lehman', 'math', 'science_engineering'];

export function makeValidSnapshot() {
  return {
    schemaVersion: 1,
    generated: '2026-08-20T12:00:00-04:00',
    generatedDisplay: 'August 20, 2026 at 12:00 PM',
    libraries: ids.map((id) => ({
      id,
      name: id,
      url: `https://hours.library.columbia.edu/locations/${id.replaceAll('_', '-')}`,
      note: null,
      temporarilyClosed: false,
      schedules: [{
        label: 'Current',
        start: '2026-08-16',
        end: '2026-08-22',
        hours: {
          0: null,
          1: { open: '09:00', close: '21:00' },
          2: { open: '09:00', close: '21:00' },
          3: { open: '09:00', close: '21:00' },
          4: { open: '09:00', close: '21:00' },
          5: { open: '09:00', close: '19:00' },
          6: { open: '11:00', close: '18:00' },
        },
      }],
    })),
  };
}
```

- [ ] **Step 3: Write failing contract tests**

Create `tests/library-hours-schema.test.mjs` with a complete valid snapshot factory and separate tests that reject an absent required library, malformed time, non-Columbia URL, missing active schedule, and `scrapeFailed: true`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { validateLibraryHoursSnapshot } from '../lib/library-hours-schema.js';
import { makeValidSnapshot } from './helpers/library-hours-fixture.mjs';

test('accepts a complete current snapshot', () => {
  const result = validateLibraryHoursSnapshot(makeValidSnapshot());
  assert.equal(result.ok, true);
});

test('rejects malformed hours without coercing them to closed', () => {
  const snapshot = makeValidSnapshot();
  snapshot.libraries[0].schedules[0].hours['4'].open = '9 AM';
  const result = validateLibraryHoursSnapshot(snapshot);
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /HH:MM/);
});
```

- [ ] **Step 4: Run schema tests and verify red**

Run:

```bash
npm test -- tests/library-hours-schema.test.mjs
```

Expected: module-not-found failure for `lib/library-hours-schema.js`.

- [ ] **Step 5: Implement the validator without adding a schema framework**

Create `lib/library-hours-schema.js` using focused predicates and return structured results rather than throwing for untrusted input:

```js
export const SCRAPER_TO_VENUE_ID = Object.freeze({
  butler_24: 'butler',
  science_engineering: 'noco',
  lehman: 'lehman',
  business: 'uris',
  avery: 'avery',
  math: 'math',
});

export const REQUIRED_LIBRARY_IDS = Object.freeze(Object.keys(SCRAPER_TO_VENUE_ID));

const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function easternDate(timestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(timestamp));
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function validateHours(hours, path, errors) {
  if (!isRecord(hours)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (let day = 0; day < 7; day += 1) {
    const value = hours[String(day)];
    if (value === null) continue;
    if (!isRecord(value)) {
      errors.push(`${path}.${day} must be null or an hours object`);
      continue;
    }
    if (!OPEN_TIME.test(value.open || '') || !CLOSE_TIME.test(value.close || '')) {
      errors.push(`${path}.${day} times must use HH:MM`);
    }
  }
}

export function validateLibraryHoursSnapshot(value) {
  const errors = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ['snapshot must be an object'] };
  }
  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (Number.isNaN(Date.parse(value.generated))) errors.push('generated must be an ISO timestamp');
  if (!Array.isArray(value.libraries)) {
    errors.push('libraries must be an array');
    return { ok: false, errors };
  }
  const seen = new Set();
  const generatedDate = Number.isNaN(Date.parse(value.generated)) ? null : easternDate(value.generated);
  for (const [index, library] of value.libraries.entries()) {
    const path = `libraries[${index}]`;
    if (!isRecord(library)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    if (typeof library.id !== 'string' || seen.has(library.id)) errors.push(`${path}.id must be unique`);
    seen.add(library.id);
    try {
      if (new URL(library.url).hostname !== 'hours.library.columbia.edu') errors.push(`${path}.url must use hours.library.columbia.edu`);
    } catch {
      errors.push(`${path}.url must use hours.library.columbia.edu`);
    }
    if (library.scrapeFailed === true) errors.push(`${library.id}: scrape failed`);
    if (!Array.isArray(library.schedules)) {
      errors.push(`${path}.schedules must be an array`);
      continue;
    }
    let coversGeneratedDate = false;
    for (const [scheduleIndex, schedule] of library.schedules.entries()) {
      const schedulePath = `${path}.schedules[${scheduleIndex}]`;
      if (!isRecord(schedule) || !ISO_DATE.test(schedule.start || '') || !ISO_DATE.test(schedule.end || '')) {
        errors.push(`${schedulePath} must have ISO start and end dates`);
        continue;
      }
      if (generatedDate && schedule.start <= generatedDate && generatedDate <= schedule.end) coversGeneratedDate = true;
      validateHours(schedule.hours, `${schedulePath}.hours`, errors);
    }
    if (!coversGeneratedDate) errors.push(`${library.id}: no schedule covers generated date`);
  }
  for (const id of REQUIRED_LIBRARY_IDS) {
    if (!seen.has(id)) errors.push(`missing required library: ${id}`);
  }
  return errors.length ? { ok: false, errors } : { ok: true, value };
}
```

Do not mutate or normalize the received object.

- [ ] **Step 6: Verify schema tests and the existing Node suite**

Run:

```bash
npm test
```

Expected: the new schema tests and all pre-existing `.test.mjs` tests pass.

- [ ] **Step 7: Commit the shared contract**

```bash
git add package.json package-lock.json lib/library-hours-schema.js tests/helpers/library-hours-fixture.mjs tests/library-hours-schema.test.mjs
git commit -m "feat: define library hours data contract"
```

---

### Task 3: Implement latest-good storage and the Vercel API

**Files:**
- Create: `lib/library-hours-service.js`
- Create: `lib/library-hours-store.js`
- Create: `api/library-hours.js`
- Create: `tests/library-hours-service.test.mjs`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `validateLibraryHoursSnapshot` from Task 2.
- Produces: `createLibraryHoursService({ store, updateSecret })` with `handle({ method, authorization, body })`.
- Produces: store interface `{ getSnapshot(): Promise<object|null>, putSnapshot(snapshot): Promise<void> }`.
- Produces: public `GET /api/library-hours` and protected `PUT /api/library-hours`.

- [ ] **Step 1: Write failing service tests with an in-memory store**

Create `tests/library-hours-service.test.mjs`. Use a real in-memory adapter rather than mocking method call counts:

```js
import assert from 'node:assert/strict';
import test from 'node:test';
import { createLibraryHoursService } from '../lib/library-hours-service.js';
import { makeValidSnapshot } from './helpers/library-hours-fixture.mjs';

function createMemoryStore(initial = null) {
  let snapshot = initial;
  return {
    async getSnapshot() { return snapshot; },
    async putSnapshot(next) { snapshot = structuredClone(next); },
    inspect() { return snapshot; },
  };
}

test('returns the current snapshot with public cache headers', async () => {
  const snapshot = makeValidSnapshot();
  const service = createLibraryHoursService({ store: createMemoryStore(snapshot), updateSecret: 'test-secret' });
  const response = await service.handle({ method: 'GET', authorization: null, body: null });
  assert.equal(response.status, 200);
  assert.equal(response.headers['Cache-Control'], 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600');
  assert.deepEqual(response.body, snapshot);
});

test('does not replace good data when an upload is invalid', async () => {
  const existing = makeValidSnapshot();
  const store = createMemoryStore(existing);
  const service = createLibraryHoursService({ store, updateSecret: 'test-secret' });
  const response = await service.handle({
    method: 'PUT',
    authorization: 'Bearer test-secret',
    body: { schemaVersion: 1, libraries: [] },
  });
  assert.equal(response.status, 422);
  assert.deepEqual(store.inspect(), existing);
});
```

Also cover `401` for missing/wrong authorization, `503` for no stored snapshot, `405` for other methods, `500` on store failure without including secrets or stack traces, and `204` for a valid update.

- [ ] **Step 2: Run service tests and verify red**

Run:

```bash
npm test -- tests/library-hours-service.test.mjs
```

Expected: module-not-found failure for `lib/library-hours-service.js`.

- [ ] **Step 3: Implement the transport-independent service**

Create `lib/library-hours-service.js` with a timing-safe secret comparison and plain response objects:

```js
import { timingSafeEqual } from 'node:crypto';
import { validateLibraryHoursSnapshot } from './library-hours-schema.js';

function secretsMatch(authorization, expectedSecret) {
  const actual = authorization?.startsWith('Bearer ') ? authorization.slice(7) : '';
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expectedSecret || '');
  return actualBytes.length === expectedBytes.length
    && actualBytes.length > 0
    && timingSafeEqual(actualBytes, expectedBytes);
}

export function createLibraryHoursService({ store, updateSecret }) {
  return {
    async handle(request) {
      if (request.method === 'GET') {
        const snapshot = await store.getSnapshot();
        return snapshot
          ? { status: 200, headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600' }, body: snapshot }
          : { status: 503, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Library hours are not initialized' } };
      }
      if (request.method !== 'PUT') return { status: 405, headers: { Allow: 'GET, PUT' }, body: { error: 'Method not allowed' } };
      if (!secretsMatch(request.authorization, updateSecret)) return { status: 401, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Unauthorized' } };
      const validation = validateLibraryHoursSnapshot(request.body);
      if (!validation.ok) return { status: 422, headers: { 'Cache-Control': 'no-store' }, body: { error: 'Invalid snapshot', details: validation.errors } };
      await store.putSnapshot(validation.value);
      return { status: 204, headers: { 'Cache-Control': 'no-store' }, body: null };
    },
  };
}
```

Wrap storage operations so runtime failures produce a generic `500` response and server-side logging excludes authorization headers and request bodies.

- [ ] **Step 4: Implement the Upstash adapter**

Create `lib/library-hours-store.js`:

```js
import { Redis } from '@upstash/redis';

export const LIBRARY_HOURS_KEY = 'lionhour:library-hours:v1';

export function createLibraryHoursStore(redis = Redis.fromEnv()) {
  return {
    async getSnapshot() {
      return redis.get(LIBRARY_HOURS_KEY);
    },
    async putSnapshot(snapshot) {
      await redis.set(LIBRARY_HOURS_KEY, snapshot);
    },
  };
}
```

- [ ] **Step 5: Add the thin Vercel adapter**

Create `api/library-hours.js`. Read `req.method`, `req.headers.authorization`, and `req.body`, call the service, set every returned header, and end without a body for status `204`:

```js
import { createLibraryHoursService } from '../lib/library-hours-service.js';
import { createLibraryHoursStore } from '../lib/library-hours-store.js';

export default async function handler(req, res) {
  const service = createLibraryHoursService({
    store: createLibraryHoursStore(),
    updateSecret: process.env.LIBRARY_HOURS_UPDATE_SECRET,
  });
  const result = await service.handle({
    method: req.method,
    authorization: req.headers.authorization,
    body: req.body,
  });
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.status === 204) return res.status(204).end();
  return res.status(result.status).json(result.body);
}
```

- [ ] **Step 6: Configure the function without adding Vercel Cron**

Update `vercel.json` to:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": null,
  "buildCommand": null,
  "outputDirectory": ".",
  "cleanUrls": true,
  "functions": {
    "api/library-hours.js": {
      "maxDuration": 10
    }
  }
}
```

- [ ] **Step 7: Verify API tests and configuration syntax**

Run:

```bash
npm test
python3 -m json.tool vercel.json
```

Expected: all Node tests pass and `vercel.json` parses successfully.

- [ ] **Step 8: Commit the API and store**

```bash
git add api/library-hours.js lib/library-hours-service.js lib/library-hours-store.js tests/library-hours-service.test.mjs vercel.json
git commit -m "feat: serve latest library hours snapshot"
```

---

### Task 4: Hydrate the static frontend from the dynamic API

**Files:**
- Create: `assets/library-hours.js`
- Create: `tests/library-hours-client.test.mjs`
- Modify: `index.html:378-379`
- Modify: `index.html:549-576`
- Modify: `index.html:919-925`

**Interfaces:**
- Consumes: `GET /api/library-hours` and `SCRAPER_TO_VENUE_ID` mapping from Task 2's contract.
- Produces: browser global `LionHourLibraryHours` with `buildUpdates` and `hydrate`.
- Preserves: synchronous initial `render()` using embedded `VENUES` schedules.

- [ ] **Step 1: Write failing client tests**

Create `tests/library-hours-client.test.mjs` and execute `assets/library-hours.js` in a `vm` sandbox with injected `fetch`. Assert that a valid response updates only mapped library venues, an invalid response leaves every venue unchanged, a rejected request leaves every venue unchanged, and the successful path calls `render` once after applying data.

```js
test('keeps embedded schedules when the API request fails', async () => {
  const venues = [
    { id: 'butler', hours: { 4: [['00:00', '24:00']] }, note: 'embedded' },
    { id: 'noco', hours: { 4: [['09:00', '23:00']] } },
    { id: 'dodge', hours: { 4: [['06:00', '22:00']] } },
  ];
  const before = structuredClone(venues);
  const result = await api.hydrate({
    venues,
    fetchImpl: async () => { throw new Error('offline'); },
    render: () => assert.fail('failed hydration must not rerender'),
    today: '2026-08-20',
  });
  assert.equal(result.applied, false);
  assert.deepEqual(venues, before);
});
```

- [ ] **Step 2: Run the client test and verify red**

Run:

```bash
npm test -- tests/library-hours-client.test.mjs
```

Expected: failure because `assets/library-hours.js` does not exist.

- [ ] **Step 3: Implement fetch, validate, and atomic overlay behavior**

Create `assets/library-hours.js` as a browser-compatible IIFE. Validate into a temporary update map before mutating `venues`; never partially apply a response:

```js
(function exposeLibraryHours(global) {
  const ID_MAP = {
    butler_24: 'butler', science_engineering: 'noco', lehman: 'lehman',
    business: 'uris', avery: 'avery', math: 'math',
  };

  async function hydrate({ venues, fetchImpl = global.fetch, render, today }) {
    try {
      const response = await fetchImpl('/api/library-hours', { headers: { Accept: 'application/json' } });
      if (!response.ok) return { applied: false, reason: `http-${response.status}` };
      const snapshot = await response.json();
      const updates = buildUpdates(snapshot, venues, today);
      if (!updates.ok) return { applied: false, reason: 'invalid-data' };
      for (const [venue, next] of updates.entries) Object.assign(venue, next);
      render();
      return { applied: true, generated: snapshot.generated };
    } catch {
      return { applied: false, reason: 'network-error' };
    }
  }

  global.LionHourLibraryHours = { hydrate, buildUpdates };
})(globalThis);
```

Implement `buildUpdates` to require schema version `1`, exactly one entry for every mapped scraper ID, a matching schedule where `start <= today <= end`, all day keys `0` through `6`, and valid time pairs. Convert each source day to `[[open, close]]` or `null`. Preserve notes only when they are non-empty strings.

- [ ] **Step 4: Replace the obsolete generated-script path in `index.html`**

Replace:

```html
<script src="data.js"></script>
```

with:

```html
<script src="assets/library-hours.js"></script>
```

Remove the synchronous `LIONHOUR_DATA` overlay block while retaining the venue definitions and embedded schedules.

- [ ] **Step 5: Preserve static-first rendering and start hydration afterward**

At the bottom of `index.html`, keep one immediate render, remove the existing duplicate consecutive `render()` call, and then hydrate:

```js
updateClock();
render();

LionHourLibraryHours.hydrate({
  venues: VENUES,
  render,
  today: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
});

setInterval(updateClock, 1000);
setInterval(render, 60000);
```

Do not display an error banner for fallback operation; the footer already tells visitors to verify changing hours.

- [ ] **Step 6: Verify client behavior and existing UI regressions**

Run:

```bash
npm test
```

Expected: all schema, service, client, header, and campus tests pass.

- [ ] **Step 7: Commit static-first hydration**

```bash
git add assets/library-hours.js index.html tests/library-hours-client.test.mjs
git commit -m "feat: hydrate library cards from live data"
```

---

### Task 5: Schedule authenticated updates with GitHub Actions

**Files:**
- Create: `.github/workflows/update-library-hours.yml`
- Modify: `tests/test_scrape.py`

**Interfaces:**
- Consumes: `python3 scrape.py --json-out PATH` from Task 1.
- Consumes: `PUT https://lionhour.com/api/library-hours` from Task 3.
- Consumes secret: `LIBRARY_HOURS_UPDATE_SECRET` in GitHub and Vercel.
- Produces: a refresh at minute 17 every four UTC hours plus manual dispatch.

- [ ] **Step 1: Add a failing CLI integration test**

Add a subprocess test that runs the scraper against injected local fixture responses, writes a temporary JSON file, parses it, and asserts schema version `1` plus the six required IDs. Keep network access disabled in this test by supplying a fixture fetcher through the Python API rather than patching `requests.get`.

- [ ] **Step 2: Run the Python tests and verify red**

Run:

```bash
python3 -m unittest tests/test_scrape.py -v
```

Expected: the new integration test fails until the CLI path uses `build_payload`, validates it, and writes atomically.

- [ ] **Step 3: Complete the CLI integration and verify green**

Route the CLI through `build_payload`, call `validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS)`, return `1` before writing when the returned error list is non-empty, and call `write_json_atomic` only for a valid payload. Then rerun:

```bash
python3 -m unittest tests/test_scrape.py -v
```

Expected: all Python tests pass.

- [ ] **Step 4: Create the least-privilege workflow**

Create `.github/workflows/update-library-hours.yml`:

```yaml
name: Update library hours

on:
  schedule:
    - cron: '17 */4 * * *'
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: update-library-hours
  cancel-in-progress: false

jobs:
  scrape-and-publish:
    runs-on: ubuntu-24.04
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: pip
      - run: pip install -r requirements.txt
      - name: Test scraper
        run: python -m unittest tests/test_scrape.py -v
      - name: Scrape current library hours
        run: python scrape.py --json-out "$RUNNER_TEMP/library-hours.json"
      - name: Publish validated snapshot
        if: vars.LIBRARY_HOURS_PUBLISH_ENABLED == 'true'
        env:
          UPDATE_SECRET: ${{ secrets.LIBRARY_HOURS_UPDATE_SECRET }}
          API_URL: ${{ vars.LIBRARY_HOURS_API_URL }}
        run: >-
          curl --fail-with-body --silent --show-error
          --retry 3 --retry-all-errors
          -X PUT "$API_URL"
          -H "Authorization: Bearer $UPDATE_SECRET"
          -H "Content-Type: application/json"
          --data-binary "@$RUNNER_TEMP/library-hours.json"
```

Do not grant `contents: write`; this architecture does not commit generated snapshots.

- [ ] **Step 5: Validate workflow syntax locally**

Run:

```bash
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/update-library-hours.yml', aliases: true); puts 'valid yaml'"
```

Expected: `valid yaml` and exit code `0`.

- [ ] **Step 6: Run all local automated tests**

Run:

```bash
python3 -m unittest tests/test_scrape.py -v
npm test
python3 -m json.tool vercel.json
```

Expected: every command exits `0`.

- [ ] **Step 7: Commit the scheduled publisher**

```bash
git add .github/workflows/update-library-hours.yml scrape.py tests/test_scrape.py
git commit -m "ci: refresh library hours every four hours"
```

---

### Task 6: Provision secrets, seed staging, and verify the full data path

**Files:**
- No source files created.
- Verify: Vercel project environment, Upstash integration, GitHub Actions secret, production deployment logs.

**Interfaces:**
- Consumes: `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` injected by the Vercel Marketplace integration.
- Consumes: identical `LIBRARY_HOURS_UPDATE_SECRET` values in Vercel and GitHub.
- Produces: initialized Redis key `lionhour:library-hours:v1` and a working public endpoint.

- [ ] **Step 1: Provision Upstash through the Vercel Marketplace**

In the Vercel dashboard, open the LionHour project, select Storage/Marketplace, add Upstash Redis, and connect it to Production and Preview. Confirm the project receives `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`; do not copy either value into repository files.

- [ ] **Step 2: Generate and configure the shared update secret**

Generate a 32-byte value locally:

```bash
openssl rand -hex 32
```

Add it to Vercel as `LIBRARY_HOURS_UPDATE_SECRET` for Production and Preview. Add the exact same value under GitHub repository Settings → Secrets and variables → Actions with the name `LIBRARY_HOURS_UPDATE_SECRET`. Do not print the value in shell history or workflow logs.

- [ ] **Step 3: Deploy the API and frontend before publishing data**

Push or merge the implementation commits through the repository's normal Vercel Git integration. Confirm the production deployment succeeds and that this uninitialized read fails safely:

```bash
curl --fail-with-body --silent --show-error https://lionhour.com/api/library-hours
```

Expected before seeding: HTTP `503` with `{"error":"Library hours are not initialized"}`; the website still renders embedded library hours.

- [ ] **Step 4: Trigger the GitHub workflow manually**

Open Actions → Update library hours → Run workflow on the default branch. Confirm the scraper tests pass, six displayed libraries validate, and the publish request returns success. Because the update endpoint returns `204`, the curl step should produce no body and exit `0`.

- [ ] **Step 5: Verify the public snapshot without exposing credentials**

Run:

```bash
curl --fail-with-body --silent --show-error https://lionhour.com/api/library-hours
```

Inspect that `schemaVersion` is `1`, `generated` matches the manual workflow time, and the response contains `butler_24`, `science_engineering`, `lehman`, `business`, `avery`, and `math`.

- [ ] **Step 6: Verify the browser's current Butler result against the source**

Open LionHour and Columbia's Butler building-hours page for the same Eastern date. Confirm LionHour's Butler current status, today's range, and expanded seven-day rows correspond to the source calendar. Repeat one closed-day comparison for another displayed library.

- [ ] **Step 7: Prove failed updates preserve the latest-good snapshot**

Capture the public response's `generated` value. Send an authenticated but invalid payload from a local secure shell, verify HTTP `422`, then read the public endpoint again and confirm `generated` is unchanged. Do not place the bearer value in a committed script.

- [ ] **Step 8: Observe the first scheduled run**

After the next `17 */4 * * *` boundary, confirm GitHub records a successful scheduled run and that the public `generated` timestamp advances. A short GitHub scheduling delay is acceptable; an absent or failed run requires checking Actions status and alert email before rollout is considered complete.

---

### Task 7: Final verification, documentation reconciliation, and rollback drill

**Files:**
- Modify: `docs/decisions.md` through the decision-tracker validator only.
- Verify: all implementation files and deployment behavior.

**Interfaces:**
- Consumes: all preceding task outputs.
- Produces: validated repository state, reconciled decision record, and a rehearsed rollback procedure.

- [ ] **Step 1: Run the complete local verification suite fresh**

Run:

```bash
python3 -m unittest tests/test_scrape.py -v
npm test
python3 -m json.tool vercel.json
ruby -e "require 'yaml'; YAML.load_file('.github/workflows/update-library-hours.yml', aliases: true); puts 'valid yaml'"
git diff --check
```

Expected: every command exits `0`, all tests pass, YAML and JSON parse, and `git diff --check` emits no output.

- [ ] **Step 2: Review requirements against the design spec**

Confirm each requirement in `docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md` has evidence:

- static page renders before API completion;
- all six library IDs are present; normal entries update from the snapshot and an explicit Lehman fallback retains embedded hours;
- invalid and partial data cannot mutate either browser venues or Redis;
- GET is public and cacheable;
- PUT is authenticated and non-cacheable;
- no Vercel Cron is configured;
- GitHub schedule and manual dispatch both work;
- secrets are absent from Git history and logs;
- built-in schedules remain usable during API failure.

- [ ] **Step 3: Reconcile the architecture decision**

Use the `decisiontracker` validation script to append the implementation update with the verified implementation commit. Do not edit an earlier ledger entry or stage changes as part of tracking.

- [ ] **Step 4: Perform a rollback drill in Preview**

In a temporary branch or Preview deployment, remove the hydration call or force `/api/library-hours` to return `503`. Confirm all venue cards still render from embedded schedules and non-library behavior is unchanged. Restore the Preview branch after recording the result; do not alter Production for this drill.

- [ ] **Step 5: Record production evidence**

Capture the final GitHub Actions run URL, Vercel deployment identifier, public snapshot `generated` timestamp, and the two manually compared libraries in the task/PR description. Do not put secrets, tokens, or authenticated URLs in that evidence.

- [ ] **Step 6: Commit any final non-ledger documentation changes**

If the rollout produced documentation corrections, commit only those reviewed files:

```bash
git add docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md docs/superpowers/plans/2026-08-20-hybrid-library-hours.md
git commit -m "docs: document hybrid library hours rollout"
```

Do not stage `docs/decisions.md` automatically; decision tracking explicitly leaves staging and commit decisions to the user or implementation workflow.

---

## Rollback Procedure

1. Disable `.github/workflows/update-library-hours.yml` in GitHub Actions to stop writes.
2. Revert only the frontend hydration commit to restore embedded schedules immediately.
3. If the API itself is faulty, revert the API/store commit after the frontend no longer calls it.
4. Leave the Redis value in place unless policy requires deletion; it contains public hours and no user data.
5. Verify `https://lionhour.com` renders every category and that Butler uses the embedded schedule.
6. Preserve failed workflow and Vercel logs for diagnosis, ensuring authorization values remain masked.

## Completion Criteria

- A manual and a scheduled GitHub Actions run both publish valid snapshots.
- The public API returns the latest snapshot with the required cache policy.
- LionHour applies every live library schedule without delaying its initial static render and reports any explicit Lehman fallback.
- Network, schema, authentication, scraper, and storage failures preserve the last usable hours.
- All Python and Node tests pass, configuration files parse, and the production comparison matches Columbia's published hours.
