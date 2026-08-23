# Project Decisions

## DEC-0001 — Prioritize live availability in the campus mockup

- Date: 2026-08-16
- Owner: shared
- Status at record: active
- Decision: The campus mockup groups the all-category view by live availability and gives every card one next-action time summary before its daily and weekly hours.
- Rationale: Students should be able to determine whether a place is usable now or when it next opens with one quick scan.
- Scope: `mockup-campus.html` and its focused regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0002 — Minimize campus mockup scan noise

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: The campus mockup omits duration countdowns and duplicate status chrome, keeps caveats inside expanded weekly schedules, and excludes Wallach Art Gallery and Dodge Membership Office from the catalog.
- Rationale: The default view should make status, next time, and today's hours readable with minimal distraction.
- Scope: `mockup-campus.html` and its focused regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0003 — Provide feedback and About controls in the mockup header

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: The campus mockup header exposes the supplied Google Form through a Feedback link and an inline About disclosure with the user-provided project description.
- Rationale: Visitors need a lightweight way to send feedback and understand the project's purpose without adding page clutter.
- Scope: `mockup-campus.html` and its focused regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0004 — Treat expanded About content as a temporary overlay

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: The expanded About content is displayed above page content and closes on scrolling or a press outside the disclosure.
- Rationale: The description should be easy to inspect without blocking the availability list or remaining open after the visitor changes context.
- Scope: `mockup-campus.html` and its focused regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0005 — Use the rounded crown logo as the mockup favicon

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: The campus mockup uses the supplied crown logo as a project-local RGBA PNG favicon with rounded corners and transparent corner pixels.
- Rationale: The favicon should carry the requested visual identity while remaining legible in a browser tab.
- Scope: `assets/lionhour-favicon.png`, `mockup-campus.html`, and the favicon regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0006 — Stack split operating intervals in the mockup

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: A place's multiple operating intervals for the same day are displayed on separate lines in both card and weekly schedule views.
- Rationale: Split schedules such as Ferris Booth Commons are more readable without comma-separated time ranges.
- Scope: `mockup-campus.html` and its Ferris rendering regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0007 — Combine static rendering with dynamic library hours

- Date: 2026-08-20
- Owner: user
- Status at record: active
- Decision: LionHour will retain its static frontend and embedded fallback schedules while adding a dynamic library-hours data path refreshed by GitHub Actions every four hours.
- Rationale: This preserves the current site's speed and failure resilience while providing fresher library hours without requiring Vercel Pro cron scheduling.
- Scope: Library-hours scraping, scheduled delivery, server-side snapshot storage, the public hours API, and the Libraries section data overlay.
- Implementation: pending
- Recorded against HEAD: `81ddc708ed7d37dc9b9394ba5e5ddb3d538c5adf`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md` and `docs/superpowers/plans/2026-08-20-hybrid-library-hours.md`
- Privacy waivers: none

## DEC-0008 — Restrict dynamic overnight library intervals

- Date: 2026-08-20
- Owner: agent
- Status at record: active
- Decision: Dynamic overnight-style intervals are publishable only for Butler; a close time at or before opening for another displayed library rejects the entire snapshot.
- Rationale: Columbia's live Lehman page listed 9:00 PM to 5:00 PM on August 20, 2026, which would otherwise become a misleading twenty-hour overnight window instead of preserving the latest known-good data.
- Scope: Python snapshot validation, shared API validation, browser overlay validation, tests, and library-hours source policy.
- Implementation: pending
- Recorded against HEAD: `ddc63b89b6e310ab63b9750b6be336711894379b`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md` and the live-source verification documented by the implementation tests.
- Privacy waivers: none

## DEC-0009 — Use embedded fallback for the Lehman source anomaly

- Date: 2026-08-20
- Owner: user
- Status at record: active
- Decision: When Columbia publishes Lehman's known unapproved overnight interval, the snapshot retains embedded Lehman hours while applying validated dynamic schedules to the other five libraries.
- Rationale: This keeps fresh trustworthy hours flowing without interpreting the source inversion as a twenty-hour opening or guessing a corrected Lehman time.
- Scope: Scraper output, schema and API validation, browser overlay behavior, freshness status, tests, and library-hours source policy.
- Implementation: pending
- Recorded against HEAD: `deadaf21a7a835e5fdbee564bf3e94281437810f`
- Supersedes: DEC-0008
- Evidence: `docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md` and live scraper verification on 2026-08-20.
- Privacy waivers: none

