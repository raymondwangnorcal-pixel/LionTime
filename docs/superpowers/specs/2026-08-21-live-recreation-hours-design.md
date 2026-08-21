# Live Recreation Hours Design

## Goal

Replace the embedded Dodge Fitness Center and Uris Pool schedules with live hours from Columbia Physical Education & Recreation while preserving the embedded schedules as immediate-render and failure fallbacks. Uris Pool remains a separate card with its own hours, but it inherits closure constraints from its parent facility, Dodge Fitness Center.

## Official source

- Source: `https://perec.columbia.edu/hours-operation`
- Direct HTTP requests receive Columbia's managed Cloudflare challenge, so the scheduled scraper will use headed Playwright Chromium inside `xvfb`, consistent with the verified Columbia Dining acquisition pattern.
- The scraper will read the official page's rendered schedule and status content. It will not bypass interactive CAPTCHAs or publish partial guesses when the source cannot be read confidently.

## Independent pipeline

Recreation hours will not share a scraper, API endpoint, Redis key, or scheduled workflow with library or dining hours.

- Workflow: `Update recreation hours`
- Schedule: once every four hours, at a minute distinct from the library and dining workflows
- Scraper: `scripts/recreation-hours-scraper.mjs`
- API: `/api/recreation-hours`
- Redis key: `lionhour:recreation-hours:v1`
- Publish secret: the existing `LIBRARY_HOURS_UPDATE_SECRET`
- GitHub repository variables:
  - `RECREATION_HOURS_PUBLISH_ENABLED=true`
  - `RECREATION_HOURS_API_URL=https://www.lionhour.com/api/recreation-hours`

A recreation scrape or publish failure must not affect library or dining updates.

## Snapshot contract

The scraper will publish schema version 1 with:

- generation timestamp
- trusted source URL
- fourteen consecutive Eastern dates
- exactly two required locations:
  - `dodge` — Dodge Fitness Center
  - `uris-pool` — Uris Pool
- per-location, per-date operating intervals
- an optional bounded plain-text source status

Intervals must use normalized 24-hour `HH:MM` values. The validator will reject missing or unexpected locations, gaps or disorder in dates, malformed or overlapping intervals, untrusted source URLs, unsafe status text, and snapshots that do not cover the required fourteen-day window.

## Maintenance and closure behavior

Each date is resolved using the following precedence:

1. If Dodge has an explicit maintenance closure, both Dodge and Uris Pool display `Closed for maintenance` and have no active intervals.
2. If Uris Pool has its own explicit maintenance closure while Dodge is open, only Uris Pool displays `Closed for maintenance`.
3. If Dodge is otherwise closed, Uris Pool is also closed even if a pool interval was published for that date.
4. If Dodge is open, each location uses its own published intervals. The pool may open later, close earlier, or have split sessions.
5. Other explicit source closure messages may be preserved as bounded descriptive statuses, but availability is calculated from the validated intervals and the parent-facility rules above.

Maintenance detection will be conservative and case-insensitive, recognizing explicit source text that identifies maintenance. The scraper will never infer a maintenance closure merely because hours are absent.

## Frontend behavior

The existing Dodge Fitness Center and Uris Pool cards remain in the embedded venue catalog. Their embedded schedules render immediately.

After the page loads, `assets/recreation-hours.js` requests `/api/recreation-hours`, validates the complete snapshot in the browser, applies both location updates atomically, and rerenders. A new footer status reports whether recreation data is live, stale, or using embedded fallback schedules.

The pool card remains separate in search, category filters, open/closed counts, and weekly details. Parent closure inheritance is applied before rendering so the pool can never appear open while Dodge is closed.

## Failure and freshness policy

- A failed Playwright acquisition fails the recreation workflow without publishing.
- An incomplete or invalid snapshot is rejected before storage.
- A rejected upload leaves the last valid Redis snapshot unchanged.
- The API returns an uninitialized response until the first valid snapshot is seeded.
- Data older than eight hours is marked stale.
- Network, API, schema, or hydration failures preserve both embedded schedules and show a fallback notice.
- Library and dining data remain unaffected by every recreation failure mode.

## Testing

Automated tests will cover:

- parsing representative Dodge and pool schedules from the official page structure
- normalization of ordinary, split, and closed-day schedules
- explicit Dodge and pool maintenance notices
- Dodge-to-pool closure inheritance
- preservation of different pool and gym intervals
- schema acceptance and rejection boundaries
- authenticated API reads and writes
- Redis failure behavior and last-known-good preservation
- independent GitHub Actions scheduling and publish gating
- atomic frontend overlay, stale state, and embedded fallback behavior

A final live smoke test will run the headed Playwright scraper against Columbia's source and validate the generated snapshot without publishing it.
