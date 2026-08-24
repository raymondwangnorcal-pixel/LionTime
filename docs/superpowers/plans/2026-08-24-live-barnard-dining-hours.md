# Live Barnard Dining Hours Implementation Plan

**Status:** Implemented and verified locally; deployment pending  
**Date:** 2026-08-24  
**Primary source:** <https://dineoncampus.com/barnard/hours-of-operation>  
**Related first-party venue list:** <https://barnard.edu/bursar/meal-plan-faq>

## Goal

Add date-specific live hours for Barnard's four LionHour dining venues to the existing retained Dining pipeline without weakening its static fallback behavior or allowing a Barnard acquisition failure to block Columbia Dining updates.

## Preconditions

- Work from `/Users/raymondwang/PersonalProjects/LionTime` and preserve the existing uncommitted Milstein Library changes shown by `git status --short`.
- `node --version` must report Node.js 22 or newer.
- `npm ci` must complete successfully, and `npx playwright install chromium` must leave a runnable local Chromium for the rendered-HTML integration test.
- Before implementation, run `npm test` and record the exact baseline. As of this plan revision, the known baseline is five unrelated failures: one Café East header assertion and four Recreation renderer assertions.
- Production publishing remains gated by `DINING_HOURS_PUBLISH_ENABLED=true`, `DINING_HOURS_API_URL`, and the existing update secret; none is required for parser, schema, resolver, service, or client unit tests.

The first successful Barnard publish should move the public Dining snapshot from schema version 3 to version 4 and produce these cards:

| Source row | LionHour ID | LionHour name | Category | LionHour location |
|---|---|---|---|---|
| `Hewitt Dining` | `hewitt` | Hewitt Dining | `dining` | Barnard Hall, lower level |
| `Diana Center Cafe` | `diana-center-cafe` | Diana Center Cafe | `dining` | Diana Center, 2nd floor |
| `Barnard Dining Bubble Tea and Sushi Spot` | `barnard-bubble-tea-sushi` | Bubble Tea & Sushi | `dining` | Milstein Center, 1st floor |
| `Liz's Place` | `lizs-place` | Liz's Place | `cafe` | Diana Center, 1st floor |

`Diana Center Cafe` is the official source spelling for the venue described as Diane's Cafe. LionHour should preserve that source identity but classify it as a dining hall. `LeFrak Center`, `LeFrak Byte Kiosk`, and `Barnard Kosher @ Hewitt Food Hall` must never become separate LionHour cards in this change. The Kosher row is a service inside Hewitt rather than a fifth Barnard location.

## Source findings and constraints

- A plain HTTP request to the Dine On Campus page currently returns `403 Forbidden`.
- A normal headed browser session renders the page without a challenge. This fits LionHour's existing headed Playwright job under `xvfb` and does not require copied cookies, stealth patches, CAPTCHA solving, or any other challenge bypass.
- The rendered page currently contains three `table.unified-hours-table` elements grouped by building, but table count and grouping are not part of LionHour's contract. Each target venue appears as a `tr.location-name-row` followed by a `tr.hours-row`; the latter has a `th[scope="row"]` source name and seven day cells.
- Each day cell exposes duplicate mobile/desktop renderings. The visible desktop interval spans are the primary evidence; the first descendant with `aria-label` is an independent cross-check and fallback. Examples observed on 2026-08-24 were `Liz's Place Thu hours: 8:00a - 2:00p, 4:00p - 7:00p` and `Diana Center Cafe Sun: Closed`.
- The accessible `Go to next week` button updates all three tables in place while leaving the URL unchanged. Repeated navigation successfully reached the weeks of August 30 and September 6, 2026.
- Because LionHour's window starts on the current Eastern date while the source groups weeks Sunday through Saturday, scraping only two displayed weeks can miss the last rolling-window day on a non-Sunday run. Require the current and next displayed weeks, attempt a third week when the source publishes it, and let the resolver use 14 or 21 days of source coverage without inventing missing hours.
- Split intervals are real and must be preserved. The inspected page included two intervals for Liz's Place and as many as three for Hewitt Dining.

## Target contracts

Add the following source and venue definitions to `lib/dining-hours-schema.js`, mirrored exactly in `assets/dining-hours.js`:

