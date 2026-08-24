# Dining Hours Operations

## Architecture

The `Update dining hours` GitHub Actions workflow runs at minute 47 every four hours. Playwright launches headed Chromium inside `xvfb` and checks four official sources independently: the structured Locations & Hours feed plus the NSOP, Labor Day, and Fall 2026 articles. It uploads a validated source-attempt batch to `/api/dining-hours`. Vercel retains each source's last successful normalized evidence and the last valid public snapshot together under `lionhour:dining-hours:v1`. Public GET responses remain the schema-version-1-or-2 snapshot expected by the browser.

Headed mode is intentional: Columbia's managed challenge did not complete in headless mode during live verification. Headed Chromium is only a normal browser execution environment; the scraper never solves a CAPTCHA, copies cookies, disguises automation, or bypasses a security control.

Library and dining jobs are independent. A failed Dining source records a bounded attempt result while preserving that source's prior successful evidence. A malformed batch or invalid merged snapshot is rejected atomically and never interrupts library updates.

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
4. Open the successful `scrape-and-publish` job and confirm the publish step ran rather than being skipped.
5. Reload `https://lionhour.com`. The footer should report `16 of 20 live; 4 cafés using embedded schedules`.
6. Confirm `https://lionhour.com/api/dining-hours` returns schema version 2, sixteen locations, and fourteen days per location.
7. In the workflow log, confirm all four source lines report either `success` or a bounded failure such as `failure (challenge)`. During migration from the legacy stored snapshot, the API keeps serving that snapshot until all four retained source payloads have initialized at least once.

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

- A 403, 429, or recognized managed-challenge page becomes an immediate `challenge` result before article selectors are queried. The scraper does not attempt to bypass it and continues checking the other official sources.
- Navigation, timeout, missing-content, parse, and unexpected failures are likewise bounded per source. Successful sources still publish; failed sources retain only their own last successful evidence.
- If Columbia changes a source payload, that source reports `parse` or `missing-content`. If the batch contract or resolved snapshot is invalid, the API rejects the update atomically.
- If Vercel or Redis is unavailable, PUT returns an error and GitHub retries the HTTP request.
- The last valid public snapshot remains available when an update cannot yet be resolved, including the first rollout from the legacy snapshot format.
- If the API is missing, invalid, or more than eight hours old, the footer reports fallback or stale data. Embedded schedules render before either live request.
- Joe's NoCo, Café East, Joe's Journalism, and Joe's Dodge intentionally remain static even when the other sixteen locations are live.