## Update — 2026-08-20 — DEC-0008

- Type: supersession
- Implementation commit: not applicable
- Superseded by: DEC-0009
- Note: The all-or-nothing rejection policy is replaced by a narrow explicit Lehman fallback; raw unapproved overnight intervals remain invalid.
- Privacy waivers: none

## DEC-0010 — Preserve unmatched cafés as static fallbacks

- Date: 2026-08-20
- Owner: user
- Status at record: active
- Decision: LionHour will mirror every current Columbia Dining location with live data while retaining Joe's NoCo, Café East, Joe's Journalism, and Joe's Dodge as static fallback cards.
- Rationale: The live catalog should track Columbia's current feed without removing four existing café listings that remain useful to LionHour visitors.
- Scope: Dining and café catalog membership, source mapping, frontend status labels, and fallback behavior.
- Implementation: pending
- Recorded against HEAD: `3280e4856a89ede45c6eaf93dcc0a7eac5777270`
- Supersedes: none
- Evidence: User-approved dining location policy in the implementation conversation on 2026-08-20.
- Privacy waivers: none

## DEC-0011 — Use a browser-backed independent dining pipeline

- Date: 2026-08-21
- Owner: user
- Status at record: active
- Decision: LionHour will use Playwright to read Columbia Dining's structured `dining_nodes` payload and publish a separately validated dining snapshot every four hours through its own API and Redis key.
- Rationale: Columbia's plain HTTP and Drupal endpoints are Cloudflare-challenged, while a separate browser-backed pipeline preserves direct-source fidelity and isolates dining failures from library updates.
- Scope: Dining source acquisition, snapshot schema, GitHub Actions delivery, Vercel API, Redis storage, and failure policy.
- Implementation: pending
- Recorded against HEAD: `3280e4856a89ede45c6eaf93dcc0a7eac5777270`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-21-live-dining-hours-design.md` and user approval on 2026-08-21.
- Privacy waivers: none

## DEC-0012 — Treat structured dining intervals as authoritative

- Date: 2026-08-21
- Owner: user
- Status at record: active
- Decision: LionHour will calculate dining availability from Columbia's structured daily intervals and preserve `displayed_hours` only as descriptive source status, including exact closure messages when no intervals exist.
- Rationale: This mirrors the official day selector without guessing times from prose and still communicates statuses such as Closed for Summer.
- Scope: Dining normalization, schema, client overlay, status rendering, and source-data conflict handling.
- Implementation: pending
- Recorded against HEAD: `3280e4856a89ede45c6eaf93dcc0a7eac5777270`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-21-live-dining-hours-design.md` and user approval on 2026-08-21.
- Privacy waivers: none

## DEC-0013 — Run dining Chromium in a virtual display

- Date: 2026-08-21
- Owner: agent
- Status at record: active
- Decision: The scheduled dining scraper will run headed Playwright Chromium inside `xvfb` instead of using Playwright's headless mode.
- Rationale: Repeated live tests showed that both bundled Chromium and standard Chrome remained on Columbia's managed challenge in headless mode, while fresh headed profiles loaded the official structured payload without interaction.
- Scope: Dining scraper launch configuration, GitHub Actions runtime, live verification, and operational documentation.
- Implementation: pending
- Recorded against HEAD: `619c0eb34e1115b653529bf9f9a9eba467bb9fed`
- Supersedes: none
- Evidence: Live Columbia Dining smoke tests on 2026-08-21 and `docs/superpowers/specs/2026-08-21-live-dining-hours-design.md`.
- Privacy waivers: none

## Update — 2026-08-21 — DEC-0013

- Type: implementation
- Implementation commit: `e68996b96ee1e600329db046fe180c41daa2e07b` — fix: run dining scraper in headed Chromium
- Superseded by: none
- Note: Headed Chromium under xvfb now retrieves and validates the official structured payload in live verification.
- Privacy waivers: none

## Update — 2026-08-21 — DEC-0010

