# Hosted Windows Dining Runner Plan

## Goal

Test the final standard zero-maintenance GitHub-hosted environment for Barnard Dining by running ordinary headed Chromium on Windows while retaining the existing source isolation and production verification gate.

## Preconditions

- `/Users/raymondwang/PersonalProjects/LionTime` is a public repository using standard GitHub-hosted runners without user-owned infrastructure.
- Branch `codex/windows-dining-runner` starts from unchanged `main` commit `99ce0856d38479e43b2e4030097847069671f96c`.
- The Ubuntu and macOS hosted runners have both returned a persistent managed challenge for Barnard.
- Publishing remains non-destructive on source failure because retained evidence and the schema-version-4 production verifier are unchanged.

## Steps

### Step 1 — Specify the hosted Windows workflow contract

**File:** `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-workflow.test.mjs`

Require `runs-on: windows-2025`, Bash as the default run shell, `npx playwright install chromium`, and direct scraper execution. Reject Linux-only system-dependency installation and `xvfb-run`.

**Verify:**

```sh
node --test tests/dining-hours-workflow.test.mjs
```

Expected before the workflow change: the Windows runner assertion fails against `ubuntu-24.04`.

### Step 2 — Run headed Chromium on hosted Windows

**File:** `/Users/raymondwang/PersonalProjects/LionTime/.github/workflows/update-dining-hours.yml`

Set `runs-on: windows-2025` and `defaults.run.shell: bash`, install Chromium without Linux system packages, and invoke the existing headed scraper directly. Preserve the schedule, timeout, publishing secret, public API URL, and Barnard verification step.

**Verify:**

```sh
node --test tests/dining-hours-workflow.test.mjs tests/dining-hours-scraper.test.mjs tests/verify-live-barnard-dining.test.mjs
git diff --check
```

Expected: all selected tests pass and Git reports no whitespace errors.

### Step 3 — Execute the isolated production-safe experiment

Commit as `fix(ci): test Dining browser on hosted Windows`, push `codex/windows-dining-runner`, and dispatch the Dining workflow at that ref.

**Verify:**

```sh
gh run view <dispatched-run-id> --log
```

Acceptance requires `barnard-hours: success`, successful publishing, schema version 4, and all four approved Barnard venue IDs in the public API.

### Step 4 — Promote or reject

Promote the commit to `main` only when the live verifier passes. If Barnard remains challenged, switch back to `main` and leave production scheduling unchanged; the remaining safe autonomous architecture requires a trusted-network runner or an approved publisher feed.

## Rollback

Before promotion, switching to `main` restores the current Ubuntu workflow. After promotion, use a normal revert of the single runner commit rather than rewriting shared history. Failed experiment batches cannot replace the last valid public snapshot.
