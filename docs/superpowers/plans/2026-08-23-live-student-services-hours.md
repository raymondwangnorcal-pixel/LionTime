# Live Student Life and Services Hours Implementation Plan

## Goal

Build an independent, source-isolated live-hours pipeline for ten Student Life and Services cards using only the approved Lerner Hall, Columbia Mail, Columbia Health, and Columbia Bookstore sources. The page must render embedded fallbacks immediately, hydrate each validated source independently, distinguish service access modes, and stop making current-status claims when a source is more than twenty-four hours old.

## Approved product and reliability contract

This plan implements `DEC-0017` through `DEC-0025` in `/Users/raymondwang/PersonalProjects/LionTime/docs/decisions.md`:

- Replace `Lerner Package Center` with `Student Mail Center`, located at `Wien Hall, Lower Level`.
- Publish these ten cards: Alfred Lerner Hall, Columbia University Bookstore, Student Mail Center, Alice! Health Promotion, Counseling and Psychological Services, Disability Services, Medical Services, Sexual Violence Response, Student Health Insurance Office, and Immunization Compliance Office.
- Distinguish `Open`, `Closing soon`, `Appointment only`, `Virtual only`, `Phone support available`, `Closed`, and `Needs verification` rather than treating staffed office hours as generic open access.
- Use four source adapters inside one independent Student Life pipeline. A source failure retains that source's last known-good data without blocking successful sources.
- Use Lerner's recurring homepage schedule as the baseline and dated calendar entries as authoritative building-level exceptions.
- Use only the official Barnes and Noble storefront or official structured endpoints loaded by that storefront for Bookstore data.
- Refresh every four hours and publish fourteen consecutive Eastern dates.
- Treat data as live through eight hours, stale from eight through twenty-four hours, and `Needs verification` after twenty-four hours. More-than-twenty-four-hour data remains visible in details but does not contribute to current-status claims or open counts.
- Activate sources independently after their first validated production publication and report `n of 4 sources live` until all four have initialized.

## Fixed source and venue catalog

Create `/Users/raymondwang/PersonalProjects/LionTime/lib/student-services-hours-catalog.js` with these exact immutable contracts:

| Source ID | Official entry URL | Required venue IDs |
| --- | --- | --- |
| `lerner` | `https://lernerhall.columbia.edu/` | `lerner` |
| `mail` | `https://mailservices.columbia.edu/content/locations-hours` | `mail-center` |
| `health` | `https://www.health.columbia.edu/content/hours-and-locations` | `alice-health`, `caps`, `disability`, `medical`, `svr`, `student-insurance`, `immunization` |
| `bookstore` | `https://columbia.bncollege.com/` | `bookstore` |

The catalog must export `STUDENT_SERVICES_SOURCE_URLS`, `STUDENT_SERVICES_VENUES`, `SOURCE_VENUE_IDS`, `ACCESS_TYPES`, and `SOURCE_FAILURE_CODES`. The only accepted access types are `open-access`, `walk-in`, `appointment-only`, `virtual-only`, and `phone-support`. The only accepted failure codes are `challenge`, `navigation`, `missing-content`, `parse`, `ambiguous`, and `unexpected`.

Do not keep `package` as an alias. Rename the frontend venue ID to `mail-center` in the same commit that adds live hydration so there is no intermediate deployment with two Mail Center cards.

## Wire contracts

### Authenticated PUT payload

`PUT /api/student-services-hours` accepts one attempt batch. It always contains all four source IDs in canonical source-ID order. Successful attempts contain a complete fourteen-day result for every venue owned by that source. Failed attempts contain no venue data.

```json
{
  "schemaVersion": 1,
  "generated": "2026-08-23T12:00:00-04:00",
  "windowStart": "2026-08-23",
  "windowEnd": "2026-09-05",
  "attempts": [
    {
      "sourceId": "bookstore",
      "sourceUrl": "https://columbia.bncollege.com/",
      "attemptedAt": "2026-08-23T12:00:00-04:00",
      "result": "failure",
      "failureCode": "challenge",
      "venues": []
    },
    {
      "sourceId": "health",
      "sourceUrl": "https://www.health.columbia.edu/content/hours-and-locations",
      "attemptedAt": "2026-08-23T12:00:00-04:00",
      "result": "success",
      "failureCode": null,
      "venues": []
    }
  ]
}
```

