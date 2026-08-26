# Telegram workflow updates design

## Goal

Send one Telegram update after every completed LionHour Library, Dining,
Recreation, and Student Life workflow run. Delivery is direct from GitHub
Actions to the existing Hermes Telegram bot and chat, so it is independent of
the local Hermes gateway and the user's MacBook power state.

## Delivery contract

- All scheduled and manually dispatched runs notify after completion.
- Successful runs report the workflow name, the time of the completed update,
  and the real live/fallback summary represented by the workflow's validated
  output.
- A successful partial or retained-source result remains a success message and
  states its degraded coverage; it is not relabeled as a workflow failure.
- A failed or cancelled run sends the workflow name, conclusion, and a direct
  GitHub Actions run URL. It does not claim that any data was published.
- One completed workflow run produces at most one Telegram notification.

## Architecture

Each existing update workflow will expose a sanitized notification summary as a
job output after its validated scrape and, when enabled, publication path.
An `always()` notification job then invokes one reusable local workflow. The
reusable workflow performs the sole Telegram Bot API request using a
GitHub-hosted runner and no checkout.

The reusable workflow receives only non-sensitive text inputs: source label,
workflow conclusion, summary when available, and run URL. It has no repository
write permission. It receives the following repository secrets only at the
send boundary:

- `LIONTIME_TELEGRAM_BOT_TOKEN`
- `LIONTIME_TELEGRAM_CHAT_ID`

The existing Hermes bot token is intentionally reused, but GitHub does not call
the Hermes gateway or obtain any Hermes-local configuration.

## Failure handling

If an update job fails before generating its summary, the notification job
sends a failure/cancelled alert with the run URL. If Telegram rejects the
request, the notification job fails visibly without changing any published
hours snapshot. Secrets are never printed.

## Verification

Automated tests will assert that all four workflows notify on every completion,
that notification jobs run even after a failed dependency, that success and
failure payload paths are distinct, that the reusable notifier has minimal
permissions and no checkout, and that only the two dedicated Telegram secrets
are referenced.

Manual rollout verification will add the two repository secrets, dispatch one
workflow, confirm exactly one Telegram update, and confirm a forced notifier
failure does not alter a published snapshot.
