# Recreation Hours Operations

## What this pipeline operates

`Update recreation hours` is an independent GitHub Actions workflow. Every four hours at minute 27 it starts headed Playwright Chromium in `xvfb`, reads only the approved official Recreation sources, validates a complete fourteen-day Eastern-time snapshot, and publishes it to the Recreation API. It does not share a scraper, endpoint, Redis key, or workflow with Library or Dining; a Recreation failure must not interrupt either of those pipelines.

Vercel persists a valid snapshot at `lionhour:recreation-hours:v1`. The browser renders embedded top-level schedules first, then atomically overlays live Recreation data only after validating the complete snapshot.

## Required configuration

Configure these Vercel Production environment variables (and Preview too when testing a Preview deployment):

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `LIBRARY_HOURS_UPDATE_SECRET`

`LIBRARY_HOURS_UPDATE_SECRET` is the existing shared publishing secret: it must also exist as the GitHub Actions repository secret with exactly the same value already used by Library and Dining publishing. Do not put that value in repository variables, source code, commands, logs, or documentation.

Under **Settings → Secrets and variables → Actions → Variables**, set these exact repository variables:

- `RECREATION_HOURS_PUBLISH_ENABLED=true`
- `RECREATION_HOURS_API_URL=https://www.lionhour.com/api/recreation-hours`

The workflow deliberately does not publish unless the enabled value is exactly `true` and the API URL is non-empty. It runs on `27 */4 * * *` and also supports manual dispatch. Leave publishing disabled until the API deployment and first read-only scrape have been checked.

## Official source inventory

The allowlisted source manifest contains only these official sources:

| Source | URL | Operational use |
| --- | --- | --- |
| Columbia Recreation Hours of Operation | `https://perec.columbia.edu/hours-operation` | Exact-bounded Dodge/Uris baselines, named Dodge activity spaces, and explicit maintenance notices. An ambiguous seasonal label yields verification, not hours. |
| Columbia Recreation Modified Hours & Closures | `https://perec.columbia.edu/content/modified-hours-closures` | Date-specific, facility-specific, and recurring area restrictions. Unknown catalog targets are ignored; a known recurring target with ambiguous applicability yields verification. |
| Barnard Physical Well-Being / Fitness Center | `https://barnard.edu/lefrak-center/physical-well-being` | Exact-bounded Barnard Fitness Center hours and separate access restrictions. An ambiguous seasonal label yields verification, not hours. |

The fixed published data catalog is exactly these three facilities:

- Dodge Fitness Center
- Uris Pool (an independently scheduled API facility whose open state is constrained by Dodge)
- Barnard Fitness Center

Dodge data carries exactly five nested spaces: Blue Gym, Levien Gymnasium, Functional Fitness Studio, Aerobics Room 4, and Squash Courts. The LionHour interface displays the four calendar-backed activity spaces plus Uris Pool under Dodge's `View spaces` control, filters the booking-only Squash Courts row from view, and renders only Dodge and Barnard as top-level Fitness cards. The Uris schedule is projected from its independent facility record rather than duplicated in the API. Each snapshot must cover fourteen consecutive Eastern dates for every facility and nested data space.

The minimal parser fixtures were sanitized from headed, rendered official pages on August 21, 2026. At that observation:

- Columbia labelled its facility tables `Summer 2026 Facility Hours` without exact effective endpoints, so those table times are retained only as parser-shape evidence and are not published as current hours.
- Columbia explicitly published an annual Dodge maintenance notice from August 17 through the August 24 6 AM reopening. That exact notice is modeled as whole-day closures through August 23 and an August 24 `00:00–06:00` restriction; the parser validates the season year, dates, reopening weekday, and reopening time before emitting it.
- The recurring-closures page named Middle Tri Level, which is outside the fixed catalog. It is deliberately ignored. Every catalog-target `h3` anywhere in the official modifications article is load-bearing: if one cannot be parsed conservatively, the entire source result is rejected even when a sibling notice parsed successfully or the notice sits under an unfamiliar `h2`. The scraper accepts an empty modification result only when the official article/section shape is recognized, at least one notice exists, and no notice heading anywhere in the article maps to a catalog target.
- Four Dodge spaces exposed official calendar embeds but no schedule facts in the acquired DOM, and Squash exposed only a booking link. They publish verification or unavailable semantics, never copied Dodge intervals.
- Barnard labelled its table `Summer 2026` without exact effective endpoints. Its times are not published until the official page supplies exact validated start and end dates; its stated Barnard community access restriction remains independently usable.

