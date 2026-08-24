# LionTime Recreation activity-calendar handoff

Schema-Version: 1
Last-Updated: 2026-08-24T17:40:21-04:00
Current-Origin: origin-5889afe7faf06090be849e0e

## Origins

| Origin-ID | Branch | Created-At |
|---|---|---|
| origin-39ad638491073981246a7c49 | main | 2026-08-24T17:11:46-04:00 |
| origin-5889afe7faf06090be849e0e | frontend/appearance-polish | 2026-08-24T17:40:21-04:00 |

## Current Goal

Origin-ID: origin-5889afe7faf06090be849e0e
Text: Scrape every official Dodge activity-space calendar and publish the room-specific hours to LionHour.

## Accomplished in Latest Material Session

Origin-ID: origin-5889afe7faf06090be849e0e
Text: Implemented independent three-week acquisition and exact event-identity validation for Blue Gym, Levien Gymnasium, Aerobics Room 4, and Functional Fitness Studio; kept Squash Courts booking-only and Blue Gym as the sole Dodge fallback; pushed the implementation to main; successfully published workflow run 32780139101 after one transient Columbia challenge retry; and verified the production API and expanded live LionHour room rows.

## Outstanding Tasks

| Task-ID | Origin-ID | Priority | Description |
|---|---|---|---|

## Recommended Next Task

Origin-ID: origin-5889afe7faf06090be849e0e
Task-ID: none
Reason: The requested activity-calendar scraping is implemented, published, and verified; no follow-up is required for this request.

## Files Touched

| Path | Origin-ID | Presence | State | Notes |
|---|---|---|---|---|
| docs/decisions.md | origin-39ad638491073981246a7c49 | present | committed | DEC-0039 and its implementation event record the accepted Blue Gym-to-Dodge fallback policy. |
| docs/decisions.md | origin-5889afe7faf06090be849e0e | present | committed | DEC-0040 and its implementation update record the four-calendar source policy. |
| index.html | origin-5889afe7faf06090be849e0e | present | uncommitted | Unrelated pre-existing or concurrent user edit preserved without modification. |
| lib/recreation-hours-resolver.js | origin-39ad638491073981246a7c49 | present | committed | Compares date-specific replacement priority with bounded weekly baseline priority before selection. |
| lib/recreation-source-parser.js | origin-39ad638491073981246a7c49 | present | committed | Parses exact seasonal transition bounds and official Blue Gym calendar event evidence. |
| lib/recreation-source-parser.js | origin-5889afe7faf06090be849e0e | present | committed | Parses room-specific open events and explicit closures with exact calendar identity checks. |
| scripts/recreation-hours-acquire.mjs | origin-39ad638491073981246a7c49 | present | committed | Captures three calendar weeks and waits for each displayed week to stabilize. |
| scripts/recreation-hours-acquire.mjs | origin-5889afe7faf06090be849e0e | present | committed | Discovers each official tab and captures three stabilized weeks while isolating per-calendar failures. |
| scripts/recreation-hours-scraper.mjs | origin-39ad638491073981246a7c49 | present | committed | Integrates optional calendar evidence without making the required official page acquisition brittle. |
| scripts/recreation-hours-scraper.mjs | origin-5889afe7faf06090be849e0e | present | committed | Integrates successful activity calendars independently. |
| tests/fixtures/recreation-aerobics-calendar.txt | origin-5889afe7faf06090be849e0e | present | committed | Sanitized Aerobics maintenance events. |
| tests/fixtures/recreation-blue-gym-calendar.txt | origin-39ad638491073981246a7c49 | present | committed | Sanitized date-specific Blue Gym event fixture. |
| tests/fixtures/recreation-functional-fitness-calendar.txt | origin-5889afe7faf06090be849e0e | present | committed | Sanitized Functional Fitness split-session events. |
| tests/fixtures/recreation-levien-calendar.txt | origin-5889afe7faf06090be849e0e | present | committed | Sanitized Levien open and maintenance events. |
| tests/recreation-hours-acquire.test.mjs | origin-39ad638491073981246a7c49 | present | committed | Covers successful optional calendar acquisition and isolated calendar failure. |
| tests/recreation-hours-acquire.test.mjs | origin-5889afe7faf06090be849e0e | present | committed | Covers four-calendar acquisition results and isolated failure. |
| tests/recreation-hours-resolver.test.mjs | origin-39ad638491073981246a7c49 | present | committed | Covers direct table, calendar fallback, unavailable evidence, and closure precedence. |
| tests/recreation-hours-scraper.test.mjs | origin-39ad638491073981246a7c49 | present | committed | Covers end-to-end calendar evidence integration into the snapshot. |
| tests/recreation-hours-scraper.test.mjs | origin-5889afe7faf06090be849e0e | present | committed | Covers end-to-end room hours and maintenance closure publication. |
| tests/recreation-source-parser.test.mjs | origin-39ad638491073981246a7c49 | present | committed | Covers exact transition validation and split Blue Gym schedule parsing. |
| tests/recreation-source-parser.test.mjs | origin-5889afe7faf06090be849e0e | present | committed | Covers all four event identities, openings, closures, and Blue-only Dodge fallback. |

## Git / Remote State

