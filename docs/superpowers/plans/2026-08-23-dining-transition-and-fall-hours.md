# Dining Transition, NSOP, Labor Day, and Fall 2026 Hours Plan

## Goal

Extend LionHour's existing fourteen-day Dining snapshot so it represents restricted NSOP meal service from August 29 through September 3, exact venue hours for September 4 through September 7, and recurring Fall 2026 venue hours beginning September 8, while retaining the current official `dining_nodes` feed and never assigning a general-open state from access-restricted or location-ambiguous evidence.

## Pre-conditions

- [ ] Run `git -C /Users/raymondwang/PersonalProjects/LionTime status --short` and preserve the user's `.DS_Store`, `Mockups/`, and deleted legacy mockup-file changes without staging, restoring, moving, or editing them.
- [ ] Run `npm ci` from `/Users/raymondwang/PersonalProjects/LionTime`; expected result: dependencies install with zero audit vulnerabilities.
- [ ] Run `node --test tests/dining-hours-*.test.mjs`; expected result before implementation: every Dining pipeline test passes.
- [ ] Confirm `DINING_HOURS_PUBLISH_ENABLED=true`, `DINING_HOURS_API_URL`, and `LIBRARY_HOURS_UPDATE_SECRET` remain configured in GitHub Actions. Do not print their values.
- [ ] Confirm these four official pages return HTTP 200 without authentication:
  - `https://dining.columbia.edu/content/locations-hours`
  - `https://dining.columbia.edu/news/new-student-orientation-program-nsop-2026-dining-service`
  - `https://dining.columbia.edu/news/labor-day-2026-operating-hours`
  - `https://dining.columbia.edu/news/fall-2026-operating-hours`

## Official-source policy

### Sources and authority

| Source ID | URL | Evidence type | Effective period |
|---|---|---|---|
| `locations-feed` | `https://dining.columbia.edu/content/locations-hours` | Dated per-location structured periods | Dates explicitly covered by each `open_hours_fields` period |
| `nsop-2026` | `https://dining.columbia.edu/news/new-student-orientation-program-nsop-2026-dining-service` | Restricted, category-level named meal sessions | 2026-08-29 through 2026-09-03 |
| `labor-day-2026` | `https://dining.columbia.edu/news/labor-day-2026-operating-hours` | Dated per-location exceptions | 2026-09-04 through 2026-09-07 |
| `fall-2026` | `https://dining.columbia.edu/news/fall-2026-operating-hours` | Recurring per-location baseline | 2026-09-08 through 2026-12-23 |

The December 23 safety boundary comes from Columbia College's official Fall 2026 term end. A later official Dining closure or holiday article must override the Fall baseline before that date; the baseline must not continue after December 23 without a new official source.

### Resolution priority

For each venue and date, resolve in this order:

1. An exact dated venue exception from `labor-day-2026`.
2. A dated venue period from `locations-feed`, including an explicit closure.
3. The `fall-2026` recurring baseline when the date is between September 8 and December 23 and that page lists the venue.
4. `Hours not published` with no intervals.

NSOP evidence is not part of this venue resolution chain. It is a separate restricted service because the official page gives meal sessions and audience rules but does not reliably assign those sessions to the existing venue cards. It must not make Ferris, John Jay, JJ's, or another dining-hall card appear open.

### Exact transition data

Represent the NSOP article as one special service named `NSOP Dining Service` with audience text `Incoming First-Year, Transfer, Combined Plan, and Exchange students, plus students supporting NSOP programming`.