```js
export const DINING_SOURCE_CONTRACT = Object.freeze({
  ...DINING_SOURCE_CONTRACT_V3,
  'barnard-hours': 'https://dineoncampus.com/barnard/hours-of-operation',
});

export const DINING_LOCATION_CONTRACT = Object.freeze({
  ...DINING_LOCATION_CONTRACT_V3,
  hewitt: Object.freeze({ id: 'hewitt', category: 'dining' }),
  'diana-center-cafe': Object.freeze({ id: 'diana-center-cafe', category: 'dining' }),
  'barnard-bubble-tea-sushi': Object.freeze({ id: 'barnard-bubble-tea-sushi', category: 'dining' }),
  'lizs-place': Object.freeze({ id: 'lizs-place', category: 'cafe' }),
});
```

Retain explicit source/location contracts for each public schema generation:

- public snapshot v1: legacy snapshot without provenance;
- public snapshot v2: four Columbia sources;
- public snapshot v3: v2 plus Café East;
- public snapshot v4: v3 plus `barnard-hours` and the four Barnard locations;
- attempt batch v2 / retained envelope v2: five sources;
- attempt batch v3 / retained envelope v3: six sources.

For public v4, `sources[].fetchedAt` means that source's actual retained `lastSuccessAt`; it must no longer be overwritten with the base snapshot's `generated` timestamp. The public validator requires a timezone-aware timestamp but does not require equality with `generated`. The retained-state validator cross-checks each public source timestamp against its corresponding source-state `lastSuccessAt`, which is always at or before the envelope's `generated` attempt time.

The normalized Barnard source payload is independent of the batch's 14-day window so retained evidence can be revalidated later:

```js
{
  windowStart: '2026-08-23',
  windowEnd: '2026-09-12', // or 2026-09-05 when only two weeks are published
  venues: [
    {
      id: 'lizs-place',
      name: "Liz's Place",
      category: 'cafe',
      days: [
        {
          date: '2026-09-03',
          intervals: [['08:00', '14:00'], ['16:00', '19:00']],
          status: null,
        },
      ],
    },
  ],
}
```

The payload must contain exactly the four whitelisted venues and either 14 or 21 consecutive days per venue. `windowStart` must be a Sunday, and `windowEnd` must equal `windowStart + 13 days` or `windowStart + 20 days`. A closed source cell becomes `intervals: []` and `status: 'Closed'`; an open cell has normalized intervals and `status: null`.

## Implementation steps

### 1. Build a pure Barnard parser

**Create:** `lib/barnard-dining-hours-parser.js`  
**Create:** `tests/barnard-dining-hours-parser.test.mjs`  
**Create:** `tests/fixtures/barnard-dining-hours-week-2026-08-23.html`  
**Create:** `tests/fixtures/barnard-dining-hours-week-2026-08-30.html`  
**Create:** `tests/fixtures/barnard-dining-hours-week-2026-09-06.html`

Export these pure functions:

```text
export function parseBarnardTimeRange(value)
export function parseBarnardRenderedWeek(html, { expectedWeekStart = null } = {})
export function combineBarnardDiningWeeks(weeks)
```

The fixtures must be sanitized excerpts of the actual rendered table markup, including captions, target and ignored rows, seven day cells, duplicated mobile/desktop branches, interval spans, closed markup, and accessibility labels. `parseBarnardRenderedWeek` loads that rendered HTML with the repository's existing Cheerio dependency so the same DOM selector chain is exercised in tests and production. The parser must:

1. match only the four exact source names in the table above;
2. discover target rows across any positive number of `table.unified-hours-table` elements and require each target exactly once per week;
3. ignore all non-target rows, including both known LeFrak aliases and the Hewitt Kosher row;
4. read visible desktop `span.block` interval text or the visible `Closed` marker first; parse the first `aria-label` only as a cross-check or fallback when visible evidence is absent;
5. accept `a`, `am`, `p`, `pm`, and 24-hour `HH:MM` times case-insensitively, with optional spaces;
6. convert noon/midnight correctly, reject zero-length or overlapping intervals, sort intervals, and preserve split service periods;
7. parse captions case-insensitively with optional `week of`, ordinal day suffixes, and full or three-letter English month names, then cross-check the seven visible `M/D` cell dates;
8. require two or three consecutive Sunday week starts and produce exactly 14 or 21 consecutive ISO dates;
9. reject the entire atomic Barnard source attempt—not merely one venue or day—when a target is missing or duplicated, visible and accessibility evidence disagree, a date is inconsistent, a target day is malformed, status text is unsupported, or a target is renamed.

