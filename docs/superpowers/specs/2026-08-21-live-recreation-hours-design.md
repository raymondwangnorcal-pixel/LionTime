# Live Recreation Hours Design

## Goal

Provide the most accurate current hours and student availability for Columbia- and Barnard-accessible fitness facilities. Normal weekly schedules are only the baseline: temporary closures, modified hours, seasonal date ranges, room-specific schedules, events, reservations, maintenance, construction, holidays, and access restrictions must take precedence when official sources publish them.

The system must never invent a room schedule, apply an outdated semester schedule to the current date, or assume that every space inside an open building is available.

## User experience and facility catalog

### Main fitness listings

The Fitness section will contain separate top-level cards for:

- Dodge Fitness Center
- Uris Pool
- Barnard Fitness Center
- any additional Columbia or Barnard facility that is confirmed by an official source to be useful and accessible to undergraduate students

Varsity-only, staff-only, and otherwise student-inaccessible facilities will not be added. Newly discovered facilities require an explicit, tested catalog mapping before publication; the scraper will not create arbitrary cards from untrusted page text.

### Dodge as an expandable parent

Dodge Fitness Center remains the main parent listing. Its collapsed card shows only Dodge's overall current status and today's building hours.

Expanding the Dodge card reveals a `View spaces` area containing:

- Blue Gym
- Levien Gymnasium
- Functional Fitness Studio
- Aerobics Room 4
- Squash Courts

The space list is collapsed by default so the Fitness section remains easy to scan. Each space displays its own current availability, hours when published, relevant reason, and access requirement. These are nested details rather than separate filterable venue cards.

The existing weekly Dodge schedule remains visible in the expanded details, alongside the nested space availability. The interface must make it clear whether an item represents facility hours, open-recreation availability, or a reservation requirement.

### Uris Pool

Uris Pool remains a separate top-level Fitness listing even though it is inside Dodge. It uses its own lap-swim or recreational-swim schedule and may have split daily sessions.

Dodge is the pool's parent-access constraint:

- If Dodge is closed, Uris Pool cannot appear open.
- If Dodge is closed for maintenance, Uris Pool also displays `Closed for maintenance`.
- If only Uris Pool has a maintenance closure, Dodge remains unaffected.
- Dodge being open does not imply that Uris Pool is open.

### Barnard Fitness Center

Barnard Fitness Center remains a separate top-level listing. Its card must communicate official student-access restrictions separately from its operating intervals, including Barnard ID, Columbia affiliate, membership, reservation, or other requirements when the source states them.

## Official sources

### Columbia sources

Primary Columbia sources are:

1. Columbia Recreation Hours of Operation: `https://perec.columbia.edu/hours-operation`
2. Columbia Recreation Modified Hours & Closures: `https://perec.columbia.edu/content/modified-hours-closures`
3. Official Columbia Recreation facility-specific schedules, calendars, or reservation systems linked from those pages

The Hours of Operation page provides baseline current or seasonal schedules. The Modified Hours & Closures page and facility-specific notices can override that baseline for particular dates, times, or spaces.

Direct HTTP requests to the Recreation site receive Columbia's managed Cloudflare challenge. The scheduled scraper will therefore use headed Playwright Chromium inside `xvfb`, consistent with the verified Dining acquisition pattern. It will inspect rendered content and structured network responses where available; it will not attempt to bypass an interactive CAPTCHA.

### Barnard sources

Primary Barnard sources are:

1. Barnard Physical Well-Being / Fitness Center: `https://barnard.edu/lefrak-center/physical-well-being`
2. Official Barnard recreation schedules, calendars, reservation systems, or IMLeagues pages linked from Barnard's official site

Barnard-controlled sources take precedence over generic Barnard directory pages. Third-party business listings and community posts are not accepted sources.

## Source-priority policy

When official sources disagree, use this order:

1. date-specific, facility-specific closure or modified-hours notice
2. room-specific schedule or availability notice
3. official Columbia Recreation or Barnard recreation current schedule
4. current seasonal schedule whose date range includes the target date
5. general official facility page
6. general Columbia or Barnard building directory

Within the same priority level, prefer a notice with a more specific facility, date, and time range, followed by the source with the more recent official update timestamp when available.

Google Maps, Yelp, Apple Maps, Reddit, search-result snippets, and other third-party listings are never used when an official source exists.

If official conflicts remain unresolved, the snapshot records a conflict and the frontend reports `Hours need verification` rather than guessing. A lower-priority normal schedule must never override a higher-priority closure.

## Seasonal and date-specific resolution

Every baseline schedule must include its applicable date range when the source provides one. The normalizer selects only schedules covering the requested Eastern date.

Seasonal periods include, but are not limited to:

- summer, fall, and spring terms
- winter and spring breaks
- Thanksgiving and university holidays
- reading period and finals
- orientation, move-in, commencement, and intersession periods

An old semester schedule is not valid merely because it remains visible or appears first on a page. If no current schedule can be identified confidently, the system reports that current hours were not published.

After selecting the current baseline, the normalizer applies date-specific modified hours and closures. A specific early closing, late opening, complete closure, maintenance window, construction notice, or holiday schedule replaces or subtracts from the baseline for its stated date and time.

