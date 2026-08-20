# LionTime continuation handoff

Schema-Version: 1
Last-Updated: 2026-08-20T13:22:03-04:00
Current-Origin: origin-3b8bce3513f7dacd718b13b6

## Origins

| Origin-ID | Branch | Created-At |
|---|---|---|
| origin-3b8bce3513f7dacd718b13b6 | main | 2026-08-20T13:22:03-04:00 |

## Current Goal

Origin-ID: origin-3b8bce3513f7dacd718b13b6
Text: Deploy and enable LionHour's completed static-first dynamic library-hours updater after account-level configuration and source-data readiness.

## Accomplished in Latest Material Session

Origin-ID: origin-3b8bce3513f7dacd718b13b6
Text: Implemented the strict six-library Python scraper, versioned snapshot validation, Upstash-backed Vercel API, timing-safe protected updates, atomic static-first browser hydration, visible live/stale/fallback status, and a gated four-hour GitHub Actions publisher. Addressed the valid adversarial-review findings, recorded the overnight-source safety policy as DEC-0008, and verified the live scraper preserves its output when Columbia publishes a suspicious interval.

## Outstanding Tasks

| Task-ID | Origin-ID | Priority | Description |
|---|---|---|---|
| task-695285784ee1be36fa9dab4e | origin-3b8bce3513f7dacd718b13b6 | P1 | Provision Upstash and Vercel environment values, configure the GitHub secret and API URL variable, resolve or explicitly revisit the current Lehman source-data rejection, deploy, seed, verify, and then enable LIBRARY_HOURS_PUBLISH_ENABLED. |

## Recommended Next Task

Origin-ID: origin-3b8bce3513f7dacd718b13b6
Task-ID: task-695285784ee1be36fa9dab4e
Reason: The implementation is locally complete; production activation now depends on owner-controlled accounts and a publishable six-library source snapshot.

## Files Touched

| Path | Origin-ID | Presence | State | Notes |
|---|---|---|---|---|
| .github/workflows/update-library-hours.yml | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Read-only, gated publisher scheduled at minute 17 every four hours. |
| .gitignore | origin-3b8bce3513f7dacd718b13b6 | present | uncommitted | Tracks requirements and ignores Node, virtualenv, and Python cache artifacts. |
| CARV1.md | origin-3b8bce3513f7dacd718b13b6 | present | untracked | User-authored adversarial review; inspected but not modified. |
| api/library-hours.js | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Thin Vercel request and response adapter. |
| assets/library-hours.js | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Atomic browser validation, overlay, and freshness handling. |
| docs/decisions.md | origin-3b8bce3513f7dacd718b13b6 | present | uncommitted | Contains pending DEC-0007 and DEC-0008 records. |
| docs/superpowers/plans/2026-08-20-hybrid-library-hours.md | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Implementation plan now records Tasks 1 through 5 complete and external rollout outstanding. |
| docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Final architecture, identity glossary, operations, staleness, and source-policy contract. |
| index.html | origin-3b8bce3513f7dacd718b13b6 | present | uncommitted | Static-first hydration and visible linked live, stale, or fallback status. |
| lib/library-hours-schema.js | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Shared strict snapshot validator and explicit identity map. |
| lib/library-hours-service.js | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Transport-independent GET and protected PUT behavior. |
| lib/library-hours-store.js | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Single-key Upstash latest-good adapter. |
| package-lock.json | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Resolves Upstash Redis 1.38.2. |
| package.json | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Node test command and Upstash dependency. |
| requirements.txt | origin-3b8bce3513f7dacd718b13b6 | present | untracked | Compatible-major Python dependency bounds. |
| scrape.py | origin-3b8bce3513f7dacd718b13b6 | present | uncommitted | Strict parser, explicit identities, exact weeks, validation, and atomic JSON output. |
| tests | origin-3b8bce3513f7dacd718b13b6 | present | committed-and-uncommitted | Adds scraper fixtures and Python, schema, service, client, workflow, and HTML integration coverage; updates two existing mockup test paths. |
| vercel.json | origin-3b8bce3513f7dacd718b13b6 | present | uncommitted | Adds schema and ten-second function configuration without Vercel Cron. |

## Git / Remote State

Origin-ID: origin-3b8bce3513f7dacd718b13b6
Branch: main
Head: ddc63b89b6e310ab63b9750b6be336711894379b
Upstream: origin/main
Ahead: 1
Behind: 0
Remote-Freshness: verified
Remote-Freshness-Reason: none
Project-Working-Tree: dirty
Handoff-Path-State-Before-Write: clean
Handoff-Commit-Exception: none

## Unpushed Commits Before Handoff

| Commit | Subject |
|---|---|
| ddc63b89b6e310ab63b9750b6be336711894379b | docs: update handoff (2026-08-20) |

## Validation

| Validation-ID | Origin-ID | Command | Result | Evidence |
|---|---|---|---|---|
| validation-5f8fdd472467d0d00b099e05 | origin-3b8bce3513f7dacd718b13b6 | live scrape to an existing temporary snapshot | passed | The current Lehman 9:00 PM to 5:00 PM source interval was rejected and the destination SHA-256 remained unchanged. |
| validation-88b1301edc3a5fd6b2480a14 | origin-3b8bce3513f7dacd718b13b6 | configuration, import, dependency, ledger, and diff checks | passed | Vercel JSON and workflow YAML parsed, the API imported, npm reported zero vulnerabilities, the ledger passed, the local page returned HTTP 200, and git diff --check exited zero. |
| validation-8f28c3c6c05f85a60ae263f6 | origin-3b8bce3513f7dacd718b13b6 | .venv/bin/python -m unittest tests/test_scrape.py -v | passed | 11 scraper, parsing, identity, validation, and atomic-output tests passed. |
| validation-9c315ff05a9eee16912b2037 | origin-3b8bce3513f7dacd718b13b6 | npm test | passed | 23 Node contract, service, client, workflow, and existing UI tests passed. |

## Risks / Decisions

| Item-ID | Origin-ID | Kind | Status | Description |
|---|---|---|---|---|
| blocker-dbd7f4f9cefccf4f03b079fe | origin-3b8bce3513f7dacd718b13b6 | blocker | open | Production rollout needs owner-controlled Upstash, Vercel, and GitHub configuration, and Columbia's current Lehman source interval prevents a complete snapshot from being published under the accepted safety policy. |
| decision-7102824c14142b91a776afae | origin-3b8bce3513f7dacd718b13b6 | decision | accepted | DEC-0007 keeps embedded static schedules while adding the latest-good dynamic data path. |
| decision-b3584679b12b4157bb8921cb | origin-3b8bce3513f7dacd718b13b6 | decision | accepted | DEC-0008 permits overnight-style dynamic intervals only for Butler and rejects suspicious inversions elsewhere. |

## Archive Decision

Origin-ID: origin-3b8bce3513f7dacd718b13b6
Safe-to-Archive: no
Reason: Code implementation and local verification are complete, but production provisioning, seeding, deployment, and enablement remain owner-controlled work.
Next-Action: task-695285784ee1be36fa9dab4e