Tests must cover single, split, and triple intervals; noon and midnight; 12- and 24-hour formats; closed days; the August/September boundary; year rollover; two- and three-week payloads; an unrelated fourth table; target rows split across different tables; exclusion of LeFrak and Kosher; accessibility-label wording changes with valid visible spans; conflicting visible/accessibility evidence; and every fail-closed condition above.

### 2. Acquire two or three rendered weeks in the existing browser job

**Modify:** `scripts/dining-hours-scraper.mjs`  
**Modify:** `tests/dining-hours-scraper.test.mjs`

Add `acquireBarnardHoursAttempt(page, now)` and route `barnard-hours` to it in `scrapeDiningHours`. Reuse the existing browser, Eastern timezone, bounded navigation, challenge detection, and failure-code vocabulary.

Use `BARNARD_ACQUISITION_TIMEOUT_MS = 75_000`, a Barnard-specific 45-second `page.goto` limit, a 15-second initial render limit, and a 7.5-second limit for each of the two possible week transitions. Log the source's final `durationMs` with its success/failure result. These limits keep the sixth source bounded inside the workflow while allowing more render time than the existing five-second article reads.

Acquire weeks as follows:

1. navigate once to the official URL and wait for the `Hours of Operation` heading plus at least one `table.unified-hours-table`;
2. call `page.content()` only after the four exact target headings are present, parse the current rendered week with `parseBarnardRenderedWeek`, and require seven complete day cells per target;
3. click the first enabled button with accessible name `Go to next week`;
4. compute the expected next Sunday from the prior parsed week and wait until every table containing one of the four target rows reports that expected week, all four targets again have seven cells, and the resulting target-row HTML is identical across two polls 100 milliseconds apart;
5. capture and parse the second week; the first two complete weeks are required;
6. inspect the next-week control again. If it is absent or disabled, finish successfully with 14 days. If it is enabled, attempt the same synchronized transition and include the third week only when it validates completely; a timeout, repeated week, or incomplete optional third week is logged and degrades to the already valid 14-day payload rather than failing the source;
7. combine the two or three parsed weeks with `combineBarnardDiningWeeks` and return one atomic source success attempt.

Do not copy cookies, modify browser fingerprints, replay private endpoints, solve a challenge, or retry indefinitely. A 403/429/challenge page returns `failureCode: 'challenge'`; failure to acquire either required week returns `missing-content` or `timeout`; inconsistent target captions, incomplete required target data, or invalid times return `parse`. The source attempt must be independent of the other five attempts.

Update the attempt batch to schema version 3. Keep accepting version 2 batches at the API so a deployed older scheduled job cannot corrupt or downgrade a newer retained state.

Use a fake Playwright page in scraper tests to verify one navigation, two required week extractions, an optional third extraction, one or two next-week clicks, synchronized all-target waits, stable-content polling, 14-day degradation when the optional third week is unavailable, the 75-second cumulative budget, duration logging, all bounded failure mappings, and that a Barnard failure does not suppress the other attempts. Add one integration-style test that opens each rendered HTML fixture in Playwright and passes `page.content()` through the production parser.

### 3. Version and validate the sixth retained source

**Modify:** `lib/dining-hours-schema.js`  
**Modify:** `lib/dining-hours-source-schema.js`  
**Modify:** `tests/dining-hours-schema.test.mjs`  
**Modify:** `tests/dining-hours-source-schema.test.mjs`  
**Modify:** `tests/helpers/dining-hours-fixture.mjs`

Add explicit version-to-contract helpers instead of choosing between only “legacy” and “current.” Validate exact key sets, source ordering, source URLs, venue ordering, categories, dates, intervals, and source IDs for every supported version.

Add `validateBarnardPayload` to the source schema. It must enforce the 14-or-21-day/four-venue contract even when the payload is retained and no attempt batch is present.

Compatibility requirements:

- continue to accept public v1-v3 snapshots and retained v1-v2 envelopes;
- accept v2 batches after the v3 server deploy;
- prevent a v2 batch from deleting retained Barnard evidence or downgrading an existing v3 envelope/v4 public snapshot;
- preserve each source state's true `lastSuccessAt` as that source's public `fetchedAt`; a fresh attempt for another source must not rewrite it;
- require the retained v3 envelope's public source timestamps to equal their corresponding retained `lastSuccessAt` values;
- reject a v4 public snapshot that contains LeFrak, Kosher, a fifth Barnard venue, a category mismatch, or a Barnard day attributed to an unauthorized source;
- reject unknown future versions rather than guessing their contract.

