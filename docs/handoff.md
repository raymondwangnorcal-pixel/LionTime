# LionTime continuation handoff

Schema-Version: 1
Last-Updated: 2026-08-20T16:37:18-04:00
Current-Origin: origin-0d036c18fe90748b3fac4759

## Origins

| Origin-ID | Branch | Created-At |
|---|---|---|
| origin-0d036c18fe90748b3fac4759 | main | 2026-08-20T16:37:18-04:00 |

## Current Goal

Origin-ID: origin-0d036c18fe90748b3fac4759
Text: Deploy and enable LionHour's dynamic library-hours updater with a safe Lehman-only embedded fallback.

## Accomplished in Latest Material Session

Origin-ID: origin-0d036c18fe90748b3fac4759
Text: Implemented an explicit Lehman-only embedded-fallback snapshot shape for Columbia's suspicious overnight interval. The API accepts the narrow shape, the browser preserves embedded Lehman hours while atomically updating the other five libraries, and the footer reports five of six live. Raw unapproved overnight intervals and all other scraper failures remain invalid. The current live Columbia scrape succeeds with five normal schedules and one Lehman fallback.

## Outstanding Tasks

| Task-ID | Origin-ID | Priority | Description |
|---|---|---|---|
| task-7a012080f1ec03d581ebcf5d | origin-0d036c18fe90748b3fac4759 | P1 | Provision Upstash and matching Vercel and GitHub configuration, use the canonical www API URL, redeploy, seed the first snapshot, verify five live plus Lehman fallback, and enable scheduled publishing. |
| task-8c7ecd32a885075a463e4a3c | origin-0d036c18fe90748b3fac4759 | P1 | Review, commit, and push the uncommitted Lehman fallback implementation so Vercel can deploy it. |

## Recommended Next Task

Origin-ID: origin-0d036c18fe90748b3fac4759
Task-ID: task-8c7ecd32a885075a463e4a3c
Reason: The source change is fully verified but cannot affect production until it is committed, pushed, and deployed.

## Files Touched

| Path | Origin-ID | Presence | State | Notes |
|---|---|---|---|---|
| assets/library-hours.js | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Validates and skips only explicit Lehman fallback entries, reporting coverage counts. |
| docs/decisions.md | origin-0d036c18fe90748b3fac4759 | present | uncommitted | DEC-0009 supersedes DEC-0008 with the approved narrow fallback policy. |
| docs/superpowers/plans/2026-08-20-hybrid-library-hours.md | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Records the post-review Lehman fallback amendment. |
| docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Defines the Lehman-only fallback shape and partial-live behavior. |
| index.html | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Shows five of six live and identifies Lehman embedded fallback. |
| lib/library-hours-schema.js | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Accepts only the constrained Lehman fallback shape. |
| scrape.py | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Converts the known Lehman inversion to an explicit fallback entry. |
| tests/header-controls.test.mjs | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Covers partial-live status integration. |
| tests/library-hours-client.test.mjs | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Proves five updates occur while embedded Lehman hours remain unchanged. |
| tests/library-hours-schema.test.mjs | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Covers accepted and rejected embedded-fallback shapes. |
| tests/test_scrape.py | origin-0d036c18fe90748b3fac4759 | present | uncommitted | Covers fallback generation and Python payload validation. |

## Git / Remote State

Origin-ID: origin-0d036c18fe90748b3fac4759
Branch: main
Head: deadaf21a7a835e5fdbee564bf3e94281437810f
Upstream: origin/main
Ahead: 0
Behind: 0
Remote-Freshness: verified
Remote-Freshness-Reason: none
Project-Working-Tree: dirty
Handoff-Path-State-Before-Write: clean
Handoff-Commit-Exception: none

## Unpushed Commits Before Handoff

| Commit | Subject |
|---|---|

## Validation

| Validation-ID | Origin-ID | Command | Result | Evidence |
|---|---|---|---|---|
| validation-23c4a02466358becd621d8dd | origin-0d036c18fe90748b3fac4759 | npm test | passed | 25 Node schema, service, client, workflow, and UI tests passed. |
| validation-a20de7a74061f1a8b75d8678 | origin-0d036c18fe90748b3fac4759 | .venv/bin/python -m unittest tests/test_scrape.py -v | passed | 14 scraper and payload tests passed. |
| validation-ae150f555f50eeaf338885ed | origin-0d036c18fe90748b3fac4759 | live scraper plus JavaScript schema validation | passed | Current Columbia pages produced five normal schedules and one Lehman fallback; the resulting snapshot passed the shared JavaScript validator. |

## Risks / Decisions

| Item-ID | Origin-ID | Kind | Status | Description |
|---|---|---|---|---|
| blocker-8c7ecd32a885075a463e4a3c | origin-0d036c18fe90748b3fac4759 | blocker | open | Production still returns an internal server error because Upstash and update configuration are absent; GitHub Actions currently has no required secret or variables. |
| decision-74fb853a33fb4769394271a7 | origin-0d036c18fe90748b3fac4759 | decision | accepted | DEC-0009 permits only the known Lehman anomaly to retain embedded hours while the other five libraries update dynamically. |

## Archive Decision

Origin-ID: origin-0d036c18fe90748b3fac4759
Safe-to-Archive: no
Reason: The fallback implementation is verified but uncommitted, and production provisioning and seeding remain outstanding.
Next-Action: task-8c7ecd32a885075a463e4a3c
