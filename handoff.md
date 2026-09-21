# LionHour handoff

## 1. Current task goal

Resolve every actionable item in `docs/open-issues-2026-09-20.md`, ship the
approved Cafe East dual-category behavior, remove the exposed résumé from the
public repository and its history, and leave live automation and repository
state verified.

## 2. User requirements and constraints

- Cafe East appears under both Dining and Cafes, with Dining as its home category.
- The résumé must be purged from all reachable Git history, not only deleted from HEAD.
- Keep the self-hosted dining runner on this Mac for now; migrate to the Mac mini later.
- Preserve the existing 2026-10-10 migration target in DEC-0063.
- Ask for product decisions only where implementation cannot safely determine the answer.

## 3. Files inspected

- `docs/open-issues-2026-09-20.md`, both prior handoffs, and `docs/decisions.md`
- Header, venue catalog, build generators, API routes, workflows, and their tests
- Outreach plan/templates and `scripts/check_mailbox_access.py`
- All local branches and worktrees, GitHub workflow history, repository ruleset,
  and the live recreation and dining-menu endpoints

## 4. Files modified

- Cafe East multi-category implementation and generated artifacts (committed as `3faa2fc`)
- Outreach documentation and mailbox-access checker (committed as `e32177b`)
- Repository cleanup, README, ignore rules, archived historical documents,
  generated sitemap, issue-resolution record, and this handoff (uncommitted)
- `docs/decisions.md` contains the owner-approved DEC-0071–DEC-0074 schema
  normalization plus trusted records for the menu API, Cafe East, test gate,
  outreach work, and privacy purge.

## 5. Important implementation decisions

- The live recreation incident was repaired by a successful fresh publish; no
  validation or provenance rule was weakened.
- The issue report's claim that the old dining branch would revert main was a
  comparison artifact. The redundant local and remote branch was deleted.
- The root `handoff.md` remains canonical per repository instructions. The newer
  but stale duplicate was preserved as `docs/archive/handoff-2026-09-20.md`.
- Merged branches, clean worktrees, and the four explicitly approved superseded
  local branches were removed. Only `main` and the active reconciliation branch remain.
- The repository ruleset does require pull requests, but administrators have an
  always-on bypass; ordinary delivery will continue through a PR.

## 6. Current state of the code

- Branch: `fix/post-purge-reconciliation`, based on rewritten `origin/main`.
- Cafe East changes are committed and pass the full test suite.
- Recreation is live and populated at the apex and www endpoints from snapshot
  `2026-09-21T01:57:47.063Z`.
- Outreach changes are committed; the previously malformed manual decision-ledger
  edit was discarded so it can be re-recorded through the validator.
- PR #17 merged, production serves Cafe East under Dining and Cafes, and the
  rewritten public `main` and `feat/menus-api` branches no longer contain the résumé.
- GitHub Support ticket #4776343 is open to remove the read-only PR refs and
  cached views for #14–#17. The public fork `leemon888/lionhour` still retains
  pre-rewrite history and requires its owner's cleanup.

## 7. Tests run and results

- `npm run build`: passed; 43 venues and generated pages/catalogs refreshed.
- `npm test`: 474 passed, 0 failed.
- Recreation workflow run `35552503053`: passed publish and verification; live
  Dodge, Uris, and child-space hours confirmed after edge propagation.
- PR #17 checks passed, rewritten-main push checks passed, and local object-level
  verification passed. The scheduled menus-run check remains outstanding.
- The history-independent decision-ledger schema, lifecycle, and privacy audit
  passes. Full Git attribution still reports unreachable legacy hashes because
  the authorized résumé purge rewrote repository history.

## 8. Known bugs, gaps, or risks

- The owner reports that the exposed Gmail app password and old Telegram bot
  token have both been rotated; no secret values were recorded in the repository.
- GitHub Support ticket #4776343 requests removal of cached views and hidden refs
  for PRs #14–#17. The user approved permanent loss of those PR diff views.
- The public fork owner must remove or rewrite their fork; the source repository
  cannot do that unilaterally.
- Full Git attribution for the append-only decision ledger cannot verify legacy
  pre-purge commit hashes after the authorized history rewrite; the independent
  schema, lifecycle, and privacy audit passes.

## 9. Exact next steps

1. Confirm the first scheduled dining-menu API run published and verified.
2. Monitor GitHub Support ticket #4776343 and coordinate the fork cleanup.
3. Commit and merge the final reconciliation documentation.