Add `makeValidDiningSnapshotV4()` and make the attempt fixture version-selectable so migration and downgrade-resistance tests are readable.

### 4. Merge Barnard independently and resolve public v4

**Modify:** `lib/dining-hours-service.js`  
**Modify:** `lib/dining-hours-resolver.js`  
**Modify:** `tests/dining-hours-service.test.mjs`  
**Modify:** `tests/dining-hours-resolver.test.mjs`

Change the service merge to operate on the source IDs present in the incoming batch while preserving any newer retained source entries. Store a v3 envelope once a Barnard attempt exists. A failed Barnard attempt keeps its prior `lastSuccessAt` and payload; a successful Barnard attempt replaces only Barnard evidence. Pass a `sourceFetchedAt` map built from those retained `lastSuccessAt` values into the resolver, and use it for every v4 `sources[].fetchedAt` entry rather than assigning `baseSnapshot.generated` to all sources.

Pass `barnardHours` and `sourceFetchedAt` into `resolveDiningSnapshot`. For each authorized Barnard venue, slice its 14- or 21-day source payload to the base snapshot's 14 dates and append a location carrying `sourceId: 'barnard-hours'`. If retained coverage does not include a requested date, emit that day as:

```js
{
  date,
  intervals: [],
  status: 'Hours not published',
  sourceId: 'unpublished',
}
```

This lets the other five sources continue publishing without fabricating Barnard hours. The browser client applies every covered Barnard day, marks uncovered dates explicitly, and determines full/partial/stale status from coverage plus the true `barnard-hours` timestamp.

Resolver/service tests must prove:

- all four cards receive exact date-specific split intervals and categories;
- the resolver slices the correct 14 dates from both 14- and 21-day source windows;
- Barnard failure retains its last successful evidence while fresh Columbia attempts still merge;
- a fresh Columbia success cannot advance Barnard's public `fetchedAt`;
- a retained-state/public-snapshot timestamp mismatch is rejected;
- retained coverage outside its available date range yields only explicit unpublished days;
- the first v3 attempt with no successful Barnard payload preserves the valid v3 public snapshot;
- a later Barnard success publishes v4;
- an old v2 job cannot erase v4;
- all-six-source failure returns the last valid public snapshot;
- LeFrak and Kosher never appear in the resolved locations.

Keep the Redis key `lionhour:dining-hours:v1`; the value is already versioned, so no data copy or destructive migration is needed.

### 5. Add the four cards and hydrate them safely

**Modify:** `index.html`  
**Modify:** `assets/dining-hours.js`  
**Modify:** `tests/dining-hours-client.test.mjs`  
**Modify:** `tests/header-controls.test.mjs`

Add the four cards to `VENUES` using the IDs, names, categories, and locations in the target table. Give each card `hours: ALL(null)`, seven `Hours load from official schedule` source statuses, and a note directing users to verify the official schedule until hydration succeeds. Do not add LeFrak or a separate Kosher card.

Teach the client to validate v4 and its six-source/four-Barnard-location contract. Format source timestamps consistently:

```js
function formatEastern(timestamp) {
  return `${new Date(timestamp).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    dateStyle: 'medium',
    timeStyle: 'short',
  })} ET`;
}
```

Read the actual `barnard-hours` source timestamp and classify each Barnard venue independently:

- `live`: source age is at most 8 hours and all seven displayed dates are covered by `barnard-hours`;
- `stale`: source age is greater than 8 hours but at most 24 hours and all seven dates are covered; hydrate the hours, count the venue as live, and add ``Barnard hours last confirmed ${formatEastern(fetchedAt)} · Verify before visiting``;
- `partial`: one or more displayed dates are `unpublished`; hydrate every covered day, preserve `Hours not published` on uncovered days, do not count the venue as live, and add `Some Barnard hours are not yet published`;
- `expired`: source age exceeds 24 hours; keep applying covered retained intervals as verification-only information, do not count the venue as live, and add ``Barnard hours may be outdated · Last confirmed ${formatEastern(fetchedAt)}``.

