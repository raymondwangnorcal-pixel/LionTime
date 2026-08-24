# LionTime Squash visibility handoff

Schema-Version: 1
Last-Updated: 2026-08-24T17:52:58-04:00
Current-Origin: origin-b98e2275d9c96dbea45e5f1b

## Origins

| Origin-ID | Branch | Created-At |
|---|---|---|
| origin-b98e2275d9c96dbea45e5f1b | frontend/appearance-polish | 2026-08-24T17:52:58-04:00 |

## Current Goal

Origin-ID: origin-b98e2275d9c96dbea45e5f1b
Text: Hide Squash Courts from the LionHour Dodge space list without removing its parsing, validation, or API data path.

## Accomplished in Latest Material Session

Origin-ID: origin-b98e2275d9c96dbea45e5f1b
Text: Added presentation-only filtering before Recreation spaces reach the renderer and verification state, retained the five-space strict snapshot and booking-only Squash evidence, pushed the change to main, verified the deployed client asset, confirmed the public API still contains Squash Courts, and confirmed the expanded live LionHour view shows only four calendar-backed spaces.

## Outstanding Tasks

| Task-ID | Origin-ID | Priority | Description |
|---|---|---|---|

## Recommended Next Task

Origin-ID: origin-b98e2275d9c96dbea45e5f1b
Task-ID: none
Reason: The requested presentation-only change is implemented, deployed, and verified without altering underlying Squash data logic.

## Files Touched

| Path | Origin-ID | Presence | State | Notes |
|---|---|---|---|---|
| assets/recreation-hours.js | origin-b98e2275d9c96dbea45e5f1b | present | committed | Filters squash-courts after strict snapshot validation and before visible space rendering or verification counting. |
| docs/decisions.md | origin-b98e2275d9c96dbea45e5f1b | present | committed | DEC-0042 supersedes the broader catalog-removal interpretation and records presentation-only filtering. |
| docs/recreation-hours-operations.md | origin-b98e2275d9c96dbea45e5f1b | present | committed | Documents five underlying data spaces and four visible calendar-backed rows. |
| index.html | origin-b98e2275d9c96dbea45e5f1b | present | uncommitted | Unrelated pre-existing or concurrent user edit preserved without modification. |
| tests/recreation-hours-client.test.mjs | origin-b98e2275d9c96dbea45e5f1b | present | committed | Proves a valid five-space snapshot yields exactly the four approved visible space IDs. |

## Git / Remote State

Origin-ID: origin-b98e2275d9c96dbea45e5f1b
Branch: frontend/appearance-polish
Head: 1fab4e38e7a6e4ebc0f7d1f4456d5dcb78afabbc
Upstream: origin/frontend/appearance-polish
Ahead: 3
Behind: 0
Remote-Freshness: verified
Remote-Freshness-Reason: none
Project-Working-Tree: dirty
Handoff-Path-State-Before-Write: clean
Handoff-Commit-Exception: none

## Unpushed Commits Before Handoff

| Commit | Subject |
|---|---|
| 1fab4e38e7a6e4ebc0f7d1f4456d5dcb78afabbc | docs(decisions): record Squash visibility policy |
| 749eef5067dac64852045b8b21483d1ed929c357 | fix(recreation): hide Squash Courts row |
| 5d53f387aee594f27027c5af9a69fca7a2b7d0c2 | docs: update handoff (2026-08-24) |

## Validation

| Validation-ID | Origin-ID | Command | Result | Evidence |
|---|---|---|---|---|
| validation-2a39612c3288c67787244b7f | origin-b98e2275d9c96dbea45e5f1b | Inspect expanded Dodge spaces on https://www.lionhour.com | passed | The live button reports View spaces (4), lists the four calendar-backed spaces, and does not render Squash Courts. |
| validation-5ec3b24b4d42537151544515 | origin-b98e2275d9c96dbea45e5f1b | GET https://www.lionhour.com/api/recreation-hours | passed | The public API retained all five Dodge data IDs and booking-only Squash evidence. |
| validation-823c5ea40154b2920f3b3fa4 | origin-b98e2275d9c96dbea45e5f1b | node --test tests/recreation-hours-acquire.test.mjs tests/recreation-hours-client.test.mjs tests/recreation-source-parser.test.mjs tests/recreation-hours-resolver.test.mjs tests/recreation-hours-schema.test.mjs tests/recreation-hours-service.test.mjs tests/recreation-hours-scraper.test.mjs tests/recreation-hours-workflow.test.mjs | passed | 98 tests passed and 0 failed, including strict five-space validation and four-space presentation filtering. |
| validation-dda4e5e9f08f86aaa34751f5 | origin-b98e2275d9c96dbea45e5f1b | GET https://www.lionhour.com/assets/recreation-hours.js | passed | The deployed asset SHA-256 exactly matched the committed local asset and contains the squash-courts presentation filter. |
| validation-e057796aac6d174269386935 | origin-b98e2275d9c96dbea45e5f1b | npm test | partial | 245 of 249 tests passed; the four previously recorded Recreation renderer expectation assertions remain the only failures. |

## Risks / Decisions

| Item-ID | Origin-ID | Kind | Status | Description |
|---|---|---|---|---|
| decision-5a95a3c8c69b0e52b4df1b0c | origin-b98e2275d9c96dbea45e5f1b | decision | accepted | Keep Squash Courts in acquisition, parsing, validation, storage, and API data while filtering it only from visible Recreation spaces and their verification count. |

## Archive Decision

Origin-ID: origin-b98e2275d9c96dbea45e5f1b
Safe-to-Archive: yes
Reason: The visibility-only change is tested, pushed to main, deployed, and verified; the unrelated index.html edit remains explicitly preserved.
Next-Action: none
