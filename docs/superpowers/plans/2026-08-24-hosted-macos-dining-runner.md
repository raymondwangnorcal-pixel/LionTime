# Hosted macOS Dining Runner Plan

## Goal

Keep Barnard Dining fully autonomous without a user-owned machine by running the existing ordinary headed browser on GitHub's standard hosted macOS runner and retaining the production API verification gate.

## Preconditions

- `/Users/raymondwang/PersonalProjects/LionTime` is a public GitHub repository, so standard GitHub-hosted runners do not require a user-managed runner or repository billing setup.
- Branch `codex/macos-dining-runner` starts at committed and pushed `main` commit `99ce0856d38479e43b2e4030097847069671f96c`.
- The workflow remains limited to scheduled and manual triggers with `contents: read`.
- The existing API URL, publish-enable variable, and update secret remain unchanged.

## Steps

### Step 1 — Specify the hosted macOS workflow contract

**File:** `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-workflow.test.mjs`

Require `runs-on: macos-15`, `npx playwright install chromium`, and direct execution of `node scripts/dining-hours-scraper.mjs --json-out`. Reject Linux-only `--with-deps` and `xvfb-run`. Preserve assertions for the four-hour schedule, least-privilege permissions, publishing gate, and live Barnard verification.

**Verify:**

```sh
node --test tests/dining-hours-workflow.test.mjs
```

Expected before the workflow change: the new runner assertions fail against `ubuntu-24.04` and `xvfb-run`.

### Step 2 — Move the browser job to hosted macOS

**File:** `/Users/raymondwang/PersonalProjects/LionTime/.github/workflows/update-dining-hours.yml`

Set `runs-on: macos-15`, install Chromium without Linux system dependencies, and invoke the headed Playwright scraper directly. Do not alter source parsing, publishing credentials, the retained-state API, or the post-publish verifier.

**Verify:**

```sh
node --test tests/dining-hours-workflow.test.mjs tests/dining-hours-scraper.test.mjs tests/verify-live-barnard-dining.test.mjs
git diff --check
```

Expected: all selected tests pass and Git reports no whitespace errors.

### Step 3 — Run the isolated live experiment

Commit the branch as `fix(ci): run Dining browser on hosted macOS`, push `codex/macos-dining-runner`, and manually dispatch `update-dining-hours.yml` at that ref. The workflow's existing production verifier is the acceptance gate.

**Verify:**

```sh
gh run view <dispatched-run-id> --log
```

Expected: `barnard-hours: success`, publish succeeds, live verification confirms schema version 4, and `https://lionhour.com/api/dining-hours` contains `hewitt`, `diana-center-cafe`, `barnard-bubble-tea-sushi`, and `lizs-place`.

### Step 4 — Promote only a successful experiment

If Step 3 passes, fast-forward `main` to the tested commit and push `main`. If it fails, leave `main` unchanged, switch back to `main`, and retain the branch only as diagnostic evidence until the next hosted option is selected.

## Rollback

Before promotion, switching back to `main` restores the production workflow definition. After promotion, revert the single runner commit with a normal Git revert; do not rewrite shared history. Production source failures remain non-destructive because the API retains last-successful evidence and the verifier rejects an unchanged legacy snapshot.