Do not add facilities or sources merely because they appear in page text. Squash Courts remains in the underlying catalog and parser as booking-only evidence from the reviewed official portal (`https://recreation.columbia.edu/`), but the client hides it until useful published hours are available. Columbia's `https://perec.columbia.edu/membershipinfo` is excluded from acquisition because it is access policy, not a schedule source. Athletics-only, staff-only, access-unclear, or otherwise unconfirmed facilities are excluded; no other reviewed facility had a published regular undergraduate-access rule suitable for the fixed catalog.

When sources disagree, use the shipped resolver order: date-specific facility closures or modified-hours notices; room-specific availability; current official Recreation schedule; in-range seasonal schedule; general facility page; then a general university directory. A lower-priority normal schedule never overrides a specific closure. Unresolved conflicts must remain `Hours need verification`; no operator may guess an interval or copy Dodge hours to a room with no room-specific schedule.

## Snapshot trust and restriction contract

Every resolved day contains `sourceRefs`, `evidenceRefs`, and `restrictions`. An evidence identity is the exact trusted pair `<official source id>:<catalog target id>`, for example `columbiaHours:blue-gym`. Page-level provenance alone is insufficient: a target publishing intervals must carry its own target-specific identity. A Dodge child may additionally carry `*:dodge` identities only when Dodge constrained that child. Identical independently published schedules remain valid because each target has its own identity.

Timed maintenance and reservation restrictions are not day statuses. `intervals` contains only residual operating intervals; each explicit restriction retains its own windows, status, reason, availability, access restrictions, source references, and evidence identities. A restriction window cannot overlap the residual intervals. Dodge restrictions are clipped to a child's independently supported availability; when a child schedule is unavailable, a known whole-facility restriction is still carried without inventing child hours. The browser derives `Open`, `Closing soon`, or the active restriction label from the current Eastern minute, so a timed notice does not label the venue closed before or after its window.

This is a required-field migration of the existing `v1` payload. A previously stored snapshot without `evidenceRefs` and `restrictions` fails closed in the new browser and leaves embedded schedules visible until a new validated scrape is published. Conversely, the previous browser rejects the new fields as unknown. Deploy the server and browser together, then seed the new snapshot immediately; do not publish the new shape before its browser deployment. The Redis key is unchanged and a valid new `PUT` atomically replaces the prior value.

## First deployment and seed

1. Merge and deploy the Recreation implementation so Vercel serves `https://www.lionhour.com/api/recreation-hours` and has the variables above. For this required-field migration, deploy the new browser/schema before running the first new-format publisher.
2. Before publishing any snapshot, make a read-only `GET` request to that URL. A newly deployed but unseeded endpoint must return `503`, `Cache-Control: no-store`, and `{ "error": "Recreation hours are not initialized" }`.
3. Install local dependencies and Chromium if this runner has not done so:

   ```bash
   npm ci
   npx playwright install chromium
   ```

4. Run the read-only scraper and validate its output before enabling a seed:

   ```bash
   node scripts/recreation-hours-scraper.mjs --json-out /tmp/lionhour-recreation-hours.json
   node -e "import('./lib/recreation-hours-schema.js').then(async ({validateRecreationHoursSnapshot}) => { const fs = await import('node:fs/promises'); const value = JSON.parse(await fs.readFile('/tmp/lionhour-recreation-hours.json', 'utf8')); const result = validateRecreationHoursSnapshot(value); console.log(JSON.stringify({ valid: result.ok, facilities: value.facilities?.length, dodgeSpaces: value.facilities?.find(item => item.id === 'dodge')?.spaces?.length, dates: value.facilities?.[0]?.days?.length, errors: result.errors }, null, 2)); process.exitCode = result.ok ? 0 : 1; })"
   ```

   Success requires `valid: true`, exactly three facilities, exactly five Dodge data spaces, and fourteen dates. The scraper success line identifies the catalog facility count and final covered date.
5. In GitHub, run **Actions → Update recreation hours → Run workflow** on the deployed branch. Confirm that `Scrape validated Recreation hours` succeeds and that `Publish validated snapshot` ran rather than being skipped.
6. Repeat the read-only API `GET`. It must return `200` with exactly the three required facilities, five Dodge data spaces, and fourteen dates per facility. The expanded LionHour view must show five rows—Blue Gym, Levien Gymnasium, Functional Fitness Studio, Aerobics Room 4, and Uris Pool—and must not show Squash Courts. Every day must include `evidenceRefs` and `restrictions`; an empty list is explicit, not an omitted field. The response snapshot has `generated` and `facilities` at its top level; `v1` belongs only to the private Redis key, not the public response. A valid authenticated `PUT` returns `204` with no body; missing or incorrect bearer authentication returns `401`, malformed snapshots return `422`, and other methods return `405` with `Allow: GET, PUT`.
7. Reload LionHour. The Recreation footer should report a live, stale, verification, or embedded-fallback state that reflects the snapshot; it should not imply that every Dodge space is open.

