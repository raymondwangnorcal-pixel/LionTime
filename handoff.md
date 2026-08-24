# LionTime handoff

## 1. Current task goal

Finish and review the local implementation of the independent live Student Life and Services hours pipeline, including ten cards, four official live source adapters, source-isolated storage, scheduled publication, access-context badges, and responsive browser hydration.

## 2. User requirements and constraints

- Track Alfred Lerner Hall, Columbia Bookstore, Student Mail Center, Alice! Health Promotion, CAPS, Disability Services, Medical Services, Sexual Violence Response, Student Health Insurance, and Immunization Compliance.
- Keep a secondary access-context badge to the left of the temporal badge. Active availability, including Office Hours, Appointment Only, Virtual Only, Drop-In, and Phone Support, counts as Open because the access limitation remains visible.
- Retain the Bookstore only if its official page supplies live hours. Its official page currently renders a live STORE HOURS block, so the card remains tracked.
- Use official publisher-controlled sources only; do not bypass managed challenges or substitute crowd-sourced hours.
- Preserve mobile and desktop layouts without horizontal overflow.
- Do not commit, push, deploy, or configure GitHub publication variables without separate authorization.

## 3. Files inspected

- `index.html`, `package.json`, `vercel.json`
- Existing Library, Dining, and Recreation assets, APIs, workflows, schemas, services, and tests
- `docs/superpowers/plans/2026-08-23-live-student-services-hours.md`
- `docs/decisions.md`
- Official Lerner, Columbia Mail, Columbia Health, and Columbia Bookstore pages

## 4. Files modified

- Modified: `index.html`, `vercel.json`, `docs/decisions.md`
- Added runtime/API: `api/student-services-hours.js`, `lib/student-services-hours-{catalog,resolver,schema,service,store}.js`, `lib/student-services-source-parser.js`
- Added acquisition/publication: `scripts/student-services-hours-acquire.mjs`, `scripts/student-services-hours-scraper.mjs`, `.github/workflows/update-student-services-hours.yml`
- Added client/UI: `assets/student-services-hours.js`, `assets/student-services-hours-view.js`
- Added runbook: `docs/student-services-hours-operations.md`
- Added Student Life fixtures, helper, and focused test files under `tests/`

## 5. Important implementation decisions

- Four source records merge independently into Redis key `lionhour:student-services-hours:v1`; a failed refresh preserves only that source's last successful venues.
- Snapshots cover fourteen Eastern dates. Freshness is live through eight hours, stale through twenty-four hours, then Needs verification.
- Mail seasonal periods and exact Labor Day closure are parsed separately. Health access modes remain separate sibling availabilities.
- Lerner uses the recurring homepage baseline plus exact daily events from the titled Google Calendar iframe directly embedded by Lerner; overnight calendar events are split into schema-safe same-day intervals.
- Bookstore uses the identified visible STORE HOURS footer on the official Columbia B&N storefront.
- DEC-0029 supersedes DEC-0026 for access-aware Open-now behavior. DEC-0030 records the rendered official source policy.

## 6. Current state of the code

- Local working tree is intentionally dirty and uncommitted. `main` is exactly even with freshly fetched `origin/main` at `ae7253f46593dca17bc3304683c8965ac9d9a89f` before these changes.
- A one-time headed live scrape succeeded for all four sources and produced a valid four-attempt batch in `/private/tmp/student-services-hours-live.json`.
- Browser verification with that live batch rendered ten cards, 4 of 4 current sources, and zero horizontal overflow at 390 and 1440 pixels. Sunday evening correctly showed Phone Support + Open for the three 24/7 Health channels.
- GitHub has `LIBRARY_HOURS_UPDATE_SECRET`. It does not yet have `STUDENT_SERVICES_HOURS_PUBLISH_ENABLED` or `STUDENT_SERVICES_HOURS_API_URL`.

## 7. Tests run and results

- Focused Student Life plus header suite: 43 passed, 0 failed.
- Live headed scraper: 4 of 4 sources succeeded.
- Python library scraper: 15 passed, 0 failed.
- Full `npm test`: all tests outside four Recreation renderer assertion mismatches passed. Those same four failures were present at baseline; Student Life and Dining introduced no failures.
- `git diff --check`: passed.
- Decision ledger schema/lifecycle/privacy validation: passed.
- Manual browser checks: ten cards and all access badges rendered on desktop/mobile with zero overflow.

## 8. Known bugs, gaps, or risks

- Production publication is not active because this change is uncommitted/undeployed and the two Student Life GitHub variables are absent.
- Four unrelated Recreation UI tests remain red: source reason rendering/escaping expectations and class-selector expectations in `tests/recreation-hours-ui.test.mjs`.
- Official page DOM changes will intentionally isolate and degrade only the affected source; investigate rather than widening provenance checks.
- The full feature should not be called production-live until a deployed API has four non-null `lastSuccessAt` values.

## 9. Exact next steps

1. Review the complete diff, especially the official visible Bookstore adapter and directly embedded Lerner calendar policy.
2. If approved, commit the implementation and push it; then deploy the API/client together.
3. Set `STUDENT_SERVICES_HOURS_API_URL=https://www.lionhour.com/api/student-services-hours` and `STUDENT_SERVICES_HOURS_PUBLISH_ENABLED=true` only after deployment, then manually run the workflow.
4. Confirm the production API returns four initialized source records and the footer says 4 of 4 sources live.
5. Optionally repair the four unrelated Recreation renderer tests in a separate change.