If all seven displayed dates are explicitly closed, hydrate them normally and use `Closed throughout the published week`; do not infer summer, break, or semester-closure reasons absent from the source. Continue applying complete venues from the other sources.

Use version-aware fallback IDs during rollout:

```js
const BARNARD_IDS = Object.freeze([
  'hewitt', 'diana-center-cafe', 'barnard-bubble-tea-sushi', 'lizs-place',
]);
// v1/v2: Joe x3 + Cafe East + Barnard x4
// v3:    Joe x3 + Barnard x4
// v4:    Joe x3, plus Barnard venues classified partial or expired
```

Replace the hard-coded Dining footer text in `setDiningHoursStatus` with `status.updatedCount`, `status.totalCount`, the actual fallback count, and a stale-source indicator. With a complete fresh v4 snapshot the expected result is 20 of 23 Dining/Café cards live and three Joe cards using embedded schedules. With covered Barnard data 8–24 hours old it remains 20 of 23 live but says Barnard was last confirmed at its actual timestamp. Partial or expired Barnard cards reduce the live count individually. With the existing v3 API during rollout it is 16 of 23 live and seven cards using embedded/verification fallback.

Client/header tests must verify category filters, exact card count, successful v4 hydration, v1-v3 compatibility, 8-hour and 24-hour boundaries, per-day partial Barnard hydration, per-venue live counts, all-week-closed wording, true source timestamps in the footer/card note, and complete fallback on invalid or unreachable data.

### 6. Update operations and workflow contract tests

**Modify:** `docs/dining-hours-operations.md`  
**Modify:** `tests/dining-hours-workflow.test.mjs`

Document the sixth official source, 14-or-21-day acquisition/14-day publish behavior, plain-fetch 403 constraint, normal headed-browser policy, exact target whitelist, true per-source timestamps, 8-hour stale and 24-hour expiration thresholds, partial coverage, the 75-second source budget, expected schema versions, and failure triage. Explicitly note that `lionhour:dining-hours:v1` is the storage namespace version rather than the public payload version.

Keep the existing workflow schedule, concurrency, API URL, secret, Redis key, headed Chromium launch, and `xvfb` configuration. Increase `.github/workflows/update-dining-hours.yml` from `timeout-minutes: 10` to `timeout-minutes: 15` so dependency installation, tests, the existing five sources, and the bounded 75-second Barnard source fit within the same job. The existing `tests/dining-hours-*.test.mjs` glob will include the new parser test; strengthen the workflow contract test to require the 15-minute ceiling, `xvfb`, and the `DINING_HOURS_PUBLISH_ENABLED` gate.

Keep explicit v1-v4 validators for this migration because adding four browser-visible venue IDs changes the public contract. Record schema proliferation as an accepted short-term tradeoff; do not introduce a dynamic source registry in this feature. Reconsider a registry only when a future source addition does not alter public snapshot structure or when another versioned source-set migration is proposed.

## Verification sequence

Run focused tests while implementing:

```sh
node --test tests/barnard-dining-hours-parser.test.mjs tests/dining-hours-scraper.test.mjs
node --test tests/dining-hours-source-schema.test.mjs tests/dining-hours-service.test.mjs tests/dining-hours-resolver.test.mjs tests/dining-hours-schema.test.mjs
node --test tests/dining-hours-client.test.mjs tests/dining-hours-workflow.test.mjs tests/header-controls.test.mjs
```

Then run repository validation:

```sh
npm test
git diff --check
python3 /Users/raymondwang/.agents/skills/decisiontracker/scripts/validate_ledger.py validate-ledger --input docs/decisions.md --repo /Users/raymondwang/PersonalProjects/LionTime
```

The current dirty-worktree baseline has five unrelated full-suite failures: one Café East header assertion and four Recreation renderer assertions. The implementation is acceptable only if every focused Dining/Barnard test passes and `npm test` introduces no additional failure. Re-run and record the exact baseline immediately before implementation because the worktree contains uncommitted Milstein Library work.

Perform one local acquisition smoke test in headed Chromium:

```sh
node scripts/dining-hours-scraper.mjs --json-out /tmp/lionhour-dining-hours.json
node -e "import('./lib/dining-hours-source-schema.js').then(async ({validateDiningAttemptBatch}) => { const fs = await import('node:fs/promises'); const value = JSON.parse(await fs.readFile('/tmp/lionhour-dining-hours.json', 'utf8')); const result = validateDiningAttemptBatch(value); console.log(result.ok ? 'valid Dining attempt batch' : result.errors); process.exitCode = result.ok ? 0 : 1; })"
```