## Routine verification

Run these checks from the repository root before enabling the workflow, after a source-parser change, and after an incident fix:

```bash
npm test
python3 -m unittest tests/test_scrape.py -v
git diff --check
node scripts/recreation-hours-scraper.mjs --json-out /tmp/lionhour-recreation-hours.json
node -e "import('./lib/recreation-hours-schema.js').then(async ({validateRecreationHoursSnapshot}) => { const fs = await import('node:fs/promises'); const value = JSON.parse(await fs.readFile('/tmp/lionhour-recreation-hours.json', 'utf8')); const result = validateRecreationHoursSnapshot(value); console.log(JSON.stringify({ valid: result.ok, facilities: value.facilities?.length, dodgeSpaces: value.facilities?.find(item => item.id === 'dodge')?.spaces?.length, dates: value.facilities?.[0]?.days?.length, errors: result.errors }, null, 2)); process.exitCode = result.ok ? 0 : 1; })"
```

The workflow itself runs the focused Recreation acquisition, parser, resolver, schema, service, scraper, and workflow suites before scraping. It uses a read-only checkout permission, a separate `update-recreation-hours` concurrency group, Node 22, and a twelve-minute timeout.

## Failure, rollback, and visitor-facing states

- Columbia's site may present a managed challenge to direct HTTP or interactive browser sessions. The scraper uses headed Chromium but never attempts to bypass a CAPTCHA. A challenge or missing official content fails the job before writing a local snapshot or publishing it; record the source-specific failure and keep validation strict.
- Missing source evidence, a parser mismatch, missing Dodge/Uris/Barnard evidence, incomplete catalog, invalid target-specific evidence identity, overlapping residual/restriction windows, invalid fourteen-day coverage, or a violated Dodge child constraint rejects the snapshot. Room hours are never inferred from Dodge; an unavailable room remains `Separate hours not published` when that is what the source supports.
- The workflow publishes only a validated file with a bearer secret. A missing secret fails closed; `curl --fail-with-body` retries transient upload failures three times. The API validates again before replacing Redis, so an invalid or partial upload leaves the last known-good snapshot intact.
- The browser keeps embedded facility schedules if its request, response, schema validation, preflight, render, or fallback-status callback fails. Uris Pool's embedded schedule remains available under Dodge even though it is not a top-level card. Live updates are all-or-nothing across Dodge, Uris Pool, and Barnard. A render failure restores the prior embedded model/view; a status-callback failure is reported as degraded rather than discarding an already committed live model/view.
- Footer states are: **live** for a fresh validated snapshot, **stale** when the generated snapshot is older than eight hours, **fallback** when embedded schedules remain after a network/API/schema/hydration failure, and **verification** when official conflicts, `Hours need verification`, or `Separate hours not published` require visitor confirmation. The static fallback copy is `Recreation hours: embedded fallback · Verify before you go`.
- A Dodge closure is inherited by Uris Pool and Dodge spaces; a Dodge maintenance closure is shown as `Closed for maintenance` for those children. Uris maintenance remains independent and Dodge being open never makes Uris or a room open.
- Recreation failure affects neither Library nor Dining data or their scheduled updates.

## Incident response

1. Preserve the current API response and workflow job log; do not manually overwrite Redis with a partial snapshot.
2. Identify the failing official source from the scraper error. For a managed challenge or absent current schedule, leave the last valid snapshot and embedded fallback behavior in place, report the source-specific condition, and retry only after the official source is available.
3. For a parser or schema failure, update fixtures/tests and the parser or resolver; rerun the routine verification commands above. Do not relax the source manifest, date coverage, parent constraints, or room-provenance rules to force publication.
4. For an API configuration failure, verify the exact public API URL, the shared GitHub/Vercel secret value, and Upstash variables without printing credentials. Confirm `503` before the first seed and `200` only after a valid seed.
5. If a deployment regresses client rendering, roll back the deployment or code change. The published Redis snapshot remains a last-known-good value; the client fallback preserves its embedded facility schedules while the issue is repaired.
