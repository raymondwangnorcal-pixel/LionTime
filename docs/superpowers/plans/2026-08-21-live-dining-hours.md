# Live Dining Hours Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Playwright-backed live Columbia Dining hours for all current source locations while retaining four unmatched cafés as static fallbacks.

**Architecture:** A dedicated Playwright scraper reads the page's structured `window.dining_nodes` payload and normalizes a 14-day snapshot. A separate validated Vercel API and Redis key store the snapshot, and a guarded browser client atomically overlays the first seven days onto the static-first venue catalog.

**Tech Stack:** Node.js 22, Playwright Chromium, Vercel Functions, Upstash Redis, GitHub Actions, Node test runner

**Spec:** `docs/superpowers/specs/2026-08-21-live-dining-hours-design.md`

## Global Constraints

- Read `window.dining_nodes`; do not scrape rendered dining cards.
- Do not bypass an interactive CAPTCHA or persist browser cookies.
- Publish exactly 16 mapped official locations for 14 consecutive Eastern dates.
- Preserve the four unmatched cafés as static fallback cards.
- Reuse `LIBRARY_HOURS_UPDATE_SECRET`; do not add or expose credentials.
- Never replace Redis with an incomplete or invalid snapshot.
- Keep library and dining workflows independent.

---

### Task 1: Pure dining payload normalizer

**Files:**
- Create: `scripts/dining-hours-scraper.mjs`
- Create: `tests/fixtures/dining-nodes.json`
- Create: `tests/dining-hours-scraper.test.mjs`

**Interfaces:**
- Produces: `parseDiningNodes(raw: string): unknown`
- Produces: `buildDiningSnapshot(dataset: unknown, generated: Date): DiningSnapshot`
- Produces: `DINING_LOCATION_MAP`

- [ ] **Step 1: Write failing parser tests** for all 16 mappings, a 14-day inclusive window, active-period selection, excluded dates, split intervals, overnight intervals, and `Closed for Summer` preservation using a minimal representative fixture.
- [ ] **Step 2: Run `node --test tests/dining-hours-scraper.test.mjs`** and confirm failure because the module does not exist.
- [ ] **Step 3: Implement the pure parser and normalizer** with explicit shape checks, Eastern date helpers, `HH:MM` normalization, source-ID mapping, and deterministic location order.
- [ ] **Step 4: Run `node --test tests/dining-hours-scraper.test.mjs`** and confirm all focused tests pass.

### Task 2: Playwright command-line acquisition

**Files:**
- Modify: `scripts/dining-hours-scraper.mjs`
- Modify: `package.json`
- Modify: `package-lock.json`
- Test: `tests/dining-hours-scraper.test.mjs`

**Interfaces:**
- Produces: `scrapeDiningHours({ outputPath, now, chromiumImpl }): Promise<DiningSnapshot>`
- CLI: `node scripts/dining-hours-scraper.mjs --json-out <path>`

- [ ] **Step 1: Add failing dependency-injection and CLI argument tests** proving the scraper waits for and evaluates `window.dining_nodes`, closes Chromium in `finally`, and rejects a missing output path.
- [ ] **Step 2: Run the focused test** and confirm the new acquisition tests fail.
- [ ] **Step 3: Add Playwright as a development dependency** and implement browser launch, navigation, structured-global extraction, snapshot normalization, JSON output, and guaranteed cleanup.
- [ ] **Step 4: Run the focused test** and confirm the acquisition tests pass without launching a real browser.

### Task 3: Snapshot schema, store, and service

**Files:**
- Create: `lib/dining-hours-schema.js`
- Create: `lib/dining-hours-store.js`
- Create: `lib/dining-hours-service.js`
- Create: `tests/helpers/dining-hours-fixture.mjs`
- Create: `tests/dining-hours-schema.test.mjs`
- Create: `tests/dining-hours-service.test.mjs`

