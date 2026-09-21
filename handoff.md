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
- `docs/decisions.md` is intentionally unchanged until after the authorized
  history rewrite, when final reachable commit hashes are known

## 5. Important implementation decisions

- The live recreation incident was repaired by a successful fresh publish; no
  validation or provenance rule was weakened.
- The issue report's claim that the old dining branch would revert main was a
  comparison artifact. The redundant local and remote branch was deleted.
- The root `handoff.md` remains canonical per repository instructions. The newer
  but stale duplicate was preserved as `docs/archive/handoff-2026-09-20.md`.
- Merged branches and clean worktrees were removed. Four unmerged superseded
  branches remain until the history rewrite preserves and rewrites them safely.
- The repository ruleset does require pull requests, but administrators have an
  always-on bypass; ordinary delivery will continue through a PR.

## 6. Current state of the code

- Branch: `fix/branchiss-remediation`, based on current `origin/main`.
- Cafe East changes are committed and pass the full test suite.
- Recreation is live and populated at the apex and www endpoints from snapshot
  `2026-09-21T01:57:47.063Z`.
- Outreach changes are committed; the previously malformed manual decision-ledger
  edit was discarded so it can be re-recorded through the validator.
- Current-tree junk and the résumé are staged for removal; history still contains
  the résumé until the final rewrite.

## 7. Tests run and results

- `npm run build`: passed; 43 venues and generated pages/catalogs refreshed.
- `npm test`: 474 passed, 0 failed.
- Recreation workflow run `35552503053`: passed publish and verification; live
  Dodge, Uris, and child-space hours confirmed after edge propagation.
- Final full validation, the scheduled menus-run check, PR checks, and post-rewrite
  history scan remain to be completed.

## 8. Known bugs, gaps, or risks

- A compromised Gmail app password still requires revocation in the Google account.
- The old shared Telegram bot token still requires rotation through BotFather.
- Credential rotation is an external destructive/security action and needs explicit
  confirmation immediately before it is performed.
- A full history rewrite changes commit IDs and requires a coordinated force-push;
  a temporary local bundle must be destroyed after verification because it contains
  the removed personal document.

## 9. Exact next steps

1. Finish repository cleanup documentation and commit it.
2. Confirm the first scheduled dining-menu API run published and verified.
3. Run the complete test/build/ledger checks, push the remediation branch, open a
   PR, wait for checks, and merge it.
4. Rewrite all reachable refs to remove the résumé, force-update the remote, and
   prove the path and blob are unreachable.
5. Append validated decision-ledger records using the rewritten commit hashes.
6. Ask for final confirmation, then revoke/rotate the exposed credentials if the
   required account sessions are available.