Inspect the JSON only for contract shape and normalized hours; do not commit live third-party output.

## Deployment and rollback

1. Merge the client v4 compatibility, four verification-fallback cards, server validators, scraper, and tests together.
2. Wait for the Vercel deployment to complete before manually dispatching `Update dining hours`. The workflow has no push trigger, so the API cannot receive v3 attempts merely because the commit was pushed.
3. Within 15 minutes of the Vercel deployment completing, run the workflow once with publishing enabled. During this bounded initialization gap the four new cards intentionally say `Hours pending first live update`; do not wait for the next four-hour schedule. Verify six successful/retained source states, public schema v4, 21 source locations in the payload (17 existing plus four Barnard), 20 hydrated Dining/Café cards, 23 total cards, and no LeFrak/Kosher card.
4. Check one split-service day against the official page and confirm the footer timestamp/counts in production.
5. Let the regular minute-47/every-four-hours schedule resume.

Rollback is a normal code revert; do not clear Redis. A pre-v4 client continues to reject v4 safely and use embedded fallback, while reverting the server/scraper leaves the last validated snapshot recoverable under the unchanged Redis key. If the source begins challenging headed Chromium, disable publishing for diagnosis or let only `barnard-hours` fail and retain its last success; do not add stealth or bypass behavior.

## Acceptance criteria

- LionHour shows Hewitt Dining, Diana Center Cafe, and Bubble Tea & Sushi under Dining, and Liz's Place under Cafes.
- LeFrak Byte Kiosk/LeFrak Center and Barnard Kosher do not appear as standalone cards or snapshot locations.
- Hours come from the official date-specific Dine On Campus page and preserve multiple daily intervals and explicit closures.
- The scraper requires two consecutive displayed weeks, opportunistically accepts a third, and the public resolver returns the correct 14 rolling dates without inventing uncovered hours.
- Barnard failures are bounded and retained independently; Columbia Dining updates continue.
- Barnard's public `fetchedAt` remains its true retained-success time; the UI warns after 8 hours, stops counting it as live after 24 hours, and applies covered days individually when coverage is partial.
- Target discovery works across any number of source tables, all target-containing tables synchronize before capture, and representative rendered HTML exercises the production parser.
- The Barnard acquisition has a hard 75-second budget inside a 15-minute workflow ceiling.
- Public v1-v3 and retained v1-v2 data remain readable during migration, and older v2 jobs cannot downgrade v4 state.
- The footer is data-driven and reports 20 of 23 live after complete initialization.
- Focused tests pass, no new full-suite failures are introduced, and the decision ledger audits cleanly.

## Suggested commit checkpoint

After verification and ledger reconciliation:

```text
feat(dining): add live Barnard dining hours
```

## Adversarial review disposition

Reviewed and incorporated on 2026-08-24.

| Finding | Revised disposition |
|---|---|
| Single-source freshness | Preserve true per-source `fetchedAt`; warn after 8 hours and stop counting Barnard live after 24 hours. |
| Fixed table count | Discover the four target rows across any positive table count. |
| Accessibility/caption coupling | Parse visible rendered hours first, cross-check/fallback to accessibility labels, accept bounded caption variants, and fail the atomic source on disagreement. |
| Week-navigation race | Wait for every target-containing table to reach the expected week and for target HTML to stabilize across two polls. |
| Mandatory third week | Require 14 days and accept an optional validated third week for 21 days. |
| All-or-nothing hydration | Apply covered days per venue, mark only missing dates unpublished, and count partial/expired venues separately. |
| Runtime uncertainty | Cap Barnard acquisition at 75 seconds and the complete workflow at 15 minutes. |
| Schema proliferation | Keep strict v4 for this user-visible contract change; defer a dynamic registry and document the tradeoff. |
| Unrealistic fixtures | Parse sanitized representative rendered HTML through the production Cheerio and Playwright path. |
| Deployment gap | Require manual initialization within 15 minutes and use explicit pending-first-update copy during that interval. |
| All-week closures | Say `Closed throughout the published week` without inferring an unsupported seasonal reason. |
| Redis key naming | Retain the non-destructive key and document that it versions the storage namespace, not payloads. |