The example abbreviates the successful `venues` value only to explain the envelope. The actual validator must reject an empty successful Health result and require all seven Health venue records. Tests must build complete payloads through `/Users/raymondwang/PersonalProjects/LionTime/tests/helpers/student-services-hours-fixture.mjs`; production code must never accept a shortened success payload.

### Stored/public GET snapshot

`GET /api/student-services-hours` returns one record for each of the four sources. A successful PUT replaces only successful source records. A failed attempt updates `lastAttemptAt`, `lastAttemptResult`, and `failureCode` while preserving the prior `lastSuccessAt` and `venues`. A source that has never succeeded uses `lastSuccessAt: null` and `venues: []`.

```json
{
  "schemaVersion": 1,
  "generated": "2026-08-23T12:00:00-04:00",
  "windowStart": "2026-08-23",
  "windowEnd": "2026-09-05",
  "sources": [
    {
      "sourceId": "bookstore",
      "sourceUrl": "https://columbia.bncollege.com/",
      "lastAttemptAt": "2026-08-23T12:00:00-04:00",
      "lastAttemptResult": "failure",
      "failureCode": "challenge",
      "lastSuccessAt": null,
      "venues": []
    }
  ]
}
```

As above, the example shows one record for readability. A valid GET snapshot contains exactly four canonical source records. `generated` is the newest accepted attempt-batch timestamp. Each successful source record retains the exact `windowStart` and `windowEnd` embedded in its venue days; the top-level window reflects the current batch and is used only for diagnostics.

### Venue and day shape

Every successful venue has exact catalog identity, bounded plain-text metadata, and fourteen consecutive days:

```json
{
  "id": "disability",
  "name": "Disability Services",
  "location": "Wien Hall, Suite 108A",
  "days": [
    {
      "date": "2026-08-23",
      "availabilities": [
        {
          "type": "appointment-only",
          "intervals": [["09:00", "17:00"]],
          "status": null,
          "reason": "Virtual and in person by appointment"
        }
      ],
      "sourceRefs": ["health"],
      "evidenceRefs": ["health:disability"]
    }
  ]
}
```

Intervals use `HH:MM`, may end at `24:00`, must be ordered and non-overlapping within one availability, and must not cross midnight. Split and after-hours access are separate availability records. Status and reason are bounded plain text or `null`; unknown keys are rejected. Source and evidence references are required and must match the catalog venue owner.

## Pre-conditions

- [ ] Start from a branch based on current `main` after the existing `index.html` and decision-ledger work has been committed or otherwise preserved. Run `git status --short`; expected output is empty before implementation begins.
- [ ] Run `node --version`; expected major version is `22` or newer.
- [ ] Run `npm ci`; expected exit status is `0` with `playwright`, `cheerio`, and `@upstash/redis` installed from `/Users/raymondwang/PersonalProjects/LionTime/package-lock.json`.
- [ ] Run `npx playwright install chromium`; expected exit status is `0` and a Chromium executable available to Playwright.
- [ ] Run `npm test`; expected summary contains `fail 0`. If the pre-existing Recreation availability-label test still fails, repair or explicitly separate that baseline defect before using the full-suite result as evidence for this feature.
- [ ] Confirm the existing shared publisher secret is available in Vercel and GitHub as `LIBRARY_HOURS_UPDATE_SECRET`. Do not print or copy its value.

## Task 1 — Capture minimal official-source fixtures and freeze acquisition seams

**Create:**

- `/Users/raymondwang/PersonalProjects/LionTime/scripts/student-services-hours-acquire.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/student-services-hours-acquire.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/student-services-lerner-home.html`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/student-services-lerner-calendar.html`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/student-services-mail.html`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/student-services-health.html`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/student-services-bookstore.html` or `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/student-services-bookstore.json`, matching the official representation discovered below
- `/Users/raymondwang/PersonalProjects/LionTime/lib/student-services-hours-catalog.js`

Implement one headed Playwright browser session with four isolated adapter attempts. Always close each page and the browser in `finally`. A failed adapter returns a bounded failure record and must not throw away successful siblings. Throw only when all four adapters fail, because an all-failure run has nothing useful to publish.

Use these source-specific acquisition rules:

