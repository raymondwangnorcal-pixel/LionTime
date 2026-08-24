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

## DEC-0027 — Correct the known Lehman meridiem anomaly

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: LionHour will interpret Lehman's exact published 9:00 PM to 5:00 PM anomaly as 9:00 AM to 5:00 PM while preserving source cells marked Closed and retaining the safety fallback for any different unapproved overnight interval.
- Rationale: The official Lehman calendar contains a repeated, apparent AM/PM typo, and the user approved the narrow correction so valid live Lehman hours can replace the embedded schedule without weakening unrelated validation.
- Scope: Lehman library source normalization, scraper output, closed-day handling, fallback behavior, and regression tests.
- Implementation: pending
- Recorded against HEAD: `f46d392eed3c2c0f7da95b9ae59d116b191deb4d`
- Supersedes: DEC-0009
- Evidence: `scrape.py`, `tests/test_scrape.py`, and the user-approved interpretation of the official Lehman hours page on 2026-08-23.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0009

- Type: supersession
- Implementation commit: not applicable
- Superseded by: DEC-0027
- Note: The broad Lehman embedded fallback is replaced by a narrow correction for the exact known meridiem anomaly; other unexpected overnight intervals remain unapproved.
- Privacy waivers: none

## DEC-0028 — Resolve Dining transition and Fall hours from four official sources

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: LionHour Dining will merge Columbia's structured location feed with the official NSOP 2026, Labor Day 2026, and Fall 2026 articles using exact Labor Day venue exceptions first, dated feed periods including closures second, the Fall baseline from September 8 through December 23 third, and Hours not published otherwise; restricted NSOP sessions remain a separate service that never counts a venue as open.
- Rationale: The structured feed does not currently cover the full transition into Fall, while the official articles provide complementary evidence with different location and access specificity that must not be conflated.
- Scope: Dining article acquisition and parsing, evidence resolution, schema version 2 provenance, dual-version API and browser compatibility, restricted-service rendering, open counts and filters, tests, and publication workflow.
- Implementation: pending
- Recorded against HEAD: `9aac577c04e232ab309f29136be892c73f48d7b3`
- Supersedes: none
- Evidence: `docs/superpowers/plans/2026-08-23-dining-transition-and-fall-hours.md`, official Columbia Dining source pages, and the successful live four-source scrape on 2026-08-23.
- Privacy waivers: none

## DEC-0029 — Pair access context with temporal Student Life status

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: Student Life cards will show an access-context badge to the left of a temporal Open, Closing soon, Closed, or Needs verification badge, and any currently active published availability including generic office hours or restricted access will count in Open now because its access limitation remains visible beside the status.
- Rationale: Separating access context from temporal state lets students see that an office, appointment channel, virtual service, drop-in, or phone service is currently available without presenting all availability as unrestricted walk-in access.
- Scope: Student Life access types, status resolution, badges, section counts, Open now and Closing soon filters, expanded details, accessibility copy, tests, and implementation plan interpretation.
- Implementation: pending
- Recorded against HEAD: `ae7253f46593dca17bc3304683c8965ac9d9a89f`
- Supersedes: DEC-0026
- Evidence: User-approved recommendation during the 2026-08-23 Student Life live-hours implementation interview.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0026

- Type: supersession
- Implementation commit: not applicable
- Superseded by: DEC-0029
- Note: Restricted and generic availability may now count as active when an adjacent access-context badge makes the limitation explicit.
- Privacy waivers: none

## DEC-0030 — Parse publisher-controlled rendered Student Life hours

- Date: 2026-08-23
- Owner: shared
- Status at record: active
- Decision: The live Bookstore adapter will parse the identified STORE HOURS block visibly rendered by the official Columbia B&N storefront, and the Lerner adapter will parse the titled Google Calendar iframe directly embedded by Lerner Hall, without bypassing site controls or accepting independently discovered third-party pages.
- Rationale: Live browser verification showed that these are the actual publisher-controlled hour surfaces, while the draft Bookstore JSON shape and same-origin Lerner calendar route are not the formats currently published.
- Scope: Bookstore and Lerner acquisition, provenance validation, parsers, fixtures, live verification, failure isolation, source policy, and operations documentation.
- Implementation: pending
- Recorded against HEAD: `ae7253f46593dca17bc3304683c8965ac9d9a89f`
- Supersedes: none
- Evidence: Official source pages, the successful four-source live scrape on 2026-08-23, and the user's requirement to retain Bookstore tracking only when official live hours are available.
- Privacy waivers: none

