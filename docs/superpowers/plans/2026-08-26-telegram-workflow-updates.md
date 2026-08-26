# LionTime Telegram workflow updates — implementation plan

> **For implementation:** Follow this plan step by step. Do not add the bot token or chat ID to tracked files; configure them as repository secrets after the code is ready.

**Goal:** Send one Telegram message from the existing Hermes bot after every completed Library, Dining, Recreation, and Student Life GitHub Actions run, including failures and manually dispatched runs.

**Architecture:** Each scraper job writes a concise, sanitized notification summary as a job output. A separate reusable GitHub Actions workflow receives that output using an `always()` caller job and posts it directly to the Telegram Bot API. This is intentionally separate from the local Hermes gateway, so it works while the Mac is off.

**Non-goals:** Do not change the site publishing contracts, scrape scheduling, bot configuration, or unrelated configured Hermes plugins. Do not expose or commit credentials.

---

## 1. Add a pure notification-summary formatter and tests

**Files:**

- Create: `scripts/workflow-notification-summary.mjs`
- Create: `tests/workflow-notification-summary.test.mjs`

**Implementation:**

1. Write a Node CLI that accepts `--kind`, `--input`, and `--publish-enabled`.
2. Read only the validated JSON snapshot already produced by the matching scraper.
3. Produce a single plain-text summary suitable for Telegram, in the established wording:
   - Library: update timestamp and live/fallback library counts when available.
   - Dining: update timestamp, live location count, and embedded-schedule fallback count.
   - Recreation: update timestamp and live facility count.
   - Student Life: update timestamp and live source count.
4. When publishing is disabled, make the message say the data was validated and publication is disabled; do not claim the public site was updated.
5. Validate unknown kinds, missing files, and malformed snapshots with a non-zero exit and a safe error message. Never include secrets or raw request headers.
6. In GitHub Actions, write the resulting text as the `summary` value in `$GITHUB_OUTPUT` with the multiline-safe delimiter syntax.

**Tests:**

1. Add fixtures inline in the test file for every supported snapshot kind.
2. Assert timestamps and counts are rendered correctly, including fallback counts.
3. Assert the disabled-publication message is distinct from an update message.
4. Assert invalid arguments or invalid JSON fail cleanly.

**Verification command:**

```bash
node --test tests/workflow-notification-summary.test.mjs
```

## 2. Add a minimal reusable Telegram sender workflow

**Files:**

- Create: `.github/workflows/send-telegram-update.yml`
- Create: `tests/telegram-notification-workflow.test.mjs`

**Implementation:**

1. Define `on.workflow_call` inputs for the source label, run conclusion, summary, and run URL.
2. Define required called-workflow secrets named `telegram_bot_token` and `telegram_chat_id`; callers map these from repository secrets `LIONTIME_TELEGRAM_BOT_TOKEN` and `LIONTIME_TELEGRAM_CHAT_ID`.
3. Use `permissions: {}` and no checkout, because this workflow needs no repository content.
4. In one GitHub-hosted job, construct the final message:
   - `success`: use the supplied source summary.
   - any other result (failure, cancelled, skipped): identify the source and conclusion, then include the Actions run URL.
5. POST using `curl` to the Telegram Bot API’s `sendMessage` endpoint. Pass text through `--data-urlencode`, use retries, fail on non-2xx responses, and avoid echoing secret values.
6. Keep messages plain text so scraper content cannot introduce formatting errors or unwanted Telegram markup.

**Tests:**

1. Assert the workflow is reusable, declares only the expected inputs/secrets, and has empty permissions.
2. Assert it does not check out code or invoke Hermes.
3. Assert it uses `always()` only in the callers (not inside the reusable workflow), `--data-urlencode`, retries, and failure-safe curl options.
4. Assert failure/cancelled/skipped fallback messaging includes the run URL.

**Verification command:**

```bash
node --test tests/telegram-notification-workflow.test.mjs
```

## 3. Wire Library and Dining workflows to emit and send one result

**Files:**

- Modify: `.github/workflows/update-library-hours.yml`
- Modify: `.github/workflows/update-dining-hours.yml`
- Modify: `tests/library-hours-workflow.test.mjs`
- Modify: `tests/dining-hours-workflow.test.mjs`

**Implementation:**