1. Lerner: load the official homepage, capture its rendered main content, and discover the exact calendar URL from an iframe, linked calendar, or calendar network response reached from that page. Accept a calendar only when its provenance is directly embedded or linked by the Lerner homepage. Capture the smallest sanitized fixture that retains baseline hours, the calendar reference, one ordinary day, and one dated exception.
2. Mail: load the official Locations and Hours page and retain the Student Mail Center section, date-bounded schedules, and dated holiday exceptions. Exclude the Administrative Mail Office section from emitted evidence.
3. Health: retain the seven approved service sections, their Morningside locations, explicit access labels, dated alerts, and date-bounded schedules. For Disability and Sexual Violence Response, retain only Morningside service facts; do not map CUIMC or Barnard hours onto Morningside cards.
4. Bookstore: observe same-origin JSON responses while loading the official storefront. Prefer an official structured response containing the Columbia store identity and hours. If no suitable official JSON exists, capture the rendered official store-hours region. Do not follow or ingest Google, Yelp, Apple Maps, or other third-party listings. A managed challenge is a `challenge` failure, not an instruction to bypass it.

Fixtures must be minimal, public, sanitized, and stable. Do not commit full-page analytics payloads, cookies, session identifiers, account data, or unrelated page text.

Write tests that prove:

- all pages and the browser close on success and failure;
- one failed adapter preserves three successful results;
- all four failures reject the run;
- only allowlisted entry URLs and directly linked Lerner calendar provenance are accepted;
- a Bookstore challenge becomes a bounded `challenge` failure;
- a third-party Bookstore response is ignored;
- acquisition emits a timezone-aware `generated` timestamp.

**Verify:**

```bash
node --test tests/student-services-hours-acquire.test.mjs
```

Expected: every acquisition lifecycle, allowlist, and isolation test passes with `fail 0`.

**Commit:** `feat(student-services): acquire official hours sources`

## Task 2 — Parse official evidence and resolve fourteen Eastern dates

**Create:**

- `/Users/raymondwang/PersonalProjects/LionTime/lib/student-services-source-parser.js`
- `/Users/raymondwang/PersonalProjects/LionTime/lib/student-services-hours-resolver.js`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/student-services-source-parser.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/student-services-hours-resolver.test.mjs`

The parser returns evidence records; it does not directly emit snapshots. Every evidence record includes `sourceId`, `targetId`, effective start/end dates, weekday or exact-date applicability, access type, intervals, status/reason, and exact evidence identity.

Implement these resolution rules:

- Exact-date closures or modified hours override recurring schedules for the same venue and access type.
- Lerner dated calendar entries override only `lerner`; tenant services retain their own sources.
- Mail resolves the schedule whose explicit range covers each date, then applies exact holiday closures. A source typo or conflicting range affecting a target date yields `ambiguous`, never a guessed interval.
- Health retains distinct availability records. Generic `Office Hours` must not be relabeled `walk-in` unless the source explicitly states drop-in or walk-in access. Appointment, virtual, and phone availability remain distinct.
- Health date-bounded alerts override the affected service and dates only. Alerts for CUIMC or Barnard do not alter Morningside cards.
- Bookstore exact-date exceptions override its recurring official schedule. Missing effective dates, conflicting official facts, or an unrecognized store identity yield `ambiguous`.
- Every successful source result must contain all catalog venues owned by that source and fourteen consecutive dates beginning on the Eastern date of `generated`.
- Do not copy hours between sibling Health services or between Lerner and its tenants.

Write parser tests against every captured fixture, including the currently published Mail seasonal transitions and Health alerts. Write resolver tests for daylight-saving boundaries, exact-date precedence, split access modes, source-specific venue completeness, ambiguous overlaps, and fourteen-day continuity.

**Verify:**

```bash
node --test tests/student-services-source-parser.test.mjs tests/student-services-hours-resolver.test.mjs
```

Expected: all source-shape, priority, ambiguity, access-mode, and date-window tests pass with `fail 0`.

**Commit:** `feat(student-services): resolve official schedules and access modes`

## Task 3 — Validate attempt batches and merge source records server-side

**Create:**

- `/Users/raymondwang/PersonalProjects/LionTime/lib/student-services-hours-schema.js`
- `/Users/raymondwang/PersonalProjects/LionTime/lib/student-services-hours-store.js`
- `/Users/raymondwang/PersonalProjects/LionTime/lib/student-services-hours-service.js`
- `/Users/raymondwang/PersonalProjects/LionTime/api/student-services-hours.js`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/helpers/student-services-hours-fixture.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/student-services-hours-schema.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/student-services-hours-service.test.mjs`