Origin-ID: origin-5889afe7faf06090be849e0e
Branch: frontend/appearance-polish
Head: 78ad7c2e20ca0ccbea9a52a307ceb839ace75150
Upstream: origin/frontend/appearance-polish
Ahead: 0
Behind: 0
Remote-Freshness: verified
Remote-Freshness-Reason: none
Project-Working-Tree: dirty
Handoff-Path-State-Before-Write: clean
Handoff-Commit-Exception: none

## Unpushed Commits Before Handoff

| Commit | Subject |
|---|---|

## Validation

| Validation-ID | Origin-ID | Command | Result | Evidence |
|---|---|---|---|---|
| validation-1130cf22d6ac09941db800f1 | origin-5889afe7faf06090be849e0e | node --test tests/recreation-hours-acquire.test.mjs tests/recreation-source-parser.test.mjs tests/recreation-hours-resolver.test.mjs tests/recreation-hours-schema.test.mjs tests/recreation-hours-service.test.mjs tests/recreation-hours-scraper.test.mjs tests/recreation-hours-workflow.test.mjs | passed | 77 tests passed and 0 failed. |
| validation-34e3c1cb213bcc20f9c248f9 | origin-39ad638491073981246a7c49 | node scripts/recreation-hours-scraper.mjs --json-out /private/tmp/liontime-recreation-live.json | passed | Live headed-Chromium scrape validated three facilities through 2026-09-06 and populated all fourteen Dodge and Blue Gym dates. |
| validation-4ebc2c5ccee36c3c66b4d241 | origin-39ad638491073981246a7c49 | node --test tests/recreation-hours-acquire.test.mjs tests/recreation-source-parser.test.mjs tests/recreation-hours-resolver.test.mjs tests/recreation-hours-schema.test.mjs tests/recreation-hours-service.test.mjs tests/recreation-hours-scraper.test.mjs tests/recreation-hours-workflow.test.mjs | passed | 76 tests passed and 0 failed. |
| validation-6148035a0e274440fb37f8ae | origin-39ad638491073981246a7c49 | GET https://www.lionhour.com/api/recreation-hours | passed | Public snapshot generated at 2026-08-24T21:10:40.023Z reports Dodge 06:00-22:00 today and verified calendar-backed fallback dates after the direct table expires. |
| validation-7c0a3e539307d0d2592fa4c6 | origin-5889afe7faf06090be849e0e | npm test | partial | 245 of 249 tests passed; the four previously recorded Recreation renderer expectation assertions still fail outside the scheduled pipeline. |
| validation-9681f6082499e8808d24cbd4 | origin-5889afe7faf06090be849e0e | gh run watch 32780139101 --exit-status | passed | Retry completed in 1 minute 22 seconds, including tests, live scrape, and production publish; the initial attempt encountered a transient managed challenge on Columbia Modifications. |
| validation-b378374ad2e878e03eb85246 | origin-5889afe7faf06090be849e0e | GET https://www.lionhour.com/api/recreation-hours and inspect expanded LionHour Dodge spaces | passed | Production generated at 2026-08-24T21:37:46.384Z shows live Blue, Levien, and Functional Fitness hours, the Aerobics maintenance closure, and Squash as booking-only. |
| validation-b549e11933a6ba763cabcd50 | origin-5889afe7faf06090be849e0e | node scripts/recreation-hours-scraper.mjs --json-out /private/tmp/liontime-recreation-live.json | passed | Live headed scrape validated three facilities through 2026-09-06 and populated all four calendar-backed activity spaces. |
| validation-c97bf4c199b5a5750ef576a3 | origin-39ad638491073981246a7c49 | gh run watch 32777975282 --exit-status | passed | Update recreation hours workflow completed successfully in 52 seconds, including scrape and publish. |
| validation-f60b38212d98744e1a81f574 | origin-39ad638491073981246a7c49 | npm test | partial | 244 of 248 tests passed; four pre-existing Recreation UI expectation assertions failed outside the scraper pipeline. |

## Risks / Decisions

| Item-ID | Origin-ID | Kind | Status | Description |
|---|---|---|---|---|
| decision-cc34c13c37a63ef19d12fe8d | origin-39ad638491073981246a7c49 | decision | accepted | Blue Gym open events prove Dodge is open; direct dated Dodge hours and explicit closures remain stronger, while missing or ambiguous evidence fails to verification. |
| decision-f607ce2c67ce2e365d2ef8ab | origin-5889afe7faf06090be849e0e | decision | accepted | Scrape the four official activity calendars independently; only Blue Gym may supply Dodge fallback evidence, and Squash remains booking-only. |
| risk-32ac51564ddd0754c38bda5b | origin-39ad638491073981246a7c49 | risk | open | The repository-wide suite retains four Recreation-space renderer expectation failures that predate and do not gate the green scheduled Recreation pipeline. |
| risk-e248f24a552d008f3b856c35 | origin-5889afe7faf06090be849e0e | risk | open | Columbia's Modified Hours page can transiently return a managed challenge on hosted runners; the successful retry confirms no persistent blocker. |

## Archive Decision

Origin-ID: origin-5889afe7faf06090be849e0e
Safe-to-Archive: yes
Reason: The activity-calendar implementation is committed, pushed to main, published, and verified in production; the unrelated index.html edit remains explicitly preserved.
Next-Action: none
