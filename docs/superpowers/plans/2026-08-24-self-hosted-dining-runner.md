# Self-hosted Dining runner implementation plan

## Goal

Run LionHour's four-hour Dining acquisition autonomously in an ordinary headed browser on the trusted network already proven to reach Dine On Campus, without CAPTCHA solving or a new hosted service.

## Pre-conditions

- [x] `/Users/raymondwang/PersonalProjects/LionTime` is linked to the public repository `raymondwangnorcal-pixel/LionTime` with default branch `main`.
- [x] The repository has no existing self-hosted runners.
- [x] The host is Apple Silicon macOS (`uname -m` returns `arm64`) with an active Aqua login session.
- [x] GitHub CLI authentication can administer repository runners.
- [x] The current official runner asset is `actions-runner-osx-arm64-2.336.0.tar.gz` with SHA-256 `8e8839c49b7060b6b2154f4931f815df330c27f167d53ef2239ee3dfce28b079`.
- [x] LionHour's GitHub Actions secret and Dining variables already publish through the production API.

## Steps

### Step 1 — Lock Dining execution to the trusted runner

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/.github/workflows/update-dining-hours.yml`
- `/Users/raymondwang/PersonalProjects/LionTime/tests/dining-hours-workflow.test.mjs`

Set the job guard and runner selector to:

```yaml
if: github.repository == 'raymondwangnorcal-pixel/LionTime' && github.ref == 'refs/heads/main'
runs-on: [self-hosted, macOS, ARM64, lionhour-dining]
```

Install the macOS Chromium bundle with `npx playwright install chromium` and invoke the headed scraper directly, without `xvfb`. Add regression assertions for the exact repository/ref guard, all four runner labels, the absence of pull-request triggers, and the direct scraper command.

**Verify:** `node --test tests/dining-hours-workflow.test.mjs` must report all tests passing.

### Step 2 — Add an idempotent macOS runner installer

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/scripts/install-dining-runner-macos.sh`
- `/Users/raymondwang/PersonalProjects/LionTime/.gitignore`

The installer must verify Darwin arm64, download and checksum GitHub Actions runner `2.336.0`, register repository runner `lionhour-dining-mac` with label `lionhour-dining`, install its user LaunchAgent service, and install `com.lionhour.dining-keep-awake` running `/usr/bin/caffeinate -s`. Store runner credentials and work data only under ignored `/Users/raymondwang/PersonalProjects/LionTime/.github-runner/`.

**Verify:** `bash -n scripts/install-dining-runner-macos.sh` exits successfully, the package checksum passes, both `launchctl print gui/501/actions.runner.raymondwangnorcal-pixel-LionTime.lionhour-dining-mac` and `launchctl print gui/501/com.lionhour.dining-keep-awake` succeed, and GitHub lists an online runner with the required labels.

### Step 3 — Document operations and rollback

**File:** `/Users/raymondwang/PersonalProjects/LionTime/docs/dining-hours-operations.md`

Document that the Dining job depends on this Mac being logged in, connected, and on AC power; record service inspection commands, manual recovery commands, runner-directory ownership, and exact rollback steps for stopping the services and removing the repository runner.

**Verify:** `rg -n "lionhour-dining|caffeinate|self-hosted" docs/dining-hours-operations.md` returns the operational instructions.

### Step 4 — Install and verify the host services

Run `/Users/raymondwang/PersonalProjects/LionTime/scripts/install-dining-runner-macos.sh`. The script obtains a short-lived registration token through the authenticated GitHub CLI and never prints or persists that token. It installs two user LaunchAgents: the GitHub runner and the AC-only keep-awake process.

**Verify:**

```bash
launchctl print gui/501/com.lionhour.dining-keep-awake
gh api repos/raymondwangnorcal-pixel/LionTime/actions/runners
```

Expected: the keep-awake process is running and `lionhour-dining-mac` is online with `self-hosted`, `macOS`, `ARM64`, and `lionhour-dining` labels.

### Step 5 — Publish from the trusted runner

Commit as `fix(ci): run Dining on trusted Mac`, push the branch, merge it to `main`, and dispatch `Update dining hours` on `main`.

**Verify:** the source collection log reports `barnard-hours: success`, the PUT step succeeds, and the retained Dining source state contains the new Barnard success even if the legacy combined snapshot cannot yet migrate.

### Step 6 — Expose retained Barnard evidence independently

**Files:**

- `/Users/raymondwang/PersonalProjects/LionTime/lib/barnard-dining-hours-schema.js`
- `/Users/raymondwang/PersonalProjects/LionTime/lib/barnard-dining-hours-service.js`
- `/Users/raymondwang/PersonalProjects/LionTime/api/barnard-dining-hours.js`
- `/Users/raymondwang/PersonalProjects/LionTime/assets/dining-hours.js`
- `/Users/raymondwang/PersonalProjects/LionTime/scripts/verify-live-barnard-dining.mjs`
- `/Users/raymondwang/PersonalProjects/LionTime/vercel.json`
- Focused schema, service, client, verifier, and Vercel configuration tests

The existing combined Dining API intentionally retains its legacy public snapshot until every enhancement source has initialized. Add a read-only `/api/barnard-dining-hours` projection over the already validated retained `barnard-hours` source. Return only schema version 1, the official source URL, true retained-success timestamp, exact source coverage, and the four approved venues. Hydrate that endpoint independently after the ordinary Dining snapshot, so a valid Barnard response replaces only the four embedded Barnard cards and does not claim that challenged Columbia article or Café East sources are live.

**Verify:**

```bash
gh workflow run update-dining-hours.yml --ref main
node scripts/verify-live-barnard-dining.mjs
```

Expected: the workflow succeeds, `/api/barnard-dining-hours` validates with current retained evidence, and it includes Hewitt Dining, Diana Center Cafe, Bubble Tea & Sushi, and Liz's Place.

## Rollback

1. Change `update-dining-hours.yml` back to `runs-on: ubuntu-24.04`, restore `xvfb-run`, and push after confirming an alternate acquisition route exists.
2. From `/Users/raymondwang/PersonalProjects/LionTime/.github-runner`, run `./svc.sh stop` and `./svc.sh uninstall`.
3. Obtain a short-lived removal token with `gh api --method POST repos/raymondwangnorcal-pixel/LionTime/actions/runners/remove-token --jq .token` and pass it to `./config.sh remove --token` without logging it.
4. Run `launchctl bootout gui/501 /Users/raymondwang/Library/LaunchAgents/com.lionhour.dining-keep-awake.plist` and delete only that plist.
5. Delete `/Users/raymondwang/PersonalProjects/LionTime/.github-runner/` only after GitHub confirms the runner is removed.