- Type: implementation
- Implementation commit: `619c0eb34e1115b653529bf9f9a9eba467bb9fed` — feat: overlay live dining hours in frontend
- Superseded by: none
- Note: The client now overlays all sixteen matched locations while retaining the four unmatched café cards as embedded fallbacks.
- Privacy waivers: none

## Update — 2026-08-21 — DEC-0011

- Type: implementation
- Implementation commit: `c78ed77b7ae4fe2dd98295a5251a044d30954416` — feat: publish dining hours independently
- Superseded by: none
- Note: The separate Playwright, API, Redis, and scheduled publishing path is now implemented independently of library updates.
- Privacy waivers: none

## Update — 2026-08-21 — DEC-0012

- Type: implementation
- Implementation commit: `e62c9e4a67be52ca2a0419e9aa08d65a2485a2d8` — feat: normalize Columbia dining hours
- Superseded by: none
- Note: Structured daily intervals now drive availability while descriptive and exact closure statuses are preserved.
- Privacy waivers: none

## DEC-0014 — Use an independent recreation-hours pipeline

- Date: 2026-08-21
- Owner: user
- Status at record: active
- Decision: LionHour will publish Dodge Fitness Center and Uris Pool through a separate browser-backed recreation-hours pipeline, with Uris Pool inheriting Dodge closures while retaining its own hours and independent maintenance closures.
- Rationale: Recreation data needs source-specific acquisition and parent-facility rules without coupling failures to library or dining updates.
- Scope: Recreation source acquisition, snapshot schema, scheduled publishing, Vercel API, Redis storage, frontend overlay, maintenance statuses, and fallback behavior.
- Implementation: pending
- Recorded against HEAD: `f04e58586c4e2f53995850967b0bbbe927dadee8`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-21-live-recreation-hours-design.md` and user approval on 2026-08-21.
- Privacy waivers: none

## DEC-0015 — Expand Recreation coverage and prioritize specific official notices

- Date: 2026-08-21
- Owner: user
- Status at record: active
- Decision: LionHour will cover Dodge, its five independently scheduled spaces, Uris Pool, Barnard Fitness Center, and explicitly confirmed student-accessible facilities while resolving official sources by specificity, effective date, and modification priority without inventing missing hours.
- Rationale: Building-wide schedules alone can misrepresent room, pool, event, seasonal, maintenance, reservation, and access availability.
- Scope: Recreation catalog, source policy, seasonal resolution, modified-hours handling, nested Dodge UI, Barnard access, conflict states, and validation.
- Implementation: pending
- Recorded against HEAD: `00766b89ed75cced738839bff33751adc1475a86`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-21-live-recreation-hours-design.md`, `docs/superpowers/plans/2026-08-21-live-recreation-hours.md`, and user approval on 2026-08-21.
- Privacy waivers: none

## Update — 2026-08-21 — DEC-0014

- Type: implementation
- Implementation commit: `1c62328f6555bdf985c44d437aa11be2a972f3ee` — feat: show live recreation spaces
- Superseded by: none
- Note: This completion commit makes the independent browser scraper, scheduled publisher, API and Redis path, guarded frontend hydration, and parent-aware Recreation interface reachable together.
- Privacy waivers: none

## Update — 2026-08-21 — DEC-0015

- Type: implementation
- Implementation commit: `1c62328f6555bdf985c44d437aa11be2a972f3ee` — feat: show live recreation spaces
- Superseded by: none
- Note: This completion commit makes the fixed facility hierarchy, source-priority resolver, five nested Dodge spaces, Barnard access policy, explicit conflict states, and no-guessing interface reachable together.
- Privacy waivers: none

## DEC-0016 — Fail closed on incomplete recreation evidence