**Modify:** `/Users/raymondwang/PersonalProjects/LionTime/vercel.json`

Implement separate validators for authenticated attempt batches and stored GET snapshots. Reject unknown fields, duplicate or missing source IDs, wrong official URLs, missing required venues in a success, venues in a failure, bad timestamps, invalid access types, malformed intervals, nonconsecutive dates, untrusted evidence identities, and source-to-venue ownership violations.

Use Redis key `lionhour:student-services-hours:v1`. The store exposes `getSnapshot()` and `putSnapshot(snapshot)`. The service handles the read-modify-write merge because it owns authentication and validation:

- `GET` before any successful source exists returns `503`, `Cache-Control: no-store`, and `{ "error": "Student services hours are not initialized" }`.
- `GET` after at least one source succeeds returns `200` and `Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600`.
- `PUT` uses the existing timing-safe bearer-secret pattern and `LIBRARY_HOURS_UPDATE_SECRET`.
- A malformed batch returns `422` and preserves Redis byte-for-byte.
- A valid batch merges each successful source and retains prior data for failed sources, then validates the complete stored shape before one `putSnapshot` call.
- A valid first partial batch stores all four source records; uninitialized sources use `lastSuccessAt: null` and `venues: []`.
- `POST`, `PATCH`, and `DELETE` return `405` with `Allow: GET, PUT`.

Add `api/student-services-hours.js` to `vercel.json` with `maxDuration: 10`.

Write service tests using a real in-memory store. Cover first partial initialization, later success, later failure retention, mixed success/failure batches, rejected malformed success data, auth failure, storage failure, cache headers, and exact method handling.

**Verify:**

```bash
node --test tests/student-services-hours-schema.test.mjs tests/student-services-hours-service.test.mjs
```

Expected: all contract, merge, preservation, authentication, and cache tests pass with `fail 0`.

**Commit:** `feat(student-services): add source-isolated hours API`

## Task 4 — Orchestrate partial source publication and schedule it independently

**Create:**

- `/Users/raymondwang/PersonalProjects/LionTime/scripts/student-services-hours-scraper.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/.github/workflows/update-student-services-hours.yml`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/student-services-hours-scraper.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/student-services-hours-workflow.test.mjs`

The scraper CLI is exactly:

```bash
node scripts/student-services-hours-scraper.mjs --json-out /tmp/lionhour-student-services-hours.json
```

It acquires all four sources, parses and resolves successful attempts, validates the attempt batch, and writes formatted JSON atomically only after validation. A single source parse or validation failure is converted to that source's sanitized failed attempt. If all four source attempts fail, exit nonzero without writing a publishable file. Never include raw source HTML or exception stacks in the JSON.

Create workflow `Update student services hours` with:

- cron `57 */4 * * *`, avoiding the existing Library minute 17, Recreation minute 27, and Dining minute 47;
- `workflow_dispatch`;
- `contents: read` only;
- concurrency group `update-student-services-hours`, `cancel-in-progress: false`;
- `ubuntu-24.04`, Node 22, npm cache, and a 15-minute timeout;
- `npm ci` and `npx playwright install --with-deps chromium`;
- focused Student Life acquisition, parser, resolver, schema, service, scraper, workflow, client, and UI tests;
- headed Chromium through `xvfb-run --auto-servernum`;
- publish gate `vars.STUDENT_SERVICES_HOURS_PUBLISH_ENABLED == 'true'`;
- API variable `STUDENT_SERVICES_HOURS_API_URL`;
- shared secret `secrets.LIBRARY_HOURS_UPDATE_SECRET`;
- retrying authenticated `curl -X PUT` with `--fail-with-body`, `--retry 3`, and `--retry-all-errors`.

Write workflow tests that prove the cron is unique, permissions are read-only, the concurrency group is independent, Chromium is installed, the focused tests run before scraping, publishing is gated, only the Student Life API variable is referenced, and the shared secret is not printed.

**Verify:**

```bash
node --test tests/student-services-hours-scraper.test.mjs tests/student-services-hours-workflow.test.mjs
```

Expected: all partial-publication, all-failure, output-safety, and workflow-contract tests pass with `fail 0`.

**Commit:** `feat(student-services): schedule isolated live publication`

## Task 5 — Hydrate ten static-first cards with access-aware status

**Create:**

- `/Users/raymondwang/PersonalProjects/LionTime/assets/student-services-hours.js`
- `/Users/raymondwang/PersonalProjects/LionTime/assets/student-services-hours-view.js`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/student-services-hours-client.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/student-services-hours-ui.test.mjs`

