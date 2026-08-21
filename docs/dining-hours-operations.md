# Dining Hours Operations

## Architecture

The `Update dining hours` GitHub Actions workflow runs at minute 47 every four hours. Playwright launches headed Chromium inside `xvfb`, loads Columbia Dining's official Locations & Hours page, reads its structured `window.dining_nodes` value, normalizes fourteen Eastern dates, and uploads the validated snapshot to `/api/dining-hours`. Vercel stores it under `lionhour:dining-hours:v1` in the same Upstash Redis database as library hours. Headed mode is intentional: Columbia's managed challenge did not complete in headless mode during live verification.

Library and dining jobs are independent. A failed scrape or rejected snapshot never replaces the previous dining value and never interrupts library updates.

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
6. Confirm `https://lionhour.com/api/dining-hours` returns schema version 1, sixteen locations, and fourteen days per location.

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
node -e "import('./lib/dining-hours-schema.js').then(async ({validateDiningHoursSnapshot}) => { const fs = await import('node:fs/promises'); const value = JSON.parse(await fs.readFile('/tmp/lionhour-dining-hours.json', 'utf8')); const result = validateDiningHoursSnapshot(value); console.log(result.ok ? 'valid dining snapshot' : result.errors); process.exitCode = result.ok ? 0 : 1; })"
```

## Failure behavior

- If Cloudflare presents an interactive challenge, Playwright times out and the workflow fails. The scraper does not attempt to bypass a CAPTCHA.
- If Columbia changes the structured payload, the normalizer or schema rejects the run before upload.
- If Vercel or Redis is unavailable, PUT returns an error and GitHub retries the HTTP request.
- The last valid Redis snapshot remains available after any failed update.
- If the API is missing, invalid, or more than eight hours old, the footer reports fallback or stale data. Embedded schedules render before either live request.
- Joe's NoCo, Café East, Joe's Journalism, and Joe's Dodge intentionally remain static even when the other sixteen locations are live.
