# LionTime handoff

## 1. Current task goal

Finish the local implementation of live Barnard Dining hours in LionHour, using DineOnCampus as the official source and publishing Hewitt, Diana Center Cafe, Bubble Tea & Sushi, and Liz's Place with resilient retained-source behavior.

## 2. User requirements and constraints

- Use `https://dineoncampus.com/barnard/hours-of-operation` as the Barnard Dining reference/source.
- Treat Liz's Place as a cafe.
- Treat Diana Center Cafe and Bubble Tea & Sushi as dining halls.
- Do not include LeFrak Byte Kiosk.
- Preserve the existing Dining retained-source architecture and backward-compatible public snapshots.
- Do not commit, push, deploy, or dispatch workflows without separate authorization.
- Preserve unrelated local Milstein Library and other user changes in the dirty worktree.

## 3. Files inspected

- `docs/BarnardPlus.md`
- `docs/superpowers/plans/2026-08-24-live-barnard-dining-hours.md`
- `scripts/dining-hours-scraper.mjs`
- `lib/dining-hours-schema.js`, `lib/dining-hours-source-schema.js`
- `lib/dining-hours-resolver.js`, `lib/dining-hours-service.js`
- `assets/dining-hours.js`, `index.html`
- Dining parser, schema, service, resolver, scraper, client, workflow, and header tests
- `.github/workflows/update-dining-hours.yml`
- `docs/dining-hours-operations.md`, `docs/decisions.md`

## 4. Files modified

Barnard implementation files currently added or modified:

- Added: `lib/barnard-dining-hours-parser.js`
- Added: `tests/barnard-dining-hours-parser.test.mjs`
- Added: three sanitized Barnard rendered-week fixtures under `tests/fixtures/`
- Modified: `lib/dining-hours-schema.js`, `lib/dining-hours-source-schema.js`
- Modified: `lib/dining-hours-resolver.js`, `lib/dining-hours-service.js`
- Modified: `scripts/dining-hours-scraper.mjs`
- Modified: `assets/dining-hours.js`, `index.html`
- Modified: Dining helper/schema/source/service/resolver/scraper/client tests and `tests/header-controls.test.mjs`
- Modified earlier: `docs/superpowers/plans/2026-08-24-live-barnard-dining-hours.md`, `docs/decisions.md`

Other pre-existing user changes, especially the Milstein Library work, remain in the same dirty worktree and must not be overwritten.

## 5. Important implementation decisions

- One official Barnard source attempt owns four exact venues: Hewitt, Diana Center Cafe, Bubble Tea & Sushi, and Liz's Place.
- The source parser consumes sanitized rendered DineOnCampus HTML and validates both visible table text and accessible labels.
- A Barnard scrape must provide two complete Sunday-starting weeks (14 days); a third week is opportunistic, producing 21 days when available.
- LeFrak Byte Kiosk and untargeted rows are excluded.
- Public snapshot schema v4 permits source-specific `fetchedAt` timestamps and adds the four Barnard locations while preserving v1-v3 readers.
- Barnard coverage older than eight hours is marked stale; missing days are partial; retained coverage older than 24 hours is expired. Covered dates can still display retained hours with explicit status.
- DEC-0034 and DEC-0035 record the source and product-contract choices; their implementation status remains pending until a commit exists.

## 6. Current state of the code

- Parser, source acquisition, retained-state merge, resolver, browser hydration, dynamic status counts, and four UI cards are implemented locally.
- The scraper performs one Barnard navigation, waits for stable rendered evidence, captures two required weeks, and attempts a third within a bounded budget.
- Parser, browser integration, scraper, schema, source-schema, service, resolver, client, workflow, and Barnard page-card tests are green.
- The workflow ceiling is fifteen minutes and Dining operations documentation covers the six-source/v4 contract and Barnard failure policy.
- A live non-publishing scrape succeeded for Barnard and produced a valid fourteen-day, four-venue payload in 2.16 seconds.
- Local implementation and verification are complete; `git diff --check` and decision-ledger validation pass.
- No commit, push, deploy, workflow dispatch, or external configuration mutation has been performed.

## 7. Tests run and results

- Baseline full `npm test`: 208 passed, 5 failed before Barnard work; failures were one stale Dining header assertion and four unrelated Recreation assertions.
- Barnard parser: 6 passed, including a real Chromium DOM serialization test.
- Dining scraper: 10 passed, including optional-third-week degradation to fourteen days.
- Dining schema/source-schema/service/resolver: 26 passed.
- Dining client: 10 passed.
- Full `npm test` after implementation: 225 passed, 5 failed across 230 tests. The failure count matches baseline: the one header failure is now the separate unfinished Milstein page-card assertion, and the same four Recreation renderer failures remain. Every Barnard/Dining test passed.
- Live smoke batch validation: passed. `barnard-hours` succeeded with 14 days for all four exact venues; `locations-feed` also succeeded; four managed-challenge sources failed independently and were retained as bounded failures.

## 8. Known bugs, gaps, or risks

- The implementation remains local and will not affect production until an authorized commit, push, Vercel deployment, and manually dispatched Dining workflow occur.
- The live source currently exposed only two weeks, so the smoke test correctly exercised the valid fourteen-day path rather than the opportunistic twenty-one-day path.
- Four Columbia/Lerner article-style sources returned managed challenges during the live smoke run; retained-source isolation handled them as designed and no bypass was attempted.
- The full suite still has one unrelated Milstein page-card failure and four unrelated Recreation renderer failures.

## 9. Exact next steps

1. Review the combined dirty-worktree diff carefully because it also contains separate Milstein and UI work.
2. If approved, commit the intended Barnard Dining files together and push; then wait for Vercel deployment.
3. Manually dispatch `Update dining hours` with publishing enabled and verify public schema v4, six retained source states, four Barnard cards, and 20-of-23 live when all required evidence is current.
4. Reconcile DEC-0034/DEC-0035 with the implementation commit; until then, leave both implementation fields pending.