**Modify:**

- `/Users/raymondwang/PersonalProjects/LionTime/index.html`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/header-controls.test.mjs`

Update the embedded catalog in `index.html` in one coherent change:

- keep `lerner` and `bookstore`;
- replace `package` with `mail-center`, name it `Student Mail Center`, and set location `Wien Hall, Lower Level`;
- keep `caps`, `disability`, `medical`, `svr`, and `immunization`;
- add `alice-health` at `John Jay Hall, 3rd Floor`;
- add `student-insurance` at `John Jay Hall, 3rd Floor`;
- keep conservative embedded schedules and access notes for every card so initial rendering does not depend on JavaScript or the API.

Load `assets/student-services-hours-view.js` before the inline renderer and load `assets/student-services-hours.js` after the venue declaration, following the existing Recreation initialization pattern. Add one footer status link with ID `student-services-hours-status`, official source destination, `aria-live="polite"`, and an initial embedded-fallback message.

The client validates the global envelope and each source record independently. It builds a temporary update map per source before mutating venues. A malformed or uninitialized source leaves only its owned cards on embedded fallback; valid siblings still hydrate. A render failure restores the pre-hydration model before reporting degradation.

Compute source freshness from `lastSuccessAt` using the current instant:

- `<= 8 hours`: live;
- `> 8 and <= 24 hours`: stale, while current-status calculation remains active;
- `> 24 hours` or `lastSuccessAt: null`: needs verification, with no current open/closed assertion.

Use this exact active-status priority for a fresh or stale source:

1. active `open-access` or `walk-in`: `Open`, or `Closing soon` in the final sixty minutes;
2. active `appointment-only`: `Appointment only`;
3. active `virtual-only`: `Virtual only`;
4. active `phone-support`: `Phone support available`;
5. no active availability: explicit official status or `Closed`.

When multiple access modes are active, the badge uses the first matching priority and expanded details list every mode and interval. The existing `Open now` filter and section open count include only `Open` and `Closing soon`; appointment, virtual, phone, stale verification, and uninitialized cards remain visible under the all-status view but do not inflate the open count.

Footer copy must distinguish:

- no initialized sources: `Student services hours: embedded fallback · 0 of 4 sources live`;
- partial live: `Student services hours updated: <timestamp> ET · n of 4 sources live`;
- any stale source: `Student services hours may be stale: <timestamp> ET · n of 4 sources live`;
- any source beyond twenty-four hours: `Student services hours need verification · n of 4 sources live`.

Write client/UI tests that cover all ten mappings, independent source application, partial initialization, malformed-source isolation, rollback after render failure, exact freshness boundaries, access-status priority, closing-soon behavior, open-filter exclusion, bounded/escaped source text, footer counts, desktop and mobile detail output, and preservation of existing Library, Dining, Recreation, header, and Recreation-space behavior.

**Verify:**

```bash
node --test tests/student-services-hours-client.test.mjs tests/student-services-hours-ui.test.mjs tests/header-controls.test.mjs tests/recreation-hours-ui.test.mjs
```

Expected: all hydration, status, freshness, filter, accessibility, and regression tests pass with `fail 0`.

**Commit:** `feat(student-services): hydrate access-aware live cards`

## Task 6 — Document configuration, source policy, seed, failure, and rollback

**Create:** `/Users/raymondwang/PersonalProjects/LionTime/docs/student-services-hours-operations.md`

Document:

- the four-source allowlist and exact ten-card catalog;
- Lerner baseline/calendar precedence;
- Mail seasonal and holiday precedence;
- Health Morningside-only mapping and access-mode semantics;
- Bookstore official-source-only boundary and managed-challenge policy;
- source-isolated server merge behavior;
- fourteen-day horizon and 8/24-hour freshness rules;
- environment variables `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, and `LIBRARY_HOURS_UPDATE_SECRET`;
- repository variables `STUDENT_SERVICES_HOURS_PUBLISH_ENABLED=true` and `STUDENT_SERVICES_HOURS_API_URL=https://www.lionhour.com/api/student-services-hours`;
- first deployment, read-only scraping, partial initialization, source-by-source activation, routine verification, incident response, and rollback.

