# Dining Hours Operations

## Architecture

The `Update dining hours` GitHub Actions workflow runs at minute 47 every four hours. Playwright launches headed Chromium inside `xvfb` and checks six official sources independently: the structured Columbia Locations & Hours feed; the NSOP, Labor Day, and Fall 2026 articles; Lerner Hall's Café East page; and Barnard's Dine On Campus Hours of Operation page. It uploads a validated source-attempt batch to `/api/dining-hours`. Vercel retains each source's last successful normalized evidence and the last valid public snapshot together under `lionhour:dining-hours:v1`.

`lionhour:dining-hours:v1` is the Redis storage namespace version, not the public payload version. Public GET responses accept snapshot schema versions 1 through 4 during migration. Version 4 adds the Barnard source, four Barnard venues, and the true retained-success timestamp for each source. Attempt batches and retained envelopes use their own versions: batch/envelope version 3 represents all six sources.

Headed mode is intentional: Columbia's managed challenge did not complete in headless mode during live verification. When an official page initially returns a recognized managed challenge, headed Chromium remains on that page for one 12-second passive grace period so the publisher's ordinary browser verification can finish. The scraper never solves a CAPTCHA, copies cookies, disguises automation, or bypasses a security control.

Library and dining jobs are independent. A failed Dining source records a bounded attempt result while preserving that source's prior successful evidence. A malformed batch or invalid merged snapshot is rejected atomically and never interrupts library updates. The Dining job has a 15-minute ceiling; Barnard acquisition is separately capped at 75 seconds. Its shared deadline includes the 45-second navigation limit, any 12-second challenge grace, the 15-second initial-render limit, and up to 7.5 seconds for each week transition.

The Barnard adapter whitelists only Hewitt Dining, Diana Center Cafe, Barnard Dining Bubble Tea and Sushi Spot, and Liz's Place. It does not publish LeFrak Byte Kiosk, LeFrak Center, or Barnard Kosher as separate venues. Diana Center Cafe and Bubble Tea & Sushi are Dining cards; Liz's Place is a Cafe card.

## Required configuration

Vercel Production must already contain:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `LIBRARY_HOURS_UPDATE_SECRET`

The GitHub repository must contain this Actions secret:

- `LIBRARY_HOURS_UPDATE_SECRET` — exactly the same value as Vercel

Add these Actions variables under **Settings → Secrets and variables → Actions → Variables**:

- `DINING_HOURS_PUBLISH_ENABLED` = `true`
- `DINING_HOURS_API_URL` = `https://lionhour.com/api/dining-hours`

Do not place the update secret in a repository variable or source file.

## First deployment and seed

1. Merge and push the implementation so Vercel deploys `/api/dining-hours`.
2. Confirm `https://lionhour.com/api/dining-hours` returns `503` with `Dining hours are not initialized`; this proves the endpoint is deployed but unseeded.
3. Open GitHub **Actions → Update dining hours → Run workflow** and run the `main` branch.
4. Open the `scrape-and-publish` job and confirm the publish step ran rather than being skipped and `Verify live Barnard Dining publication` passed.
5. Reload `https://lionhour.com`. With a fresh complete Barnard source, the footer should report `20 of 23 live; 3 cafés using embedded schedules`.
6. Confirm `https://lionhour.com/api/dining-hours` returns schema version 4, twenty-one validated source locations, fourteen rolling dates per location, and six source timestamps. The source retains either fourteen or twenty-one Barnard dates, while the public resolver publishes the rolling fourteen-day window.
7. Confirm the four Barnard cards appear in the expected Dining/Cafe filters and that no LeFrak or standalone Kosher card appears.
8. In the workflow log, confirm all six source lines report either `success` or a bounded failure such as `failure (challenge)`. During migration, successful sources accumulate independently; an older batch cannot remove initialized Barnard evidence or downgrade a valid version-4 snapshot. The job remains red until the public API exposes schema version 4 and all four Barnard venue IDs.

## Local verification

Install dependencies and Chromium once:

```bash
npm ci
npx playwright install chromium
```

Run tests:

```bash
npm test
python3 -m unittest tests/test_scrape.py -v
```

Run a live scrape without publishing:

```bash
node scripts/dining-hours-scraper.mjs --json-out /tmp/lionhour-dining-hours.json
node -e "import('./lib/dining-hours-source-schema.js').then(async ({validateDiningAttemptBatch}) => { const fs = await import('node:fs/promises'); const value = JSON.parse(await fs.readFile('/tmp/lionhour-dining-hours.json', 'utf8')); const result = validateDiningAttemptBatch(value); console.log(result.ok ? 'valid Dining attempt batch' : result.errors); process.exitCode = result.ok ? 0 : 1; })"
```

## Failure behavior

- A 403, 429, or recognized managed-challenge page gets one 12-second passive grace period. If the normal browser page remains challenged, the source becomes `failure (challenge)` before source selectors are queried; the scraper does not attempt to bypass it and continues checking the other official sources.
- Navigation, timeout, missing-content, parse, and unexpected failures are likewise bounded per source. Successful sources still publish; failed sources retain only their own last successful evidence.
- If Columbia changes a source payload, that source reports `parse` or `missing-content`. If the batch contract or resolved snapshot is invalid, the API rejects the update atomically.
- If Vercel or Redis is unavailable, PUT returns an error and GitHub retries the HTTP request.
- After a configured publish, the workflow makes cache-busting GET requests up to three times, five seconds apart. It fails unless the public response validates as schema version 4 and contains Hewitt, Diana Center Cafe, Bubble Tea & Sushi, and Liz's Place.
- The last valid public snapshot remains available when an update cannot yet be resolved, including the first rollout from the legacy snapshot format.
- If the API is missing, invalid, or more than eight hours old, the footer reports fallback or stale data. Embedded schedules render before either live request.
- Joe's NoCo, Joe's Journalism, and Joe's Dodge intentionally remain static because Joe Coffee's official campus pages identify the locations but do not publish regular operating hours.
- Joe Coffee's official holiday page is a verification aid only. Its exceptions are not applied automatically unless the page publishes a machine-verifiable year or exact dates, preventing an undated prior holiday schedule from overriding current hours.
- Café East is parsed from Lerner Hall's official page and retained independently; a Café East acquisition or parse failure preserves its last successful weekly schedule.
- Barnard's page is browser-rendered and a plain fetch may return 403. Use only the normal headed Playwright session; never copy cookies, modify browser fingerprints, solve a challenge, or replay private endpoints.
- A valid Barnard attempt requires four exact target rows across any number of tables and two consecutive complete Sunday-through-Saturday weeks. A complete third week is accepted when available; if that optional transition is unavailable, fourteen days remain valid.
- The parser treats visible desktop intervals as primary evidence and accessible labels as a cross-check/fallback. Caption/date mismatches, missing targets, conflicting evidence, malformed times, or incomplete required weeks fail the entire Barnard attempt without affecting the other five sources.
- The UI uses Barnard's true retained-success time. Complete covered data is fresh through eight hours, shown with a verification warning from over eight through twenty-four hours, and no longer counted as live after twenty-four hours. Covered dates still render, while uncovered dates are marked unpublished and make only the affected Barnard venue partial.
- If all seven displayed days for a Barnard venue are explicitly closed, the card says `Closed throughout the published week`; LionHour does not infer a closure reason that the source did not publish.