## DEC-0031 — Retain Dining evidence independently without bypassing challenges

- Date: 2026-08-23
- Owner: user
- Status at record: active
- Decision: LionHour will publish a bounded attempt result for each official Dining source, treat managed security challenges as immediate source failures without bypassing them, retain each source's last successful normalized evidence independently, and preserve the existing public snapshot during first-run state initialization.
- Rationale: One challenged article should not block fresh data from the other official sources or erase previously validated hours, while Columbia's security controls and the browser-facing snapshot contract must remain intact.
- Scope: Dining browser acquisition, attempt-batch and retained-state schemas, Redis value migration, API resolution and compatibility, workflow logs, tests, and operations guidance.
- Implementation: pending
- Recorded against HEAD: `2eef5c6e3c3a3d8fc3edabf2ee6d4086eb9c6db1`
- Supersedes: none
- Evidence: `docs/superpowers/plans/2026-08-23-dining-source-retention.md` and the user-approved recommended behavior after the 2026-08-23 workflow failure diagnosis.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0017

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Replaces the Lerner Package Center card with the Student Mail Center fallback and live venue mapping.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0018

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Adds access-mode availability records and separate access-context rendering.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0019

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Stores and hydrates the four source records independently with retained last-successful data.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0020

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Adds Alice! Health Promotion and Student Health Insurance as live source venues.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0021

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Uses the official Lerner homepage baseline and directly embedded calendar exceptions.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0022

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Limits Bookstore parsing to verified publisher-controlled rendered hours.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0023

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Adds the dedicated API, Redis namespace, workflow, scraper, and browser client.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0024

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Implements the four-hour refresh, fourteen-day schedule horizon, and freshness states.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0025

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Preserves embedded fallbacks while source freshness and footer counts control live status.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0029

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Renders access context next to the temporal status and counts active published availability.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0030

- Type: implementation
- Implementation commit: `9e8c31e770a65b886a9e0fd16241b102b67e48cc` — Live scraper for Student services
- Superseded by: none
- Note: Uses the directly embedded Lerner calendar and the visible official Bookstore hours block.
- Privacy waivers: none

## Update — 2026-08-23 — DEC-0031

- Type: implementation
- Implementation commit: `442869a7255aeb5d9f0e9a15dd91c3546c8ee7d4` — Dining scraper fix
- Superseded by: none
- Note: Publishes bounded per-source attempts, detects managed challenges before article selectors, and retains last-successful Dining evidence behind the compatible public snapshot.
- Privacy waivers: none

## DEC-0032 — Track Café East live and require dated Joe holiday evidence

- Date: 2026-08-24
- Owner: user
- Status at record: active
- Decision: LionHour will update Café East from Lerner Hall's official Café East page as an independently retained fifth Dining source, keep the three Joe Coffee campus schedules embedded while Joe's official location pages omit operating hours, and never apply Joe holiday exceptions automatically unless the official page identifies a machine-verifiable year or exact dates.
- Rationale: Café East has a current first-party weekly schedule suitable for strict parsing, while Joe's regular-hours pages lack the required data and its undated holiday page could otherwise attach stale exceptions to the wrong year.
- Scope: Dining source acquisition, retained evidence, schema-version-3 public snapshots, migration compatibility, Café East browser hydration, Joe fallback policy, footer counts, tests, and operations guidance.
- Implementation: pending
- Recorded against HEAD: `316db6929c5dde81b5ecc399fdac01c1c8077a5c`
- Supersedes: none
- Evidence: `docs/superpowers/plans/2026-08-24-live-cafe-east-hours.md` and the official Lerner Hall and Joe Coffee source review completed on 2026-08-24.
- Privacy waivers: none

## DEC-0033 — Use Columbia primary hours and Barnard holiday closures for Milstein Library

- Date: 2026-08-24
- Owner: user
- Status at record: active
- Decision: LionHour will display Barnard College Library as Milstein Library, use Columbia Libraries' Barnard location calendar for primary daily hours, and apply exact holiday closures from Barnard Library's official hours page.
- Rationale: The Columbia calendar supplies machine-readable date-specific operating hours, while Barnard's page is the first-party source for named holiday changes and access context.
- Scope: Library venue identity, source acquisition, holiday precedence, snapshot validation, browser hydration, fallback behavior, tests, and library-hours documentation.
- Implementation: pending
- Recorded against HEAD: `143fe219036d527f8f4af8b45e296018062cda76`
- Supersedes: none
- Evidence: `docs/superpowers/plans/2026-08-24-live-milstein-library-hours.md` and the user-approved source links from the 2026-08-24 implementation conversation.
- Privacy waivers: none