1. Add `notification_summary` as an output of each existing `scrape-and-publish` job.
2. After each successful validated scrape, run the formatter against its existing `$RUNNER_TEMP` JSON output and expose the resulting value through a named step output.
3. For Library, add Node 22 setup only if necessary for the shared Node formatter; preserve the existing Python scraping setup and publish guard.
4. Add a `notify` job to each workflow with `needs: scrape-and-publish` and `if: ${{ always() }}`.
5. Make `notify` call `./.github/workflows/send-telegram-update.yml`, passing the label, source result, summary output, and current Actions run URL.
6. Map the two Telegram repository secrets only into that reusable workflow call. Do not give the scrape job access to Telegram credentials.
7. Preserve Dining’s `main` branch guard and self-hosted runner requirements. A skipped run should still result in a clear skipped Telegram message.

**Tests:**

1. Extend both contract tests to assert exactly one notifier call per workflow.
2. Assert `always()` is present, the source job output is forwarded, and the source labels are correct.
3. Assert each existing scraper command, schedule, runner selection, and publishing condition remains unchanged.

**Verification command:**

```bash
node --test tests/library-hours-workflow.test.mjs tests/dining-hours-workflow.test.mjs
```

## 4. Wire Recreation and Student Life workflows to emit and send one result

**Files:**

- Modify: `.github/workflows/update-recreation-hours.yml`
- Modify: `.github/workflows/update-student-services-hours.yml`
- Modify: `tests/recreation-hours-workflow.test.mjs`
- Modify: `tests/student-services-hours-workflow.test.mjs`

**Implementation:**

1. Repeat the summary-output pattern for each existing scraper job, using the current `$RUNNER_TEMP` snapshot paths.
2. Add one `notify` job to each workflow that always runs after the existing job and calls the reusable sender.
3. Use labels `Recreation` and `Student Life` and preserve all existing schedules, publish guards, and Node setup steps.
4. Ensure a partial scraper result is reported as the successful summary created from the validated snapshot, while a failed or cancelled run uses the reusable workflow fallback.

**Tests:**

1. Extend workflow contract tests to verify the notifier call and always-run behavior.
2. Verify the original scrape/publish steps are retained verbatim where behavior matters.
3. Verify each workflow exposes the correct snapshot-derived output.

**Verification command:**

```bash
node --test tests/recreation-hours-workflow.test.mjs tests/student-services-hours-workflow.test.mjs
```

## 5. Run repository checks and prepare the private repository secrets

**Files:**

- Modify: `docs/decisions.md` only through the DecisionTracker script, if implementation changes the recorded status.

**Implementation and verification:**

1. Run all relevant test files together and inspect the final workflow YAML changes.
2. Run `git diff --check` and `git status --short`; preserve unrelated user changes, including the existing `assets/dining-vote.js` edit.
3. Update DEC-0047 through the DecisionTracker workflow to record the implementation state and validation evidence. Do not stage, commit, push, or reset.
4. In the GitHub repository’s **Settings → Secrets and variables → Actions**, add:
   - `LIONTIME_TELEGRAM_BOT_TOKEN`: the token for the existing Hermes Telegram bot.
   - `LIONTIME_TELEGRAM_CHAT_ID`: the existing private chat/channel ID.
5. Manually dispatch each of the four update workflows once. Confirm exactly one Telegram message arrives after every run, including one deliberately safe skipped/cancelled-path test if practical.
6. Commit only if separately authorized by the user. A suitable commit message would be `feat: send LionTime workflow updates to Telegram`.

**Verification commands:**

```bash
node --test tests/workflow-notification-summary.test.mjs tests/telegram-notification-workflow.test.mjs tests/library-hours-workflow.test.mjs tests/dining-hours-workflow.test.mjs tests/recreation-hours-workflow.test.mjs tests/student-services-hours-workflow.test.mjs
git diff --check
git status --short
```

## Expected end state

- Every completed scheduled or manually dispatched run creates one Telegram notification from the existing bot.
- Success messages describe the validated result without falsely implying a disabled publication was public.
- Failure, cancellation, and skip messages include a direct link to the GitHub Actions run.
- GitHub holds only the two necessary Telegram secrets; no bot credential is committed, printed, or routed through the Mac-based Hermes gateway.