**Interfaces:**
- Produces: `validateDiningHoursSnapshot(value): {ok: true, value} | {ok: false, errors}`
- Produces: `createDiningHoursStore(redis?)`
- Produces: `createDiningHoursService({store, updateSecret, logger?})`

- [ ] **Step 1: Write failing schema and service tests** for the valid contract, missing/extra/mismatched locations, invalid source/date windows/times/statuses, authentication, cache headers, validation rejection, and storage failure.
- [ ] **Step 2: Run `node --test tests/dining-hours-schema.test.mjs tests/dining-hours-service.test.mjs`** and confirm missing-module failures.
- [ ] **Step 3: Implement strict snapshot validation, the `lionhour:dining-hours:v1` store, and service behavior** following the library service's constant-time secret comparison and error policy.
- [ ] **Step 4: Run the focused tests** and confirm they pass.

### Task 4: Vercel API and scheduled workflow

**Files:**
- Create: `api/dining-hours.js`
- Create: `.github/workflows/update-dining-hours.yml`
- Create: `tests/dining-hours-workflow.test.mjs`
- Modify: `vercel.json`

**Interfaces:**
- HTTP: `GET|PUT /api/dining-hours`
- Workflow variables: `DINING_HOURS_PUBLISH_ENABLED`, `DINING_HOURS_API_URL`
- Workflow secret: `LIBRARY_HOURS_UPDATE_SECRET`

- [ ] **Step 1: Write a failing workflow/configuration test** requiring four-hour cadence, manual dispatch, read-only permissions, Playwright browser installation, focused tests, the publish gate, destination variable, and shared secret.
- [ ] **Step 2: Run `node --test tests/dining-hours-workflow.test.mjs`** and confirm failure because the workflow is absent.
- [ ] **Step 3: Implement the thin API handler and independent workflow** with a ten-minute timeout, Chromium installation, temporary JSON output, curl retries, and no repository writes.
- [ ] **Step 4: Run the focused workflow and service tests** and confirm they pass.

### Task 5: Atomic browser overlay and source statuses

**Files:**
- Create: `assets/dining-hours.js`
- Create: `tests/dining-hours-client.test.mjs`
- Modify: `index.html`
- Modify: `tests/header-controls.test.mjs`

**Interfaces:**
- Produces in browser: `LionHourDiningHours.buildUpdates(snapshot, venues, today)`
- Produces in browser: `LionHourDiningHours.hydrate({venues, fetchImpl, render, setStatus, today, now})`

- [ ] **Step 1: Write failing client tests** for atomic 16-location updates, preservation of unrelated/static venues, seven-date mapping, split intervals, live/stale/partial/fallback status, and closure-label propagation.
- [ ] **Step 2: Run the client tests** and confirm failure because the client asset and new cards/status element are absent.
- [ ] **Step 3: Implement guarded client validation and hydration**, add Faculty House 4th Floor and Robert F. Smith embedded cards, load the asset after static markup, expose the dining provenance status, and teach status/today/week rendering to display source closure and note text.
- [ ] **Step 4: Run the focused client/header tests** and confirm they pass.

### Task 6: Full verification and operational documentation

**Files:**
- Modify: `README.md` if present, otherwise create `docs/dining-hours-operations.md`
- Modify: `docs/decisions.md` only through the decision-tracker validator

**Interfaces:**
- Operational setup: Vercel Redis plus two GitHub variables and the existing shared secret

- [ ] **Step 1: Document exact deployment variables, manual seeding, failure behavior, and live smoke-test commands.**
- [ ] **Step 2: Run `npm test` and `python -m unittest tests/test_scrape.py -v`.**
- [ ] **Step 3: Run `git diff --check` and inspect `git status --short`.**
- [ ] **Step 4: Run the live scraper to a temporary path and validate the resulting snapshot without publishing.**
- [ ] **Step 5: Reconcile the approved dining decisions with the implementation state through the decision tracker.**