## DEC-0034 — Add four Barnard dining venues from Dine On Campus

- Date: 2026-08-24
- Owner: shared
- Status at record: active
- Decision: LionHour will use Barnard's official Dine On Campus Hours of Operation page for date-specific hours and expose Hewitt Dining, Diana Center Cafe, and Bubble Tea & Sushi as Dining venues and Liz's Place as a Cafe. LeFrak Center or LeFrak Byte Kiosk will be excluded, and Barnard Kosher at Hewitt will remain part of Hewitt rather than a separate LionHour venue.
- Rationale: The source publishes first-party, date-specific schedules with closures and split service periods, while the four-card mapping follows the user's product taxonomy and Barnard's own four-location dining list.
- Scope: Barnard Dining source acquisition, venue identity and categories, retained evidence, public snapshot versioning, browser hydration, fallback behavior, tests, and Dining operations guidance.
- Implementation: pending
- Recorded against HEAD: `143fe219036d527f8f4af8b45e296018062cda76`
- Supersedes: none
- Evidence: `docs/superpowers/plans/2026-08-24-live-barnard-dining-hours.md`, Barnard's official Dine On Campus Hours of Operation page, and Barnard's Meal Plan FAQ reviewed on 2026-08-24.
- Privacy waivers: none

## DEC-0035 — Degrade Barnard Dining by source freshness and date coverage

- Date: 2026-08-24
- Owner: shared
- Status at record: active
- Decision: LionHour will preserve Barnard's true retained-success timestamp, warn after eight hours, stop counting the source as live after twenty-four hours, hydrate covered dates individually, accept either two or three complete source weeks, discover target venues independently of table count, and cap Barnard acquisition at seventy-five seconds inside a fifteen-minute workflow.
- Rationale: These rules address the adversarial review's stale-data, structural-fragility, partial-coverage, navigation-race, fixture, and runtime findings without weakening strict target validation or blocking other Dining sources.
- Scope: Barnard Dining source provenance, rendered-page parsing, week navigation, retained coverage, browser hydration, freshness UX, tests, workflow limits, rollout, and operations guidance.
- Implementation: pending
- Recorded against HEAD: `143fe219036d527f8f4af8b45e296018062cda76`
- Supersedes: none
- Evidence: `docs/superpowers/plans/2026-08-24-live-barnard-dining-hours.md` revised after the 2026-08-24 adversarial review and user approval.
- Privacy waivers: none

## DEC-0036 — Allow passive Dining challenge completion and verify live Barnard publication

- Date: 2026-08-24
- Owner: user
- Status at record: active
- Decision: LionHour will give each recognized Dining managed challenge one twelve-second passive grace period in ordinary headed Chromium before recording an isolated source failure, retain last-successful source evidence without bypassing security controls, and fail a configured publish workflow unless the public API validates as schema version 4 with all four approved Barnard Dining venues.
- Rationale: The deployed scraper was classifying Dine On Campus as challenged in roughly one tenth of a second, before ordinary browser verification could finish, while the green workflow status did not prove that users received Barnard hours.
- Scope: Dining browser navigation, challenge failure policy, workflow success criteria, production snapshot verification, tests, and operations guidance.
- Implementation: pending
- Recorded against HEAD: `b86d533cbcbe8016778b463bce7a788a8ee9261f`
- Supersedes: DEC-0031
- Evidence: `docs/superpowers/plans/2026-08-24-dining-challenge-grace-and-live-verification.md` and the user-approved implementation request on 2026-08-24.
- Privacy waivers: none

## Update — 2026-08-24 — DEC-0031

- Type: supersession
- Implementation commit: not applicable
- Superseded by: DEC-0036
- Note: Immediate challenge failure is replaced by one bounded passive grace period and public Barnard verification while source isolation, retained evidence, and the no-bypass policy remain active.
- Privacy waivers: none

## DEC-0037 — Reject automated Dining challenge bypass

