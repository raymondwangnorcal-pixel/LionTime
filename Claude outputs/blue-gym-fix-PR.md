## fix(recreation): read Blue Gym's renamed calendar; let the hours audit report what it finds

### What broke

The "Audit published hours" workflow has failed on every run since #5 (about 30 hours). The finding was `recreation / blue-gym — unresolved: no hours on any of the 14 published days`, but the log showed only "Process completed with exit code 1" and the Telegram message was empty.

### Two causes

**1. Columbia renamed the Blue Gym calendar.** On 2026-09-14 the Google Calendar embedded under the Blue Gym tab on perec.columbia.edu/hours-operation went from `University Hall (Blue) Gym` to `University Hall (Blue) Gym Open Recreation`, and events are now titled by activity ("Basketball - Open Recreation", "Volleyball - Open Recreation"). `parseActivityCalendar` rejects the entire payload if any event's calendar name doesn't exactly match, so Blue Gym resolved to nothing while the scrape run stayed green — the same failure shape as Uris Pool last week.

Fix: `ACTIVITY_CALENDARS` now carries `calendarNames`, a list of every name Columbia has published a calendar under. The guard still rejects any other calendar. A new fixture (`recreation-blue-gym-calendar-fall-2026.txt`) in the current style is covered by a new parser test.

**2. The audit step swallowed its own summary.** GitHub runs `run:` steps under `bash -e`. The audit script exits 1 whenever it has findings, which aborted the step at `summary="$(node …)"` before `echo "$summary"` and the `GITHUB_OUTPUT` write. Fix: `set +e` at the top of the step.

### Verification

- `node --test tests/recreation-*.test.mjs tests/hours-audit*.test.mjs` — 148 pass, 0 fail (includes the new test).
- Full `npm test`: 435 pass, 8 fail — the same 8 fail on untouched `main` (4 need a Chromium build not present in my sandbox; 4 are `scrape-manifest-workflow.test.mjs` assertions about an `upload-artifact` step that already fail on `main` and are unrelated to this change — worth a look separately).
- Reproduced the `bash -e` behaviour locally: before the fix the summary is never printed; after, it prints and the step still exits 1.

Once merged, the next scheduled recreation scrape (`update-recreation-hours`) should publish Blue Gym hours, and the following audit run (every 6h at :07) should go green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_012e1pVwyo7oDHUQcp4dWBoX
