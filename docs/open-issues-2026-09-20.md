# LionHour — open issues

> Resolution note (2026-09-21): This is the original review record and several
> claims below were corrected during remediation. In particular, issue 1 was a
> misleading tip-to-tip comparison rather than a merge result; issue 2 was a
> degraded live feed rather than a literally blank page; issue 9's Mac mini
> deadline is 2026-10-10 and was not overdue; issue 10 was an invalid ledger
> edit, not merely stale fields; and issue 11's worktrees were clean and merged,
> not Git-prunable. The implementation branch resolves the actionable work while
> retaining this document as historical evidence.

| # | Resolution status on 2026-09-21 |
|---|---|
| 1 | Resolved: redundant local and remote branch deleted; `main` retained the intended header change. |
| 2 | Resolved: recreation was republished and verified live with Dodge, Uris, and child-space hours. |
| 3 | Resolved: checkout synchronized to current `main`; work continued on current branches. |
| 4 | Resolved by owner: the exposed Gmail app password and old Telegram bot token were rotated outside the repository. |
| 5 | Partially resolved: public branches and the local clone were rewritten; GitHub Support ticket #4776343 requests removal of PR refs #14–#17, while one public fork still requires owner cleanup. |
| 6 | Resolved: outreach docs and mailbox checker committed and merged in PR #17. |
| 7 | Resolved: Cafe East dual-category behavior merged, tested, deployed, and verified live. |
| 8 | Verification pending: manual API publish is green; first post-migration scheduled run has not yet been observed. |
| 9 | Resolved as a correction: DEC-0063's migration date is 2026-10-10; owner chose to keep this Mac until later migration. |
| 10 | Resolved: owner-approved normalization repaired DEC-0071–DEC-0074, the history-independent ledger audit passes, and the trusted writer recorded the outstanding decisions and implementation updates. |
| 11 | Resolved: clean worktrees, merged branches, and the four owner-approved superseded local branches were removed; only `main` and the active reconciliation branch remain locally. |
| 12 | Resolved: scratch artifacts removed, historical notes archived, README and canonical root handoff refreshed. |
| 13 | Resolved: the ruleset requires PRs but grants administrators an always-on bypass; normal delivery used PR #17. |

Compiled 2026-09-20 21:35 ET from a review of `origin/main` = `ee6fa42`, the working copy,
the GitHub Actions history, and a live check of the published endpoints at 01:30 UTC.
Companion to the canonical root `handoff.md`, which has the current continuation context.

| # | Issue | Severity | Area |
|---|---|---|---|
| 1 | `fix/dining-overlapping-periods` would revert 486 lines if merged | **Critical** | Branches |
| 2 | Fitness feed is blank; recreation source is access-denied | **High** | Live site |
| 3 | Working copy 9 commits behind `origin/main`, on the branch from #1 | High | Branches |
| 4 | Exposed app password not revoked; old bot token not rotated | High | Security |
| 5 | Personal resume committed in a public repo | High | Security |
| 6 | Finished outreach-doc work uncommitted | Medium | Git hygiene |
| 7 | `feat/cafe-east-dining-and-cafe` never pushed; work not live | Medium | Branches |
| 8 | Menus API path not yet exercised by a scheduled run | Medium | Automation |
| 9 | Dining runner still on the laptop, past its own deadline | Medium | Ops |
| 10 | Decision ledger has stale/placeholder fields | Low | Docs |
| 11 | Dead branches, prunable worktrees | Low | Branches |
| 12 | Repo hygiene: junk files, no README, stale handoff | Low | Repo |
| 13 | `ee6fa42` reached `main` without a PR — confirm the ruleset | Low | Confirm |

---

## Branch issues

### 1. `fix/dining-overlapping-periods` would revert the menus API if merged — **Critical**