| Date | Named sessions | Access/status |
|---|---|---|
| 2026-08-29 | none | `Times and locations provided by NSOP administrators; international first-year students and their families only` |
| 2026-08-30 | Coffee Bar 08:00–17:00; Lunch Service 10:00–13:00; Dinner Service 15:45–17:30 | Restricted NSOP service |
| 2026-08-31 | Breakfast Service 07:30–09:00; Lunch Service 11:00–14:00; Dinner Service 17:00–19:30 | Restricted NSOP service |
| 2026-09-01 | Breakfast Service 07:30–09:00; Lunch Service 07:30–14:00; Dinner Service 17:00–19:30 | Restricted NSOP service |
| 2026-09-02 | Breakfast Service 07:00–09:00; Lunch Service 11:00–14:00; Dinner Service 16:30–19:30 | CUID required |
| 2026-09-03 | Breakfast Service 07:30–09:00; Lunch Service 11:00–14:00; Dinner Service 16:30–19:30 | Restricted NSOP service |

Represent Labor Day venue exceptions exactly as follows. A venue omitted by the article receives no inferred closure and falls through to the next evidence layer.

| Date | Venue intervals |
|---|---|
| 2026-09-04 | Ferris 09:00–20:00; Chef Mike's 11:00–20:00; JJ's 12:00–20:00 |
| 2026-09-05 | Ferris 09:00–20:00; Chef Mike's 11:00–20:00; JJ's 12:00–20:00 |
| 2026-09-06 | Ferris 09:00–20:00; John Jay 09:30–21:00; Chef Mike's 11:00–20:00; JJ's 12:00–21:00 |
| 2026-09-07 | Ferris 09:00–20:00; John Jay 09:30–21:00; JJ's 12:00–21:00 |

Parse all fifteen venues listed by the Fall article. `smith-dining` is not listed and must continue to depend on `locations-feed` or show `Hours not published`.

| LionHour ID | Fall recurring schedule |
|---|---|
| `chefmikes` | Daily 11:00–02:00 |
| `chefdons` | Monday–Friday 08:00–19:00 |
| `facultyhouse` | Monday–Thursday 07:30–14:30 and 17:00–21:00 |
| `facultyhouse-4` | Monday–Thursday 11:00–14:30 |
| `facshack` | Monday–Thursday 12:00–20:00; Sunday 15:00–20:00 |
| `ferris` | Monday–Friday 07:30–20:00; Saturday 09:00–20:00; Sunday 10:00–14:00 and 16:00–20:00 |
| `gracedodge` | Monday–Thursday 11:00–19:30 |
| `jjs` | Daily 12:00–10:00 overnight |
| `johnjay` | Sunday–Thursday 09:30–21:00 |
| `johnnys` | Monday–Wednesday 11:00–15:00; Thursday–Friday 11:00–15:00 and 19:00–23:00; Saturday 19:00–23:00; Sunday 18:00–22:00 |
| `bj-butler` | Monday–Thursday 08:00–24:00; Friday–Sunday 09:00–21:00 |
| `bj-mudd` | Monday–Friday 08:00–18:00 |
| `bj-everett` | Monday–Thursday 08:30–19:30; Friday 08:30–14:00 |
| `bj-uris` | Monday–Friday 08:00–21:00; Saturday 08:00–18:00 |
| `lenfest-cafe` | Monday–Thursday 08:00–18:30; Friday 08:00–15:00 |

## Snapshot version 2 contract

Keep the Redis key `lionhour:dining-hours:v1` during this migration, but publish `schemaVersion: 2`. The API and browser must temporarily read both schema versions so the existing stored version 1 snapshot remains usable between deployment and the first version 2 publication.

Version 2 retains `generated`, `windowStart`, `windowEnd`, and the sixteen `locations`. Add:

- `sources`: exactly four entries with `id`, official `url`, and `fetchedAt` equal to the snapshot generation timestamp.
- `locations[].days[].sourceId`: one of `locations-feed`, `labor-day-2026`, `fall-2026`, or `unpublished`.
- `specialServices`: zero or one NSOP service clipped to dates inside the fourteen-day window.
- `specialServices[].days[].sessions`: named, non-overlapping-or-overlapping sessions; overlapping is valid because Breakfast, Lunch, Coffee Bar, and Dinner are service labels rather than venue occupancy intervals.
- `specialServices[].countsAsOpen`: always `false` for NSOP 2026.