- Date: 2026-08-24
- Owner: agent
- Status at record: active
- Decision: LionHour will not integrate CAPTCHA-solving or managed-challenge-bypass services for Dining; autonomous acquisition must use publisher-authorized machine access or an ordinary browser on a trusted network that Dine On Campus accepts.
- Rationale: Fresh hosted GitHub runners on Linux, macOS, and Windows and a Vercel serverless request were challenged or denied, while a solver would deliberately defeat the publisher's access control and add recurring cost, credential exposure, and brittle third-party dependency risk.
- Scope: Barnard and Columbia Dining acquisition architecture, runner selection, source policy, operating cost, credentials, and deployment guidance.
- Implementation: pending
- Recorded against HEAD: `6dfc94877ec9a5920ec8393624fec1100570584a`
- Supersedes: none
- Evidence: `docs/superpowers/plans/2026-08-24-hosted-macos-dining-runner.md`, `docs/superpowers/plans/2026-08-24-hosted-windows-dining-runner.md`, and the fixed Vercel egress probe completed on 2026-08-24.
- Privacy waivers: none

## DEC-0038 — Publish Barnard Dining from a trusted self-hosted runner

- Date: 2026-08-24
- Owner: shared
- Status at record: active
- Decision: LionHour will acquire Barnard Dining in ordinary headed Chromium on a repository-scoped, labeled macOS self-hosted runner kept awake on AC power, and will hydrate the four Barnard cards from a read-only projection of independently retained Barnard evidence instead of waiting for every combined Dining source to initialize.
- Rationale: The trusted-network runner loaded the official Barnard page without interaction while hosted runners were challenged, and the independent projection prevents unrelated challenged Columbia sources from blocking valid Barnard hours or being misrepresented as live.
- Scope: Dining workflow runner selection, local LaunchAgents, power behavior, public API contracts, retained-source projection, browser hydration, production verification, security boundaries, tests, and operations guidance.
- Implementation: recorded in update event below
- Recorded against HEAD: `058e4b945645f31b0505fa5b8fb5db083b2ab553`
- Supersedes: DEC-0036
- Evidence: `docs/superpowers/plans/2026-08-24-self-hosted-dining-runner.md` and successful production workflow run `32756463733` on 2026-08-24.
- Privacy waivers: none

## Update — 2026-08-24 — DEC-0036

- Type: supersession
- Implementation commit: not applicable
- Superseded by: DEC-0038
- Note: The passive challenge grace and retained-source isolation remain, but the hosted schema-version-4 publication gate is replaced by trusted-network acquisition and an independently validated Barnard projection.
- Privacy waivers: none

## Update — 2026-08-24 — DEC-0037

- Type: implementation
- Implementation commit: `5b8be351384a5cfa637198dff76343a8c96dfa2e` — fix(ci): run Dining on trusted Mac
- Superseded by: none
- Note: The repository-scoped labeled runner and AC-only keep-awake service implement autonomous ordinary-browser acquisition without a solver or managed-challenge bypass.
- Privacy waivers: none

## Update — 2026-08-24 — DEC-0038

- Type: implementation
- Implementation commit: `058e4b945645f31b0505fa5b8fb5db083b2ab553` — feat(dining): publish Barnard hours independently
- Superseded by: none
- Note: The completion commit adds the validated read-only Barnard projection, independent client overlay, deployment contract, verifier, tests, and operating documentation on top of the trusted runner.
- Privacy waivers: none

## DEC-0039 — Use Blue Gym availability as bounded Dodge fallback evidence

- Date: 2026-08-24
- Owner: user
- Status at record: active
- Decision: When official embedded calendar evidence shows Blue Gym open, LionHour will treat Dodge Fitness Center as open for that interval; otherwise it will prefer dated Dodge building hours and use the calendar's bounded daily envelope only as a lower-priority fallback that fails to verification when ambiguous.
- Rationale: Blue Gym cannot be open while its parent building is closed, and the publisher-embedded calendar supplies date-specific events that can prevent unnecessary verification without overriding direct building schedules or guessing through calendar gaps.
- Scope: Recreation calendar acquisition, source parsing, resolver priority, provenance validation, tests, scheduled publishing, and Dodge and Blue Gym frontend hours.
- Implementation: pending
- Recorded against HEAD: `37e56830f4d0a14b44b1a9b625ee9306a551cdbf`
- Supersedes: none
- Evidence: The official Columbia Recreation Hours of Operation page and the user-approved source rule in the 2026-08-24 implementation conversation.
- Privacy waivers: none

## Update — 2026-08-24 — DEC-0039

- Type: implementation
- Implementation commit: `5f881a599c54bd40abea89c30aa52ca1ba9b7b53` — fix(recreation): derive Dodge fallback from Blue Gym
- Superseded by: none
- Note: The Recreation scraper now captures three stabilized weeks from the publisher-embedded Blue Gym calendar, publishes Blue Gym open-recreation intervals, uses the daily calendar envelope as a lower-priority Dodge fallback, and preserves dated building schedules and explicit closures as stronger evidence.
- Privacy waivers: none

