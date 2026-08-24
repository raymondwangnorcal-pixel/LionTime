# Dining Challenge Grace and Live Verification Plan

## Goal

Give ordinary browser verification one bounded opportunity to finish and make the Dining workflow fail visibly unless the published API actually exposes all four Barnard venues.

## Preconditions

- `/Users/raymondwang/PersonalProjects/LionTime/.github/workflows/update-dining-hours.yml` continues to run only on schedule or manual dispatch with `contents: read`.
- `DINING_HOURS_PUBLISH_ENABLED`, `DINING_HOURS_API_URL`, and `LIBRARY_HOURS_UPDATE_SECRET` remain configured in GitHub.
- No self-hosted runner is required for this first-stage change.

## Steps

### Step 1 — Specify bounded passive challenge behavior

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-scraper.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/scripts/dining-hours-scraper.mjs`

Update the challenge regression test so one simulated `403` clears during a 12,000 ms browser wait and is parsed successfully, while a second simulated `403` remains challenged and is never parsed. In `navigateToSource`, wait exactly once for 12,000 ms after recognizing a managed challenge, then inspect the live page without treating the original response status as current. Preserve `failure (challenge)` when the challenge remains.

**Verify:**

```sh
node --test tests/dining-hours-scraper.test.mjs
```

Expected: every Dining scraper test passes, including both challenge-clearance branches.

### Step 2 — Verify the public Barnard publication contract

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/scripts/verify-live-barnard-dining.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/verify-live-barnard-dining.test.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/.github/workflows/update-dining-hours.yml`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-workflow.test.mjs`

Create a Node verifier that fetches `DINING_HOURS_API_URL` with a cache-busting query, validates the complete Dining snapshot, requires schema version 4, and requires `hewitt`, `diana-center-cafe`, `barnard-bubble-tea-sushi`, and `lizs-place`. Retry validation up to three times at five-second intervals. Run it after the configured publish step under the same publish-enabled condition.

**Verify:**

```sh
node --test tests/verify-live-barnard-dining.test.mjs tests/dining-hours-workflow.test.mjs
```

Expected: snapshot acceptance, rejection, retry, and workflow wiring tests all pass.

### Step 3 — Align operations guidance and durable decisions

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/docs/dining-hours-operations.md`
- `/Users/raymondwang/PersonalProjects/LionTime/docs/decisions.md`

Document the one-time passive challenge grace period and the post-publish Barnard contract check. Record the user-approved reliability policy through the decision ledger workflow, superseding the immediate-failure policy while retaining independent source evidence and no-bypass constraints.

**Verify:**

```sh
python3 /Users/raymondwang/.agents/skills/decisiontracker/scripts/validate_ledger.py validate-ledger --repo /Users/raymondwang/PersonalProjects/LionTime --input /Users/raymondwang/PersonalProjects/LionTime/docs/decisions.md
```

Expected: the decision ledger validates.

### Step 4 — Run regression checks

**Verify:**

```sh
node --test tests/dining-hours-*.test.mjs tests/verify-live-barnard-dining.test.mjs
git diff --check
```

Expected: all Dining tests pass and Git reports no whitespace errors.

## Rollback

Before commit, restore only the files listed above with `git restore <absolute-file-path>` after confirming they contain no unrelated user changes. No production state is modified by this implementation alone; publication still requires a commit, push, deployment, and workflow run.