- Date: 2026-08-22
- Owner: agent
- Status at record: active
- Decision: Recreation snapshots will represent timed restrictions separately from operating intervals, require target-specific evidence identity, reject partially parsed known-target notices, and publish unbounded seasonal schedules only as verification-unavailable states.
- Rationale: Partial or ambiguous official-source interpretation can silently invent availability or omit a higher-priority closure, so completeness and provenance must be validated before publication.
- Scope: Recreation acquisition, parsing, resolution, snapshot schema, server and client validation, status rendering, and deployment migration policy.
- Implementation: recorded in update event below
- Recorded against HEAD: `37069f9d5ad2bc83ca9b79714caeea41bfa4bddc`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-21-live-recreation-hours-design.md`, `.superpowers/sdd/2026-08-21-live-recreation-hours/final-review.md`, and the approved final repair review.
- Privacy waivers: none

## Update — 2026-08-22 — DEC-0016

- Type: implementation
- Implementation commit: `37069f9d5ad2bc83ca9b79714caeea41bfa4bddc` — fix: reject partial recreation notices
- Superseded by: none
- Note: The completed repair enforces explicit restrictions, exact or unavailable seasonal evidence, target-specific provenance, and all-or-nothing handling of catalog-target modification notices.
- Privacy waivers: none

## DEC-0017 — Replace the Lerner package card with the Student Mail Center

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: The first live Student Life and Services release will replace the outdated Lerner Package Center card with the Student Mail Center at Wien Hall, Lower Level.
- Rationale: The current official Columbia Mail source identifies the student-facing mail facility and its published hours at Wien Hall rather than Lerner Hall.
- Scope: Student Life and Services venue identity, location metadata, live-hours source catalog, scraper mapping, fallback data, tests, and operating documentation.
- Implementation: pending
- Recorded against HEAD: `a55cd12003209b016b088aa7d58b22865063c63a`
- Supersedes: none
- Evidence: User approval during the 2026-08-23 Student Life and Services planning interview and https://mailservices.columbia.edu/content/locations-hours.
- Privacy waivers: none

## DEC-0018 — Represent health-service access modes explicitly

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: Live Student Life and Services cards for Columbia Health will distinguish walk-in, appointment-only, virtual-only, phone-support, and closed availability instead of treating staffed office hours as generic open hours.
- Rationale: The official source publishes materially different access modes, and a generic open badge could mislead students about whether they can receive service in person.
- Scope: Student-services snapshot schema, health-source parser, status resolver, badges and expanded details, accessibility copy, fallback data, and tests.
- Implementation: pending
- Recorded against HEAD: `a55cd12003209b016b088aa7d58b22865063c63a`
- Supersedes: none
- Evidence: User approval during the 2026-08-23 Student Life and Services planning interview and https://www.health.columbia.edu/content/hours-and-locations.
- Privacy waivers: none

## DEC-0019 — Isolate Student Life source failures

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: The live Student Life and Services pipeline will publish successful source updates independently while retaining the last known-good data and a visible stale or verification state for any failed source.
- Rationale: A failure in one unrelated source, especially the external Bookstore storefront, should not prevent fresher official Lerner, Mail Center, or Columbia Health schedules from reaching users.
- Scope: Source acquisition, per-source snapshot metadata, last-known-good merge behavior, API validation, frontend freshness indicators, workflow reporting, and tests.
- Implementation: pending
- Recorded against HEAD: `a55cd12003209b016b088aa7d58b22865063c63a`
- Supersedes: none
- Evidence: User approval during the 2026-08-23 Student Life and Services planning interview.
- Privacy waivers: none

## DEC-0020 — Expand live Columbia Health coverage in v1

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: The first live Student Life and Services release will add Alice! Health Promotion and the Student Health Insurance Office alongside the five Columbia Health services already represented in LionTime.
- Rationale: The shared official Columbia Health source publishes actionable availability for both services, so excluding them would leave useful student-facing hours out of the initial live release.
- Scope: Student Life and Services venue catalog, embedded fallbacks, health-source parsing, live snapshot schema, rendering, navigation counts, tests, and documentation.
- Implementation: pending
- Recorded against HEAD: `a55cd12003209b016b088aa7d58b22865063c63a`
- Supersedes: none
- Evidence: User approval during the 2026-08-23 Student Life and Services planning interview and https://www.health.columbia.edu/content/hours-and-locations.
- Privacy waivers: none

## DEC-0021 — Prioritize dated Lerner calendar exceptions

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: Lerner Hall live hours will use the published weekday schedule as a recurring baseline and apply dated calendar entries as authoritative building-level exceptions, failing to a verification state when an exception is ambiguous.
- Rationale: Lerner identifies its calendar as the most current source and warns that holidays, breaks, and other circumstances can change ordinary building hours.
- Scope: Lerner acquisition and parsing, source-priority resolution, exception schema, verification behavior, tests, and operations documentation.
- Implementation: pending
- Recorded against HEAD: `a55cd12003209b016b088aa7d58b22865063c63a`
- Supersedes: none
- Evidence: User approval during the 2026-08-23 Student Life and Services planning interview and https://lernerhall.columbia.edu/.
- Privacy waivers: none

## DEC-0022 — Restrict Bookstore hours to official sources

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: Columbia Bookstore hours will come only from the official Barnes and Noble storefront or official structured endpoints it calls, using browser-backed acquisition when necessary and never substituting crowd-sourced listings.
- Rationale: Official-source provenance is more important than apparent freshness for student-facing status, and unverified third-party hours could incorrectly report whether the store is open.
- Scope: Bookstore acquisition, source allowlist, provenance validation, fallback behavior, verification status, tests, and operating documentation.
- Implementation: pending
- Recorded against HEAD: `a55cd12003209b016b088aa7d58b22865063c63a`
- Supersedes: none
- Evidence: User approval during the 2026-08-23 Student Life and Services planning interview and https://columbia.bncollege.com/.
- Privacy waivers: none

## DEC-0023 — Use an independent Student Life hours pipeline

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: Live Student Life and Services data will use a dedicated student-services-hours API, Redis namespace, scheduled workflow, and browser hydration client with four source adapters.
- Rationale: Student Life requires access-aware statuses and per-source retention semantics that should remain isolated from the Library, Dining, and Recreation data contracts.
- Scope: API route, snapshot schema and store, scraper orchestration, GitHub Actions workflow, browser client, shared update-secret authentication, Vercel configuration, tests, and operations documentation.
- Implementation: pending
- Recorded against HEAD: `6787e7f6bdf6499397cfb784907bf787105ad359`
- Supersedes: none
- Evidence: User approval during the 2026-08-23 Student Life and Services planning interview.
- Privacy waivers: none

## DEC-0024 — Bound Student Life freshness claims

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: Student Life sources will refresh every four hours over a fourteen-day Eastern-time horizon, remain live through eight hours, display stale through twenty-four hours, and then stop asserting open or closed status while retaining details as needs verification.
- Rationale: Time-bounded status claims preserve utility through short source outages without allowing outdated Health, Mail, Lerner, or Bookstore schedules to appear current indefinitely.
- Scope: Workflow cadence, snapshot dates, per-source freshness calculation, status resolver, open-now counts and filters, detail rendering, cache policy, tests, and operations documentation.
- Implementation: pending
- Recorded against HEAD: `6787e7f6bdf6499397cfb784907bf787105ad359`
- Supersedes: none
- Evidence: User approval during the 2026-08-23 Student Life and Services planning interview.
- Privacy waivers: none

## DEC-0025 — Activate Student Life sources independently

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: Initial production rollout will activate each Student Life source after its first validated publication while uninitialized sources retain embedded fallback data and show needs verification, and the footer will report the number of live sources.
- Rationale: One difficult source should not delay useful verified data for the other cards, while the product must not describe the full feature as live until all four sources have succeeded.
- Scope: Initial seeding, API uninitialized-source representation, browser fallback behavior, footer copy, deployment checks, rollback, tests, and operating documentation.
- Implementation: pending
- Recorded against HEAD: `6787e7f6bdf6499397cfb784907bf787105ad359`
- Supersedes: none
- Evidence: User approval during the 2026-08-23 Student Life and Services planning interview.
- Privacy waivers: none

## DEC-0026 — Keep restricted access out of Open now counts

- Date: 2026-08-23
- Owner: agent
- Status at record: active
- Decision: Student Life cards with only appointment-only, virtual-only, or phone-support availability will not count as open or match the Open now filter, while active walk-in and open-access availability will.
- Rationale: The existing Open now language implies immediate physical access, and counting restricted access would recreate the misleading generic-open behavior the access-aware design is intended to prevent.
- Scope: Current-status resolution, category counts, status filters, badges, accessibility copy, tests, and the Student Life implementation plan.
- Implementation: pending
- Recorded against HEAD: `6787e7f6bdf6499397cfb784907bf787105ad359`
- Supersedes: none
- Evidence: `/Users/raymondwang/PersonalProjects/LionTime/docs/superpowers/plans/2026-08-23-live-student-services-hours.md`.
- Privacy waivers: none