The branch was merged into `main` twice already (PRs #15 and #16). At 21:26 ET on
2026-09-20 a further commit, "Remove header date and time", was made on top of it *without
pulling first*, producing `4fe0de3`. Its base predates the dining-menus API migration.

The same change also landed on `main` correctly as `ee6fa42` (parent `f2042b1`), so the
branch's commit is **redundant, not unmerged work**.

```
git diff ee6fa42 4fe0de3   →  16 files changed, 35 insertions(+), 486 deletions(-)
```

Merging or fast-forwarding that branch into `main` would delete:
`api/dining-menus.js`, `lib/dining-menus-{schema,service,store}.js`, its three test files,
`docs/dining-menus-operations.md`, the rewritten `update-dining-menus.yml`, the
`audit-published-hours.yml` change, the Blue Gym fix in `lib/recreation-source-parser.js`,
and the `vercel.json` function entry.

**Fix:** verify `main` has the header change, then delete the branch both places.

```bash
git log --oneline -1 origin/main            # expect ee6fa42 "Remove header date and time"
git push origin --delete fix/dining-overlapping-periods
git branch -D fix/dining-overlapping-periods
```

Do this *before* anything else touches that branch.

### 3. Working copy is 9 commits behind and sitting on the branch from #1 — High

`HEAD` is `4fe0de3` on `fix/dining-overlapping-periods`; local `main` is `1f3fc18`
(2026-09-18). The tree has no dining-menus API work at all. Any test run, build or edit made
here right now is against a stale codebase.

**Fix:** stash the uncommitted docs (#6), `git checkout main && git pull --ff-only`, pop.

### 7. `feat/cafe-east-dining-and-cafe` was never pushed — Medium

Local-only, single commit from 2026-09-14, 21 files, 32 commits behind `origin/main`. It
implements the agreed dual-category model for Cafe East — home category `dining` (drives its
`/hours/` page, breadcrumb, official-source link and vote button), `cafe` as the secondary
listing, card intentionally appearing in both sections on the "All" tab — and adds
`tests/venue-categories.test.mjs` plus multi-category support in `scripts/lib/venues.mjs`,
`generate-seo.mjs` and `generate-venue-catalog.mjs`.

`origin/main` still has `{ id:'cafe-east', …, cat:'cafe' }` at `index.html:1177`, so **none
of this is live**. It has never been run against current `main`.

**Fix:** rebase onto `main`, `npm run build` to regenerate, run the suite, open a PR — or
consciously drop it.

### 11. Dead branches and prunable worktrees — Low

Never merged, superseded by the self-hosted Mac runner, safe to delete:
`codex/macos-dining-runner`, `codex/vercel-dining-probe`, `codex/windows-dining-runner`
(~320 commits behind, August experiments).

Merged, local copies still present: `autofix/health/128d1589b553`, `chore/actions-node24`,
`codex/independent-barnard-dining`, `codex/live-recreation-hours`,
`codex/self-hosted-dining-runner`, `codex/telegram-workflow-updates`, `feat/menus-api`,
`fix/blue-gym-calendar-name-and-audit-summary`, `fix/mail-weekends-and-interval-merge`,
`fix/recreation-fall-2026-wording`, `ops/verify-publish-reached-the-site`. Four of these were
already deleted on the remote on 2026-09-20; the local copies remain.

Three `prunable` worktrees under `.worktrees/` and `~/.codex/worktrees/` — `git worktree
prune` is safe.

---

## Live-site issues

### 2. The fitness feed is blank; Columbia's recreation source is access-denied — **High**

`Audit published hours` has been red since the 20:43 UTC run. Cause, reproduced against the
live endpoints:

- `/api/recreation-hours` carries `accessDenied: [dodge, uris-pool]`.
- Dodge Fitness Center and Uris Pool publish `Hours need verification` on **all 14 days**.
- The four Dodge child spaces — Blue Gym, Levien Gymnasium, Functional Fitness Studio,
  Aerobics Room 4 — fall through to `Separate hours not published` on all 14 days.
- Six of eight recreation venues unresolved. Only Barnard Fitness Center has real hours,
  from its own source. Squash Courts is correctly silent via `EXPECTED_UNRESOLVED`.
- Window: started between 15:57 and 20:43 UTC (most likely the 18:56 UTC run); still true in
  the 22:38 UTC snapshot.

**`Update recreation hours` is green on every run throughout.** Per
`docs/recreation-hours-operations.md`, a managed challenge from `perec.columbia.edu` is a
handled outcome, not a job failure. This is exactly the class DEC-0073 exists to catch, and
it caught it — the audit is doing its job; the alert needs acting on.

Visitor impact is contained but real: the client falls back to the embedded `VENUES`
baseline, so Dodge and Barnard render normally (both correctly "Closed today" at 21:30 ET,
matching their baselines) and Uris Pool is a child card. Nobody sees an error — they see
static hours presented as current.

**Fix:** retry once the source is available. If the block persists it is a scraper/source
problem to solve. Per the ops doc's incident response, do **not** relax the source manifest,
date coverage, parent constraints or provenance rules to force a publish.

### 8. Menus API path not yet exercised by a scheduled run — Medium

PR #14 moved menus off the `main` push (which branch protection had been rejecting with
`GH013` since 2026-09-18, freezing the site's menus for two days) onto the same API-publish
path as the five hours feeds. The manual dispatch at 23:50 UTC was fully green, publish and
verification steps both running — so `DINING_MENUS_PUBLISH_ENABLED` and
`DINING_MENUS_API_URL` are set correctly.

But as of 01:30 UTC **no scheduled run has used the new path**; the last scheduled menus run
was 22:30 UTC on the old code. `/api/dining-menus` is serving a 1.1 h old snapshot.

**Fix:** watch the next `17 */2` firing and confirm it publishes and verifies.

*All other feeds are healthy.* Live check at 01:30 UTC, six endpoints HTTP 200: library
3.1 h, dining 1.0 h, barnard-dining 1.0 h, recreation 2.9 h, student-services 2.5 h,
dining-menus 1.1 h — all well inside the 24 h budget.

---

## Security

### 4. Two credentials outstanding — High

- The Gmail app password used for the 2026-09-20 mailbox check was **exposed in a
  screenshot** and has not been revoked. The outreach plan already specifies that the sender
  must run on a fresh app password held in GitHub repository secrets, never in the repo.
- The old shared NewsAgent/Newsbot Telegram token has **never been rotated** in @BotFather —
  outstanding since 2026-09-10, and still listed as a to-do in the 2026-09-24 reminder.

### 5. Personal document in a public repo — High

`Claude outputs/Raymond_Wang_Resume_TikTok_SE.docx` is committed and the repo is public.
Remove it promptly; removing it from `HEAD` does not remove it from history.

---

## Git and documentation hygiene

### 6. Finished outreach work uncommitted — Medium

```
 M docs/ad-sales-outreach-plan.md
 M docs/decisions.md            (contains DEC-0075)
 M docs/outreach-templates.md
 M docs/handoff.md              (new)
?? scripts/check_mailbox_access.py
```

A coherent batch from 2026-09-19/20: DEC-0075 (copy says "over 20,000 views a week";
subject line becomes `{{business_name}} + LionHour`; supersedes DEC-0061), the verified
Google Workspace SMTP/IMAP access with SPF/DKIM/DMARC all passing, retention set at 30 days,
and the plan's last two open questions closed. `check_mailbox_access.py` holds no secret — it
reads `OUTREACH_USER`/`OUTREACH_APP_PW` from the environment — and is safe to commit.

### 10. Decision ledger drift — Low

- DEC-0074 and DEC-0075 both read `Recorded against HEAD: (uncommitted)`; backfill the real
  SHAs once #6 is committed.
- DEC-0065 ("fix the 14 baseline test failures rather than quarantine them") still says
  `Implementation: pending`, but the suite is now 460 tests with **no** baseline failure
  list. The four failures seen in a sandbox run were all
  `browserType.launch: Executable doesn't exist` — a missing Playwright Chromium, fixed by
  `npm run test:setup`. Mark it done.

### 9. Dining runner still on the laptop — Medium

Dining is scraped on a self-hosted macOS ARM64 runner (`lionhour-dining-mac`) living in
`.github-runner/` inside the repo directory, on Raymond's MacBook. DEC-0063 committed to
moving it to a Mac mini "within a month" from 2026-09-10 — **that deadline has arrived**.
Until then dining stops updating whenever the laptop sleeps; the `cancelled` dining runs in
the history are exactly that.

### 12. Repo hygiene — Low

Tracked in `origin/main` and shouldn't be: `.DS_Store`, `Mockups/.DS_Store`,
`index.html.bak` (83 KB), the whole `_to_delete/` tree of `.premerge`/`.stale` files,
`Claude outputs/` (see #5), the empty file `LionTime alerts setup test`, and `CARV1.md` /
`student-services-scraping-plan.md` loose at the root.

There is **no README**. A short one pointing at `docs/decisions.md` and `docs/handoff.md`
would save the next person an hour.

`handoff.md` at the repo root is stale (2026-08-24, describes Barnard Dining work that
shipped long ago) and is superseded by `docs/handoff.md`. Delete it.

### 13. Confirm the branch-protection ruleset — Low

`ee6fa42` reached `main` with a single parent and no pull request, yet
`docs/dining-menus-operations.md` records a ruleset requiring PRs on `main` with an empty
bypass list — the rule that broke the menus workflow with `GH013`. Either an owner bypass
exists, or the ruleset changed. Worth confirming, because the menus fix was designed around
that constraint.

---

## Suggested order

1. Delete `fix/dining-overlapping-periods` (#1) — before anything else touches it.
2. Sync the working copy and commit the outreach batch (#3, #6).
3. Revoke the app password, rotate the bot token, remove the resume (#4, #5).
4. Act on the fitness-feed alert (#2).
5. Watch the next scheduled menus run (#8).
6. Then: cafe-east (#7), runner move (#9), ledger fixes (#10), cleanup (#11, #12, #13).
