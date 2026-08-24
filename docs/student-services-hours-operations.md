# Student Life hours operations

## Scope and source policy

The independent Student Life pipeline owns ten cards and four official source boundaries:

| Source | Cards |
| --- | --- |
| Lerner Hall | Alfred Lerner Hall |
| Columbia Bookstore | Columbia University Bookstore |
| Columbia Mail | Student Mail Center |
| Columbia Health | Alice! Health Promotion; CAPS; Disability Services; Medical Services; Sexual Violence Response; Student Health Insurance; Immunization Compliance |

Only the URLs in `lib/student-services-hours-catalog.js` are entry points. Lerner uses the recurring hours on its homepage and exact-date events from the “Lerner Hall Operating Hours” Google Calendar iframe directly embedded by that page; calendar events override the recurring baseline. Mail uses its named seasonal periods and exact holiday closures, with exact closures taking precedence. Health records are mapped service by service and use only the Morningside location where a service lists several campuses. The Bookstore parser uses the visible `STORE HOURS` block on the official Columbia B&N page and validates the Columbia name, 2922 Broadway address, and Lerner Hall location.

Do not bypass a CAPTCHA or managed challenge. Do not use third-party Bookstore hours, guess an access mode, copy hours between Health services, or weaken the exact source and venue identities. A missing or changed source becomes a sanitized failed attempt.

## Availability and status semantics

Each source resolves a 14-day Eastern-time horizon. Access context stays separate from temporal state:

- `Open Access`, `Office Hours`, `Drop-In`, `Appointment Only`, `Virtual Only`, or `Phone Support` appears in the secondary badge.
- `Open`, `Closing soon`, `Closed`, or `Needs verification` appears in the primary badge.
- Any currently active published availability counts as open. The access badge explains the limitation; for example, active phone support is `Phone Support` + `Open`.

Data at most 8 hours old is live. Data older than 8 hours and no older than 24 hours is stale. Data older than 24 hours is `Needs verification`. A failed refresh retains only that source's last successful data; it never replaces sibling sources.

## Storage and publication

The API stores one validated snapshot at Redis key `lionhour:student-services-hours:v1`. Every PUT contains exactly four source attempts. Successful attempts must contain every venue owned by that source; failed attempts contain no venues and one bounded failure code. The server validates the entire attempt batch, merges each source independently, validates the merged snapshot, then performs one Redis write. Never make manual partial Redis writes.

Runtime environment variables:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `LIBRARY_HOURS_UPDATE_SECRET` (shared authenticated update secret)

GitHub repository variables:

- `STUDENT_SERVICES_HOURS_PUBLISH_ENABLED=true`
- `STUDENT_SERVICES_HOURS_API_URL=https://www.lionhour.com/api/student-services-hours`

The scheduled workflow runs at minute 57 every four hours. With publication disabled it still tests and scrapes, but does not PUT. Its JSON artifact contains no raw HTML or exception stacks.

## First activation

1. Deploy the API, client, ten embedded fallback cards, and Redis configuration together.
2. Confirm an uninitialized GET returns 503 with `Cache-Control: no-store`.
3. Leave `STUDENT_SERVICES_HOURS_PUBLISH_ENABLED` unset or false and manually run the workflow.
4. Inspect only its four sanitized source result summaries. Resolve any parser failure without weakening provenance.
5. Set the API URL and enable publication, then manually run the workflow again.
6. Confirm GET returns 200, four source records, and exact venue ownership. All four `lastSuccessAt` values must be non-null before calling the feature fully live.
7. Verify the footer count, Open-now behavior, access badges, details, and no horizontal overflow at 320, 375, 390, 430, 768, and 1440 pixels.

Partial initialization is expected and safe: initialized sources hydrate; uninitialized cards keep embedded fallback and require verification. Source-by-source activation does not require manual storage edits.

## Routine verification and incidents

For routine checks, run the focused Student Life tests and a headed scrape, validate that the batch has four attempts and at least one success, then inspect the public API metadata. A source failure should affect only its owned cards. Investigate `challenge`, `navigation`, `missing-content`, `parse`, or `ambiguous` results at the official page. Do not log or persist raw pages.

If publication itself is unhealthy, set `STUDENT_SERVICES_HOURS_PUBLISH_ENABLED=false` first. This stops writes without affecting Library, Dining, Recreation, the last stored snapshot, or embedded fallback cards.

## Rollback

- Client regression: roll back the Student Life client/view assets and `index.html` integration; embedded schedules remain available.
- One parser regression: leave the other three sources active. The affected source retains last-known-good data until the 24-hour cutoff, then shows `Needs verification`.
- API or merge regression: disable publication and roll back the API, service, schema, and store together. Do not edit the Redis value manually.
- Invalid first seed: keep publication disabled. The API returns 422 without replacing storage.

Never roll back by weakening source allowlists, venue completeness, provenance, access-mode, date-window, freshness, or exact-key validation.