## DEC-0040 — Scrape every official Dodge activity-space calendar

- Date: 2026-08-24
- Owner: user
- Status at record: active
- Decision: LionHour will independently scrape the official embedded calendars for Blue Gym, Levien Gymnasium, Aerobics Room 4, and Functional Fitness Studio, while Squash Courts remains booking-only and only Blue Gym supplies fallback evidence for Dodge building hours.
- Rationale: The publisher provides room-specific schedules and closures in four separate Google Calendar embeds, so treating three of those rooms as unpublished loses available official evidence and mislabels their current state.
- Scope: Recreation calendar discovery, acquisition isolation, event identity validation, open and closure parsing, resolver evidence, tests, scheduled publishing, and the four Dodge activity-space rows.
- Implementation: pending
- Recorded against HEAD: `bf90fbe61cffc1804627acd1e9af1cef212f0a73`
- Supersedes: none
- Evidence: The official Columbia Recreation Hours of Operation page and the user's 2026-08-24 request to scrape the other activity-space calendars.
- Privacy waivers: none

## Update — 2026-08-24 — DEC-0040

- Type: implementation
- Implementation commit: `b828b482fbe91485a9705c8be238c5548b405161` — fix(recreation): scrape all activity calendars
- Superseded by: none
- Note: The Recreation scraper now acquires and validates the four official activity-space calendars independently, publishes each room's open or explicit closure state, and reserves Dodge fallback evidence for Blue Gym alone.
- Privacy waivers: none

## DEC-0041 — Exclude Squash Courts from LionHour

- Date: 2026-08-24
- Owner: user
- Status at record: active
- Decision: LionHour will omit Squash Courts from the Recreation catalog and Dodge activity-space interface while continuing to publish the four official calendar-backed activity spaces and using only Blue Gym for Dodge fallback evidence.
- Rationale: Squash Courts currently has only a reservation portal rather than published hours, so displaying it as an item adds an unhelpful permanent unavailable state.
- Scope: Recreation catalog identity, snapshot schema, source parsing, embedded fallback data, client hydration, UI counts, tests, operations documentation, scheduled publishing, and the live Dodge space list.
- Implementation: pending
- Recorded against HEAD: `5d53f387aee594f27027c5af9a69fca7a2b7d0c2`
- Supersedes: DEC-0040
- Evidence: The user's 2026-08-24 request to remove Squash Courts as an item for now.
- Privacy waivers: none

## Update — 2026-08-24 — DEC-0040

- Type: supersession
- Implementation commit: not applicable
- Superseded by: DEC-0041
- Note: The four calendar-backed activity spaces remain live, but the booking-only Squash Courts row is removed from the product catalog and interface.
- Privacy waivers: none

## DEC-0042 — Hide Squash Courts without removing its data path

- Date: 2026-08-24
- Owner: user
- Status at record: active
- Decision: LionHour will continue parsing, validating, storing, and hydrating Squash Courts as a booking-only Dodge space but will filter it out of the visible Dodge activity-space list for now.
- Rationale: Preserving the underlying identity and parsing path keeps future published-hours support available, while hiding the permanent booking-only state removes an unhelpful row from the current interface.
- Scope: Recreation client presentation filtering, visible space counts, tests, operations documentation, and the live Dodge activity-space list; backend acquisition, parsing, schema, and API data remain unchanged.
- Implementation: pending
- Recorded against HEAD: `5d53f387aee594f27027c5af9a69fca7a2b7d0c2`
- Supersedes: DEC-0041
- Evidence: The user's 2026-08-24 clarification to retain Squash Courts parsing and remove only its visible row.
- Privacy waivers: none

## Update — 2026-08-24 — DEC-0041

- Type: supersession
- Implementation commit: not applicable
- Superseded by: DEC-0042
- Note: Removing Squash Courts from the catalog and data contract is replaced by presentation-only filtering that preserves all underlying logic.
- Privacy waivers: none

## Update — 2026-08-24 — DEC-0042

- Type: implementation
- Implementation commit: `749eef5067dac64852045b8b21483d1ed929c357` — fix(recreation): hide Squash Courts row
- Superseded by: none
- Note: The client continues strict validation of the five-space Recreation snapshot and filters only Squash Courts before building the visible Dodge activity-space list and verification state.
- Privacy waivers: none
