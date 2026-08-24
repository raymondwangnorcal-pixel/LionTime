# Live Café East Hours Implementation Plan

## Goal

Move Café East from an embedded schedule to independently retained live hours parsed from the official Lerner Hall Café East page, while preserving compatibility with existing Dining snapshots and retained four-source state.

## Pre-conditions

- [x] Repository root is `/Users/raymondwang/PersonalProjects/LionTime`.
- [x] `git status --short` is empty before implementation.
- [x] The official source `https://lernerhall.columbia.edu/content/cafe-east` identifies Café East, location 2E, and publishes weekday and weekend operating ranges.
- [x] Joe Coffee's official campus pages do not publish regular operating hours, and its holiday page does not attach exceptions to a verifiable year; Joe schedules therefore remain embedded.

## Steps

### Step 1 — Specify and test official Café East parsing

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/lib/cafe-east-parser.js`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/fixtures/cafe-east-live.txt`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/cafe-east-parser.test.mjs`

Create a pure parser that requires the exact official identity markers `Café East`, `Open to the public during building hours`, and `Location: 2E`; parses one Monday–Friday range and one Saturday–Sunday range; normalizes 12-hour times to `HH:MM`; and returns this bounded payload shape:

```js
{
  id: 'cafe-east',
  name: 'Café East',
  location: 'Lerner Hall, Room 2E',
  weekdays: {
    0: [['11:00', '19:30']],
    1: [['10:30', '19:30']],
    2: [['10:30', '19:30']],
    3: [['10:30', '19:30']],
    4: [['10:30', '19:30']],
    5: [['10:30', '19:30']],
    6: [['11:00', '19:30']]
  }
}
```

Tests must accept the sanitized official fixture and reject missing identity, missing weekday coverage, malformed time ranges, and reversed intervals.

**Verify:** `node --test tests/cafe-east-parser.test.mjs` → all parser tests pass.

### Step 2 — Add Café East as a fifth retained Dining source

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/lib/dining-hours-schema.js`
- `/Users/raymondwang/PersonalProjects/LionTime/lib/dining-hours-source-schema.js`
- `/Users/raymondwang/PersonalProjects/LionTime/scripts/dining-hours-scraper.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-scraper.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-source-schema.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/helpers/dining-hours-fixture.mjs`

Add `cafe-east` with source URL `https://lernerhall.columbia.edu/content/cafe-east` after the four existing source IDs. The headed browser must navigate to that exact HTTPS host and path, reject redirects, managed challenges, HTTP errors, missing `main` content, and parser errors as a bounded per-source failure. Attempt-batch schema version 2 must require five ordered source attempts and validate the exact Café East payload. Retained-state schema version 2 must require five ordered source records while continuing to validate legacy schema-version-1 four-source state during migration.

**Verify:** `node --test tests/dining-hours-scraper.test.mjs tests/dining-hours-source-schema.test.mjs` → all source acquisition and validation tests pass, including fifth-source failure isolation.

### Step 3 — Resolve Café East into a backward-compatible public snapshot

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/lib/dining-hours-resolver.js`
- `/Users/raymondwang/PersonalProjects/LionTime/lib/dining-hours-service.js`
- `/Users/raymondwang/PersonalProjects/LionTime/lib/dining-hours-schema.js`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-resolver.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-schema.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-service.test.mjs`

Resolve the recurring seven-day Café East payload across the same fourteen-date window as the Dining feed and append a `cafe-east` location whose day provenance is `cafe-east`. Emit public snapshot schema version 3 with five source definitions and seventeen locations. Continue accepting public schema versions 1 and 2 and internal retained-state schema version 1 so deployment can serve the existing snapshot until Café East initializes. A failed Café East attempt must retain its last success, and an uninitialized Café East source must preserve the existing public snapshot.

**Verify:** `node --test tests/dining-hours-resolver.test.mjs tests/dining-hours-schema.test.mjs tests/dining-hours-service.test.mjs` → all resolver, migration, and retention tests pass.

### Step 4 — Hydrate Café East and report three embedded Joe cafés

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/assets/dining-hours.js`
- `/Users/raymondwang/PersonalProjects/LionTime/index.html`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-client.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/header-controls.test.mjs`

Teach the browser client to accept schema version 3, overlay the sixteen displayed live venues including Café East, safely ignore the trusted Robert F. Smith source record after that card's concurrent removal, and leave only `joe-noco`, `joe-journalism`, and `joe-dodge` embedded. Change the footer summary to `16 of 19 live; 3 Joe’s cafés using embedded schedules`. Preserve schema-version-1 and schema-version-2 hydration during migration.

**Verify:** `node --test tests/dining-hours-client.test.mjs tests/header-controls.test.mjs` → client overlay and footer assertions pass.

### Step 5 — Document and record the source-policy decision

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/docs/dining-hours-operations.md`
- `/Users/raymondwang/PersonalProjects/LionTime/docs/decisions.md`

Document five independent official Dining-hour sources, schema-version-1/2/3 compatibility, sixteen displayed live locations, three embedded Joe cafés, and the reason Joe holiday exceptions are not automated without dated official evidence. Append one decision record through the decisiontracker validator; do not rewrite prior decisions.

**Verify:**

- `python3 /Users/raymondwang/.agents/skills/decisiontracker/scripts/validate_ledger.py validate-ledger --input /Users/raymondwang/PersonalProjects/LionTime/docs/decisions.md` → ledger valid.
- `python3 /Users/raymondwang/.agents/skills/decisiontracker/scripts/validate_ledger.py validate-ledger --repo /Users/raymondwang/PersonalProjects/LionTime --input /Users/raymondwang/PersonalProjects/LionTime/docs/decisions.md` → full Git audit valid.

### Step 6 — Run complete verification

**Files:** all files modified above.

Run:

```sh
node --test tests/dining-hours-*.test.mjs tests/header-controls.test.mjs
npm test
git diff --check
```

Expected results: all Dining and header tests pass; the full suite has no new failures; `git diff --check` prints no output.

## Rollback

No external state, Redis data, workflow run, commit, push, or deployment is authorized by this plan. Before publication, rollback consists of reverting only the files listed above. After publication, schema-version-1/2 compatibility allows the prior public snapshot to remain readable while the fifth source is uninitialized or failing.
