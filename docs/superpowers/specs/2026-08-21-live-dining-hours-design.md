# Live Dining Hours Design

## Goal

Add a failure-resilient live data path for Columbia Dining halls and cafés while preserving LionHour's static-first rendering and the existing four source-unmatched café cards.

## Source and acquisition

The official source is `https://dining.columbia.edu/content/locations-hours`. The page is protected by a Cloudflare managed challenge and rejects plain HTTP clients, including direct Drupal JSON requests. Its client-side day selector reads a structured global named `dining_nodes`, which contains location IDs, active date ranges, excluded dates, daily intervals, and display labels.

A dedicated Node.js Playwright scraper will load the official page in headed Chromium inside GitHub Actions' virtual X display, wait for `window.dining_nodes`, retrieve that value directly from the page runtime, and parse it as JSON. Live verification showed that Columbia's managed challenge remains on its interstitial in headless mode but completes without interaction in a fresh headed Chromium profile. The scraper will not scrape rendered cards, solve interactive CAPTCHAs, or copy browser cookies. If the managed challenge does not complete or the structured value is missing, the run fails without publishing.

## Catalog policy

The following current Columbia locations map to live LionHour venues by stable source node ID:

| Source node | LionHour ID | Category |
| --- | --- | --- |
| 7482 | `bj-everett` | cafe |
| 56 | `bj-butler` | cafe |
| 60 | `bj-uris` | cafe |
| 57 | `bj-mudd` | cafe |
| 6990 | `chefdons` | dining |
| 6907 | `chefmikes` | dining |
| 7351 | `facultyhouse` | dining |
| 7850 | `facultyhouse-4` | dining |
| 12 | `ferris` | dining |
| 7355 | `gracedodge` | dining |
| 11 | `jjs` | dining |
| 10 | `johnjay` | dining |
| 9727 | `johnnys` | dining |
| 58 | `lenfest-cafe` | cafe |
| 7452 | `smith-dining` | dining |
| 7487 | `facshack` | dining |

`joe-noco`, `cafe-east`, `joe-journalism`, and `joe-dodge` remain embedded static cards. They are never overwritten by the live payload and are identified in the dining data-status copy as static fallbacks.

## Normalization and source policy

The scraper publishes a 14-day Eastern Time window beginning on the generated date. Each live location contains one entry per date:

```json
{
  "date": "2026-08-21",
  "intervals": [["08:00", "15:00"]],
  "status": "Summer Hours"
}
```

Active periods are selected inclusively by `date_from` and `date_to`. An excluded date produces no intervals for that date. Multiple daily intervals are preserved in source order after validation. Time values are normalized to `HH:MM`; `24:00` is allowed only as a close time. Overnight intervals are allowed because locations such as JJ's can legitimately close the following morning.

The structured `days` fields are authoritative for calculated open/closed state. `displayed_hours` is retained as descriptive source status. This avoids converting prose into guessed times and handles cases where prose and structured values disagree.

When a day has no intervals and the source status begins with `Closed`, the exact source text, such as `Closed for Summer`, becomes the card badge and today's-hours text. Non-closure text such as `Summer Hours` appears as a source note while normal open/closed calculation continues.

## Snapshot contract

`/api/dining-hours` accepts and returns schema version 1 snapshots:

```json
{
  "schemaVersion": 1,
  "generated": "2026-08-21T04:00:00Z",
  "source": "https://dining.columbia.edu/content/locations-hours",
  "windowStart": "2026-08-21",
  "windowEnd": "2026-09-03",
  "locations": [
    {
      "id": "johnjay",
      "sourceId": "10",
      "name": "John Jay Dining Hall",
      "category": "dining",
      "days": []
    }
  ]
}
```

Validation requires exactly the 16 mapped live IDs, the matching source IDs and categories, unique locations, 14 consecutive dates, safe bounded strings, valid intervals, the exact official HTTPS source URL, and a generated timestamp whose Eastern date equals `windowStart`.

## API, storage, and scheduling

Dining uses a separate Redis key, `lionhour:dining-hours:v1`, and a separate Vercel function at `/api/dining-hours`. GET is public and cached for five minutes with stale-while-revalidate. PUT uses the existing `LIBRARY_HOURS_UPDATE_SECRET`, constant-time bearer-token comparison, and validates the entire snapshot before replacing Redis.

`.github/workflows/update-dining-hours.yml` runs every four hours on an offset schedule, supports manual dispatch, uses read-only repository permissions, installs Playwright Chromium, runs focused tests, starts the scraper through `xvfb-run`, and publishes only when `DINING_HOURS_PUBLISH_ENABLED` equals `true`. It reads the destination from `DINING_HOURS_API_URL` and the shared secret from `LIBRARY_HOURS_UPDATE_SECRET`.

Library and dining publishing are independent. A dining scrape, validation, or publish failure leaves the prior dining snapshot intact and cannot block library updates.

## Frontend behavior

`assets/dining-hours.js` validates a fetched snapshot again before applying it atomically to mapped venues. It maps the first seven snapshot dates onto the existing seven-day interface, preserves split intervals, attaches per-day source status, and leaves unrelated venues untouched. Invalid, missing, or failed data leaves every embedded schedule unchanged.

Two new embedded cards are added for Faculty House 4th Floor and Robert F. Smith Dining Hall so they remain present even before the first live snapshot. A dining data-status link reports live, stale, partial/static-fallback, or fully embedded state. Snapshots older than eight hours are marked stale. The four unmatched cafés always remain static and are counted explicitly in the partial status.

## Verification

Unit tests cover structured payload parsing, active periods, excluded dates, split and overnight intervals, status preservation, schema validation, API authentication and storage failures, client-side atomic application and fallback, catalog mapping, and workflow security/schedule configuration. The full Node test suite and Python library scraper suite must remain green. A live scraper smoke test writes a temporary snapshot and validates it without publishing.