## Room and event availability

Dodge subspaces do not inherit Dodge's operating intervals. Each space uses only its own official open-recreation or availability information.

Relevant restrictions include:

- varsity practices and Athletics events
- intramural games and tournaments
- basketball or swim competitions
- university events and private reservations
- fitness classes
- maintenance, construction, and repairs
- holiday or seasonal closures
- reservation-only periods

A room may be unavailable while Dodge remains open. When the source provides a reason or end time, the nested item communicates it, for example `Closed until 6:00 PM · Varsity practice`.

If no distinct schedule is published for a Dodge subspace, the system displays `Separate hours not published` and does not copy Dodge's hours into that space.

## Status and access model

For every top-level facility and Dodge subspace, the normalized state can contain:

- one or more operating or availability intervals
- an exact source-derived closure or modification status
- an optional reason and effective time range
- an availability type such as facility hours, open recreation, lap swim, or reservation required
- access restrictions stored separately from hours
- provenance identifying the official source and applicable schedule period
- an unresolved-conflict flag when official sources cannot be reconciled safely

Supported user-visible statuses include:

- Open
- Closing soon
- Closed
- Closed for maintenance
- Closed for Athletics event
- Reservation required
- Separate hours not published
- Hours need verification

`Closed for maintenance` is used only when an official source explicitly identifies maintenance, construction, repair, or an equivalent closure. Missing intervals alone do not imply maintenance.

## Independent Recreation Hours pipeline

Recreation hours will not share a scraper, API endpoint, Redis key, or scheduled workflow with library or dining hours.

- Workflow: `Update recreation hours`
- Schedule: once every four hours, at a minute distinct from library and dining jobs
- Scraper: `scripts/recreation-hours-scraper.mjs`
- API: `/api/recreation-hours`
- Redis key: `lionhour:recreation-hours:v1`
- Publish authentication: existing `LIBRARY_HOURS_UPDATE_SECRET`
- GitHub repository variables:
  - `RECREATION_HOURS_PUBLISH_ENABLED=true`
  - `RECREATION_HOURS_API_URL=https://www.lionhour.com/api/recreation-hours`

A recreation acquisition, normalization, or publishing failure must not affect library or dining updates.

## Snapshot contract

Schema version 1 contains:

- generation timestamp and fourteen consecutive Eastern dates
- a trusted official source manifest
- top-level facilities with catalog IDs, names, provenance, access restrictions, applicable schedule periods, and per-date resolved states
- nested Dodge spaces with independent provenance and per-date availability
- upcoming known modifications within the fourteen-day window
- explicit unresolved conflicts or unavailable-current-schedule states

Intervals use normalized 24-hour `HH:MM` values. The validator rejects:

- missing required top-level facilities or Dodge spaces
- unexpected or duplicate catalog IDs
- date gaps or incorrect ordering
- malformed, overlapping, or unsafe intervals
- untrusted source domains
- unsafe or unbounded status and reason text
- a pool state that violates Dodge parent closure constraints
- room availability copied from Dodge without room-specific provenance
- snapshots that do not cover the complete fourteen-day window

## Frontend hydration and fallback

Embedded top-level schedules render before live requests. `assets/recreation-hours.js` requests `/api/recreation-hours`, validates the complete snapshot again in the browser, applies all Recreation updates atomically, and rerenders.

The Dodge space dropdown is populated only from validated room-specific live data. It does not receive invented embedded subspace hours. If current room information is unavailable, its explicit unavailable status is shown.

A Recreation footer status reports live, stale, fallback, or verification-needed data. Data older than eight hours is marked stale. Network, API, schema, or hydration failures preserve the embedded top-level schedules and clearly mark them as fallback data.

## Failure policy

- A Playwright failure or interactive challenge fails the job without publishing.
- Failure to obtain every required current facility and nested-space state rejects the snapshot unless the state explicitly records that no separate current schedule was published.
- Invalid or partial uploads never replace the last valid Redis snapshot.
- The API returns an uninitialized response until the first valid snapshot is seeded.
- Conflicts are surfaced, not silently resolved with guesses.
- Library and dining data remain unaffected by every Recreation failure mode.

## Testing and verification

Automated tests cover:

- current and seasonal schedule selection by effective date
- modified-hours and closure overrides
- source-priority conflict resolution
- ordinary, split, closed-day, and reservation-only schedules
- Dodge maintenance inheritance by Uris Pool
- independent pool maintenance and swim sessions
- room-specific event, class, practice, and reservation restrictions
- absence of a room-specific schedule without Dodge-hour inheritance
- access restrictions remaining separate from intervals
- outdated schedule rejection and unresolved-conflict states
- schema, API authentication, Redis, and last-known-good behavior
- independent GitHub Actions scheduling and publishing gates
- atomic frontend hydration, Dodge dropdown rendering, stale state, and embedded fallback behavior

Final verification includes headed Playwright smoke tests against the current Columbia Recreation pages and read-only checks of official Barnard sources. The generated snapshot is schema-validated locally before any production seeding.
