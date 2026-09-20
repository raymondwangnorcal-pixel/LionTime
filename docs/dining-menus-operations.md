# Dining Menus Operations

## What this pipeline operates

`Update dining menus` scrapes LionDine every two hours at minute 17 and publishes the
result to `/api/dining-menus`, which stores it in Upstash at `lionhour:dining-menus:v1`.
The browser fetches that endpoint; `data/menus.json` remains in the repo only as the
last-committed fallback for when the API cannot be reached.

## Why it no longer commits

Menus were the only feed that published by pushing to `main`. On 2026-09-18 at 16:01 UTC
a repository ruleset ("Branch Protection") began requiring a pull request on `main`, with
an empty bypass list. From the next run at 16:30 UTC every job failed at the push with
`GH013: Changes must be made through a pull request`, while the scrape itself kept
succeeding — so the site served the menus of 2026-09-18 for two days and the only signal
was a failing workflow. Publishing through the API removes the push, needs no bypass
actor and no token with write access to `main`, and matches the five hours feeds.

The push failing used to be what stopped a bad scrape from reaching the site. That guard
now lives in `lib/dining-menus-schema.js`: a snapshot with no venues, or with venues that
publish no meals at all, is rejected with 422 and the last good snapshot stays up. A day
on which every hall is closed is legitimate and publishes normally.

## Required configuration

Vercel Production (and Preview, when testing a preview deployment):

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `LIBRARY_HOURS_UPDATE_SECRET` — the existing shared publishing secret, identical to the
  GitHub Actions repository secret of the same name. Never put its value in repository
  variables, source, logs, or documentation.

GitHub → Settings → Secrets and variables → Actions → Variables:

- `DINING_MENUS_PUBLISH_ENABLED=true`
- `DINING_MENUS_API_URL=https://lionhour.com/api/dining-menus`

Use the apex domain. `www.lionhour.com` 308-redirects to it, curl does not follow
redirects, and the workflow treats a 3xx as a failed publish (DEC-0072).

The workflow does not publish unless the enabled value is exactly `true` and the API URL
is non-empty, so the first deployment can be checked read-only: leave the variables unset,
run it once, and confirm the scrape step still succeeds.

## After a publish

`scripts/verify-published-snapshot.mjs --kind dining-menus` re-reads the endpoint and
requires its `generated` stamp to equal the one this run sent. A redirect, a wrong store,
or a CDN serving a stale copy fails the run rather than passing silently.

## First deploy

Until the first successful publish the endpoint answers `503` and the client falls back to
`data/menus.json`, so the menu tab keeps working while the API fills.