The runbook must explicitly prohibit CAPTCHA bypass, third-party Bookstore hours, guessed access modes, copying hours between Health services, and manual partial Redis writes.

**Verify:**

```bash
rg -n "STUDENT_SERVICES_HOURS_PUBLISH_ENABLED|STUDENT_SERVICES_HOURS_API_URL|8 hours|24 hours|14|source|rollback" docs/student-services-hours-operations.md
```

Expected: matches exist for both repository variables, both freshness thresholds, the fourteen-day horizon, source isolation, and rollback.

**Commit:** `docs: add student services hours operations guide`

## Task 7 — Run full validation and rehearse production activation

Run from `/Users/raymondwang/PersonalProjects/LionTime`:

```bash
npm test
python3 -m unittest tests/test_scrape.py -v
git diff --check
xvfb-run --auto-servernum node scripts/student-services-hours-scraper.mjs --json-out /tmp/lionhour-student-services-hours.json
node -e "import('./lib/student-services-hours-schema.js').then(async ({validateStudentServicesAttemptBatch}) => { const fs = await import('node:fs/promises'); const value = JSON.parse(await fs.readFile('/tmp/lionhour-student-services-hours.json', 'utf8')); const result = validateStudentServicesAttemptBatch(value); console.log(JSON.stringify({valid: result.ok, attempts: value.attempts?.length, successes: value.attempts?.filter(item => item.result === 'success').length, windowStart: value.windowStart, windowEnd: value.windowEnd, errors: result.errors}, null, 2)); process.exitCode = result.ok ? 0 : 1; })"
```

Expected:

- JavaScript and Python suites finish with zero failures.
- `git diff --check` emits no output.
- The scraper writes one valid batch with exactly four attempts, at least one success, and a fourteen-day inclusive window.
- Every successful source contains exactly its catalog-owned venues; failed attempts contain no venues and one approved failure code.

Before enabling publication:

1. Deploy the API, client, and embedded fallback changes together.
2. Confirm an uninitialized production endpoint returns `503` and `Cache-Control: no-store`.
3. Run the workflow manually with publishing disabled and inspect only sanitized source-result summaries.
4. Set the two repository variables, then run the workflow manually again.
5. Confirm the API returns `200`, four source records, and exact catalog venue coverage for each initialized source.
6. Reload LionHour and verify the footer count matches initialized sources; uninitialized cards must retain embedded fallback and show `Needs verification`.
7. Verify `All Buildings`, `Open now`, `Closing soon`, and `Closed` filters at 320, 375, 390, 430, 768, and 1440 pixel widths with no horizontal overflow.
8. Do not call the feature fully live until all four source records have non-null `lastSuccessAt` values.

**Commit:** `test(student-services): verify live source rollout`

## Rollback

- Disable `STUDENT_SERVICES_HOURS_PUBLISH_ENABLED` first. This stops writes without affecting Library, Dining, or Recreation.
- If the client regresses, roll back the deployment containing `assets/student-services-hours.js`, `assets/student-services-hours-view.js`, and the associated `index.html` integration. Embedded schedules remain the visitor-facing fallback.
- If one source parser regresses, leave the other three active; the failing source retains last known-good data until the twenty-four-hour cutoff and then becomes `Needs verification`.
- If the API merge logic regresses, disable publishing and roll back the API/service/store deployment together. Do not manually edit `lionhour:student-services-hours:v1`.
- If the first seed is invalid, keep publishing disabled. A valid API rejects it with `422`, leaving either `503` uninitialized state or the previous stored snapshot unchanged.
- Never roll back by weakening source allowlists, venue completeness, provenance, access-mode, date-window, freshness, or exact-key validation.
