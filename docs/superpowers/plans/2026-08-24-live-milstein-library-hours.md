# Live Milstein Library Hours Implementation Plan

## Goal

Add a `Milstein Library` card to LionHour whose ordinary daily hours come from Columbia Libraries' Barnard calendar and whose exact holiday closures come from Barnard Library's official hours page.

## Pre-conditions

- [x] Repository root is `/Users/raymondwang/PersonalProjects/LionTime`: `git rev-parse --show-toplevel` prints that path.
- [x] The primary source is public HTML at `https://hours.library.columbia.edu/locations/barnard` and exposes ISO-dated calendar cells.
- [x] The holiday source is public HTML at `https://library.barnard.edu/visit/hours` and publishes a year-bounded `Upcoming Holidays and Library Closures` table.
- [x] Existing unrelated work is preserved: `git status --short` lists only the user-owned untracked `docs/BarnardPlus.md` before this plan.

## Steps

### Step 1 — Define the Milstein source and venue identities

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/scrape.py`
- `/Users/raymondwang/PersonalProjects/LionTime/lib/library-hours-schema.js`
- `/Users/raymondwang/PersonalProjects/LionTime/assets/library-hours.js`
- `/Users/raymondwang/PersonalProjects/LionTime/index.html`

Use this exact identity mapping:

```text
scraper id: barnard
Columbia source slug: barnard
LionHour venue id: milstein
LionHour display name: Milstein Library
primary source: https://hours.library.columbia.edu/locations/barnard
holiday source: https://library.barnard.edu/visit/hours
```

The embedded card must use `ALL(null)` plus a verification status so a first-run or failed live request does not present a seasonal schedule outside its effective dates or mislabel the venue as closed. Its note must say that live hours load from the official schedule and that CU/BC ID swipe is required. Successful hydration clears the verification status before rendering live intervals.

**Verify:** `node --test tests/header-controls.test.mjs tests/library-hours-client.test.mjs tests/library-hours-schema.test.mjs` exits `0` after the implementation.

### Step 2 — Parse only exact, year-bounded Barnard holiday closures

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/scrape.py`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/barnard-library-holidays.html`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/test_scrape.py`

Add a holiday parser with this contract:

```python
def extract_barnard_holiday_closures(
    soup: BeautifulSoup,
    reference_date: datetime,
) -> set[str]:
    """Return exact ISO closure dates from Barnard's year-bounded holiday table."""
```

The parser must locate the `Upcoming Holidays and Library Closures` heading, derive the year from the closest preceding schedule heading, require a holiday table, parse rows such as `Monday, September 7`, verify that the published weekday matches the computed date, and reject missing, ambiguous, or malformed evidence with `ScheduleParseError`.

For `barnard` only, fetch both sources. Apply exact holiday closures after parsing the Columbia calendar and before converting dated hours into weekly schedules. A holiday source fetch or parse failure must make the Milstein entry unpublishable; the existing atomic publisher then retains the prior complete snapshot.

**Verify:** `python3 -m unittest tests/test_scrape.py -v` exits `0` and includes passing cases for a holiday closure overriding a primary open interval and malformed holiday evidence failing closed.

### Step 3 — Extend validation and browser hydration atomically

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/lib/library-hours-schema.js`
- `/Users/raymondwang/PersonalProjects/LionTime/assets/library-hours.js`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/helpers/library-hours-fixture.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/library-hours-schema.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/library-hours-client.test.mjs`

Require exactly seven library records. The `barnard` record must use the Columbia primary URL and must carry `holidayUrl: "https://library.barnard.edu/visit/hours"`; no other record may carry `holidayUrl`. Map `barnard` to `milstein` in the browser and preserve the all-or-nothing preflight behavior before mutating any venue.

Replace the hard-coded partial status copy with values from `updatedCount` and `totalCount`, so a Lehman fallback reports `6 of 7 live`.

**Verify:** `node --test tests/library-hours-client.test.mjs tests/library-hours-schema.test.mjs tests/header-controls.test.mjs` exits `0`.

### Step 4 — Verify the complete change and document the source policy

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/docs/decisions.md`
- `/Users/raymondwang/PersonalProjects/LionTime/docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md`

Record the user-owned source decision before implementation and leave it pending until a future commit can be verified. Update the library design document from six to seven venues, name both Milstein sources, describe exact holiday-closure precedence, and document the fail-closed behavior when holiday evidence cannot be validated.

Run:

```sh
python3 -m unittest tests/test_scrape.py -v
node --test tests/library-hours-schema.test.mjs tests/library-hours-service.test.mjs tests/library-hours-client.test.mjs tests/library-hours-workflow.test.mjs tests/header-controls.test.mjs
npm test
git diff --check
python3 /Users/raymondwang/.agents/skills/decisiontracker/scripts/validate_ledger.py validate-ledger --input /Users/raymondwang/PersonalProjects/LionTime/docs/decisions.md
python3 /Users/raymondwang/.agents/skills/decisiontracker/scripts/validate_ledger.py validate-ledger --repo /Users/raymondwang/PersonalProjects/LionTime --input /Users/raymondwang/PersonalProjects/LionTime/docs/decisions.md
```

Expected focused result: every listed Python and Node library test passes. Report any unrelated pre-existing full-suite failures separately.

## Rollback

No database migration, deployment, workflow dispatch, or external write is part of this change. Before commit, rollback consists of reverting only the Milstein-specific hunks and deleting only `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/barnard-library-holidays.html` and this plan; preserve `/Users/raymondwang/PersonalProjects/LionTime/docs/BarnardPlus.md` and all unrelated user changes.

## Commit checkpoint

If the user later authorizes a commit, use:

```text
feat(libraries): add live Milstein Library hours
```