Use this exact special-service shape:

```json
{
  "id": "nsop-2026",
  "name": "NSOP Dining Service",
  "audience": "Incoming First-Year, Transfer, Combined Plan, and Exchange students, plus students supporting NSOP programming",
  "sourceId": "nsop-2026",
  "countsAsOpen": false,
  "days": [
    {
      "date": "2026-08-30",
      "status": "Restricted NSOP service",
      "sessions": [
        { "label": "Coffee Bar", "open": "08:00", "close": "17:00" },
        { "label": "Lunch Service", "open": "10:00", "close": "13:00" },
        { "label": "Dinner Service", "open": "15:45", "close": "17:30" }
      ]
    }
  ]
}
```

## Steps

### Step 1 — Capture and freeze official article fixtures

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/dining-nsop-2026.html`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/dining-labor-day-2026.html`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/dining-fall-2026.html`

Save the main article element from each official page, preserving headings, venue names, dates, audience restrictions, and time text while removing navigation, analytics, personal contact information, scripts, and unrelated news cards. Add fixture comments containing only the public source URL and capture date `2026-08-23`.

**Verify:**

```sh
rg -n "NSOP Dining Schedule|Labor Day 2026 Operating Hours|Fall 2026 Operating Hours" /Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/dining-*.html
```

Expected: each phrase appears in its corresponding fixture, and `rg -n "<script|google-analytics|mailto:"` returns no matches.

**Commit checkpoint:** `test(dining): capture official transition hour fixtures`

### Step 2 — Build strict parsers for the three article formats

**Files:**

- Create `/Users/raymondwang/PersonalProjects/LionTime/lib/dining-article-parser.js`
- Create `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-article-parser.test.mjs`

Export `parseNsopArticle(html)`, `parseLaborDayArticle(html)`, and `parseFallArticle(html)`. Use Cheerio and normalized visible text. Require the exact article title, year, effective-date statement, known venue names, and parseable time ranges. Map official names to the existing LionHour IDs. Reject duplicate dates, duplicate venue rows, unknown venue names inside an operating-hours table, backwards non-overnight intervals, missing effective dates, and any title year other than 2026.

The NSOP parser must return the six exact day records in the source-policy table, preserving session labels and access text. The Labor parser must return the four exact date maps. The Fall parser must return `start: "2026-09-08"`, `end: "2026-12-23"`, and recurring weekday maps for the fifteen listed venues.

Tests must cover all successful mappings plus these failures:

- NSOP page missing its restricted-audience paragraph.
- NSOP September 2 missing the CUID instruction.
- Labor page with a fifth date or an unknown dining hall.
- Fall page with no September 8 effective statement.
- Fall page with an equal or backwards interval other than the approved JJ's overnight schedule.
- Ferris split Sunday intervals parsed in source order.

**Verify:**

```sh
node --test /Users/raymondwang/PersonalProjects/LionTime/tests/dining-article-parser.test.mjs
```

Expected: every parser contract and rejection test passes.

**Commit checkpoint:** `feat(dining): parse official transition schedules`

### Step 3 — Resolve dated, structured, and recurring evidence

**Files:**

- Create `/Users/raymondwang/PersonalProjects/LionTime/lib/dining-hours-resolver.js`
- Create `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-resolver.test.mjs`
- Modify `/Users/raymondwang/PersonalProjects/LionTime/scripts/dining-hours-scraper.mjs`

Move date arithmetic and the sixteen-location catalog into the resolver module. Export `resolveDiningSnapshot({ dataset, nsop, labor, fall, generated })`. First build the current fourteen dated location records from `dining_nodes`; then apply the four-level priority policy without mutating parser results. Attach `sourceId` to every resolved day. Clip NSOP days to the snapshot window and omit the special service entirely when no NSOP date intersects the window.

The resolver tests must prove:

- August 27 and 28 remain `Hours not published` when no official source covers them.
- NSOP sessions appear separately and never alter venue intervals or open counts.
- A structured explicit closure wins over the Fall baseline.
- Labor Day Ferris hours win over both structured and Fall evidence.
- A Labor-omitted venue falls through instead of being marked closed.
- Fall Ferris hours begin September 8, including split Sunday service.
- Fall hours are not used before September 8 or after December 23.
- Smith Dining remains unpublished without a structured period.
- JJ's Fall interval remains a legitimate overnight 12:00–10:00 interval.

**Verify:**

```sh
node --test /Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-resolver.test.mjs /Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-scraper.test.mjs
```

Expected: resolver and existing scraper behavior pass together.

**Commit checkpoint:** `feat(dining): resolve NSOP Labor Day and Fall hours`

### Step 4 — Acquire all four official sources in one browser session

**Files:**

- Modify `/Users/raymondwang/PersonalProjects/LionTime/scripts/dining-hours-scraper.mjs`
- Modify `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-scraper.test.mjs`

Launch one headed Chromium instance. Open `locations-hours`, wait for `globalThis.dining_nodes`, and extract the JSON string. Then visit each article URL with `waitUntil: "domcontentloaded"` and capture `article` HTML. Require every URL to remain HTTPS on `dining.columbia.edu` after redirects. Parse all four inputs, resolve one version 2 snapshot, validate it, and atomically write only after validation succeeds. Any fetch, redirect, parse, resolution, or validation failure must leave the last production snapshot untouched by exiting nonzero before publication.

Update the acquisition fake to record four `goto` calls, three article `locator('article').innerHTML()` calls, one `dining_nodes` evaluation, and one browser close on both success and failure.

**Verify:**

```sh
node --test /Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-scraper.test.mjs
```

Expected: the scraper closes Chromium on every path and writes only a complete version 2 snapshot.

**Commit checkpoint:** `feat(dining): acquire official schedule articles`

### Step 5 — Validate and serve schema version 2 without a deployment gap

**Files:**

- Modify `/Users/raymondwang/PersonalProjects/LionTime/lib/dining-hours-schema.js`
- Modify `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-schema.test.mjs`
- Modify `/Users/raymondwang/PersonalProjects/LionTime/tests/helpers/dining-hours-fixture.mjs`
- Modify `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-service.test.mjs`

Keep strict version 1 validation for the stored migration snapshot and add strict version 2 validation. Version 2 must require exactly four allowlisted sources, fourteen consecutive location days, valid per-day source IDs, bounded plain-text special-service fields, dates within the snapshot window, and the exact `countsAsOpen: false` NSOP policy. Reject unknown top-level and nested fields rather than stripping them. Continue allowing overlapping NSOP sessions, but retain non-overlap validation for venue intervals.

The service must accept authenticated version 2 PUTs and keep returning the last stored version 1 or version 2 snapshot on GET. Invalid PUTs must not replace storage.

**Verify:**

```sh
node --test /Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-schema.test.mjs /Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-service.test.mjs
```

Expected: legacy reads, version 2 writes, provenance rejection, NSOP validation, and storage preservation tests pass.

**Commit checkpoint:** `feat(dining): validate transition hour snapshots`

### Step 6 — Display restricted NSOP service and resolved venue provenance

**Files:**

- Modify `/Users/raymondwang/PersonalProjects/LionTime/assets/dining-hours.js`
- Modify `/Users/raymondwang/PersonalProjects/LionTime/index.html`
- Modify `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-client.test.mjs`
- Modify `/Users/raymondwang/PersonalProjects/LionTime/tests/header-controls.test.mjs`

Make the browser client accept both schema versions. For version 2, validate the same source and special-service contract before mutating any venue. Pass validated special services to a new `setSpecialServices` callback. In `index.html`, store them in `diningSpecialServices`, render a compact notice above the Dining list only when today's date is present, and show each named session, audience restriction, CUID note when applicable, and official-source link.

The NSOP notice must use a restricted-service badge, must not increment the Dining open count, and must not match the Open now filter. Venue rows continue to use resolved hours normally. Expanded venue days sourced from `fall-2026` or `labor-day-2026` should show a concise `Official Columbia Dining schedule` source note without duplicating the URL in every day cell.

Escape all source-derived labels and status text before HTML insertion. On any version 2 validation failure, preserve all embedded venue hours and render no special-service notice.

Tests must assert:

- Legacy version 1 snapshots still hydrate during rollout.
- Version 2 atomically applies venue hours and one NSOP notice.
- NSOP does not alter open counts or filters.
- The August 29 no-time notice does not claim open or closed.
- Labor Day and Fall venue hours render in the horizontal table.
- Source-derived session labels and audience text are escaped.
- Invalid source IDs or `countsAsOpen: true` reject the entire overlay.

**Verify:**

```sh
node --test /Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-client.test.mjs /Users/raymondwang/PersonalProjects/LionTime/tests/header-controls.test.mjs
```

Expected: migration compatibility, restricted-service rendering, filters, escaping, and atomic fallback tests pass.

**Commit checkpoint:** `feat(dining): show NSOP and term schedule context`

### Step 7 — Run the full pipeline and deploy in compatibility order

**Files:**

- Modify `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-workflow.test.mjs` only if the scraper command or test glob changes.
- Do not change `/Users/raymondwang/PersonalProjects/LionTime/.github/workflows/update-dining-hours.yml` cadence; retain `47 */4 * * *` and `workflow_dispatch`.

Run:

```sh
cd /Users/raymondwang/PersonalProjects/LionTime
npm test
node --test tests/dining-hours-*.test.mjs
git diff --check
```

Expected: the full repository suite and every Dining test pass, with no whitespace errors.

Deploy the dual-version API and browser client before publishing version 2. After the hosting deployment for that commit is healthy, manually dispatch `Update dining hours`. Verify the workflow tests, scraper, and authenticated PUT all succeed.

Verify production without exposing credentials:

```sh
curl --fail-with-body --silent --show-error https://www.lionhour.com/api/dining-hours
```

Expected in the response:

- `schemaVersion` is `2`.
- `sources` contains exactly the four official source IDs.
- A window intersecting August 29–September 3 contains `nsop-2026` special-service days.
- A window intersecting September 4–7 contains exact Labor Day venue hours.
- A window intersecting September 8 contains Fall schedules for listed venues.
- August 27–28 remain `Hours not published` unless Columbia later publishes dated evidence.

**Commit checkpoint:** `feat(dining): publish official transition and fall hours`

## Rollback

1. Disable `DINING_HOURS_PUBLISH_ENABLED` to stop new writes without affecting reads.
2. While the deployed implementation commit is checked out as `HEAD`, revert it with `git revert HEAD`; do not reset or rewrite shared history.
3. Redeploy the dual-version reader if production still stores a version 2 snapshot. The reader must remain able to display version 2 until storage is deliberately replaced.
4. Re-run the last version 1 scraper from the parent commit and publish that validated snapshot only if version 2 itself is the incident source.
5. Confirm `GET https://www.lionhour.com/api/dining-hours` returns a valid snapshot and the frontend either hydrates it or visibly uses embedded fallback hours.

## Definition of done

- NSOP meal sessions appear with their access restrictions and never masquerade as ordinary venue openings.
- Labor Day hours populate the named venues on September 4–7.
- Fall 2026 hours populate the fifteen officially listed venues from September 8 through the bounded Fall term.
- Structured dated periods and explicit closures remain authoritative over recurring baselines.
- Uncovered dates and venues remain `Hours not published` rather than guessed.
- The four-hour publisher, API last-known-good behavior, static-first rendering, and four embedded café fallbacks continue to work.
