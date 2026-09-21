# Critical Adversarial Review V1

Review of **Hybrid Library Hours Design** (`docs/superpowers/specs/2026-08-20-hybrid-library-hours-design.md`) and **Hybrid Library Hours Implementation Plan** (`docs/superpowers/plans/2026-08-20-hybrid-library-hours.md`), grounded against the current codebase.

---

## 1. Library ID Mismatch

**Severity: Bug — will cause silent data loss at runtime**

The scraper generates IDs by replacing hyphens with underscores in the slug: `slug.replace("-", "_")`. The slug `"science-engineering"` becomes `"science_engineering"`, and `"butler-24"` becomes `"butler_24"`.

The design spec, the plan's test fixtures, and the plan's `REQUIRED_LIBRARY_IDS` set all list exactly six IDs:

```
butler_24, science_engineering, lehman, business, avery, math
```

But the scraper currently scrapes **twelve** libraries, not six. The other six — `journalism`, `music`, `social_work`, `business_manhattanville`, `eastasian`, `burke` — are scraped, included in the payload, and ignored by the frontend. This is fine. **However**, the plan's `DISPLAYED_LIBRARY_IDS` set must match the IDs the scraper actually produces. The plan's test factory (Step 3 of Task 1) uses these IDs in `make_complete_payload()`:

```python
required = ["avery", "business", "butler_24", "lehman", "math", "science_engineering"]
```

And the assertion checks for `"missing required library: butler_24"`. This is consistent. But the JS fixture in Task 2 Step 2 uses the same list, and the `SCRAPER_TO_VENUE_ID` mapping is:

```js
butler_24: 'butler', science_engineering: 'noco', lehman: 'lehman',
business: 'uris', avery: 'avery', math: 'math'
```

This mapping already exists verbatim in `index.html:552-553` and works today. **So the IDs are actually correct** — but only by coincidence with the current slug set. The plan never explicitly states or tests the mapping between slugs and IDs. If Columbia renamed a slug (e.g., `business` → `business-library`), the scraper would produce `business_library`, the validator would reject the payload for missing `business`, and the system would silently go stale. The design should document the slug-to-ID derivation rule and the plan should test it.

**Verdict: Low risk in practice, but the mapping is implicit and fragile.**

---

## 2. `business_manhattanville` Collision Risk

**Severity: Design gap**

The scraper produces IDs via `slug.replace("-", "_")`. Two slugs share the `business` prefix:

- `business` → `business`
- `business-manhattanville` → `business_manhattanville`

These are distinct today, but if Columbia ever added a slug like `business-library`, the frontend mapping `business: 'uris'` would silently stop matching. Neither the design nor the plan addresses how slug evolution could break the hardcoded ID map.

---

## 3. Upstash Redis Is a New Paid Dependency for a Static Site

**Severity: Architecture concern**

The current site is purely static — zero runtime costs, zero infrastructure. The design introduces Upstash Redis as a required runtime dependency. Upstash has a free tier (10K commands/day), but:

- The plan never mentions which tier is needed or what happens when the free tier is exceeded.
- There's no cost analysis. A `GET` per visitor plus a `SET` every 4 hours is likely fine on free tier, but this should be stated.
- Upstash free-tier databases are evicted after 30 days of inactivity during summer/winter breaks — exactly when library hours change the most. The plan lists GitHub Actions inactivity risk but not Redis eviction.
- If the Redis instance is evicted or unreachable, the API returns `503` and the frontend falls back to embedded schedules — which may be months out of date. The design calls this acceptable, but the plan never addresses keeping embedded schedules reasonably fresh.

**Question: Why not just commit the scraped JSON to the repo and serve it as a static file?** This eliminates Redis, the API, the update secret, and the Vercel Function entirely. GitHub Actions writes `library-hours.json`, commits it, Vercel redeploys, and the frontend fetches it as a static asset. The fallback behavior is identical. The only downside is a commit every 4 hours, which is a cosmetic git-history issue — easily solved with squashing or a separate branch.

---

## 4. The Plan Hardcodes `24:00` as a Valid Close Time, But the Scraper Never Produces It

**Severity: Spec/implementation mismatch**

The JS validator (`lib/library-hours-schema.js`) accepts `24:00` as a valid close time:

```js
const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
```

But the Python `parse_time()` function converts 12:00 AM to `"00:00"`, and a closing time of 12:00 AM (midnight) becomes `"00:00"`, not `"24:00"`. So `24:00` can never appear in scraper output. This is a dead code path in the validator that could mask a real parsing issue: if a library is open until midnight, the scraper produces `"close": "00:00"`, which looks like it closes at the start of the day rather than the end.

The plan should either:
- Make the scraper produce `24:00` for midnight-closing libraries, or
- Remove `24:00` from the validator and clarify that `"00:00"` means midnight close.

---

## 5. No Staleness Indicator for Users

**Severity: UX gap**

The design says the frontend falls back silently. A visitor sees library hours but has no way to know whether those hours are from today's scrape, last week's Redis snapshot, or the static fallback embedded at deploy time. The footer says "verify changing hours," but:

- There's no visible timestamp showing when hours were last updated.
- If Redis dies and the static fallback is 3 months old, visitors have no signal.

The plan should add a subtle "Last updated: [timestamp]" indicator, or at minimum expose `generated` in the DOM so a user or developer can verify freshness.

---

## 6. The GitHub Actions Workflow Publishes to a Hardcoded Production URL

**Severity: Operational risk**

The workflow (Task 5, Step 4) uses:

```yaml
run: >-
  curl ... -X PUT https://lionhour.com/api/library-hours ...
```

This hardcodes the production domain. There's no staging or preview environment for the publisher — every workflow run writes directly to production Redis. The plan's Task 6 Step 3 says "push or merge... confirm the production deployment succeeds" but the workflow will start writing to production on every schedule tick immediately after the workflow file is merged to the default branch, even before provisioning is complete.

**Risk:** If the workflow file is merged before the Vercel Function is deployed and Redis is provisioned, the `curl` will fail, which is fine (`--fail-with-body` makes it exit nonzero). But if the function is deployed but the update secret isn't configured yet, the PUT will return `401` — again fine. The actual risk is the reverse: if someone enables the workflow schedule before the frontend is updated, the data goes into Redis but no one reads it. This is harmless. But the hardcoded URL means there's no way to test the full pipeline in Preview without editing the workflow file.

**Suggestion:** Use a GitHub Actions environment variable (e.g., `LIONHOUR_API_URL`) defaulting to production, so Preview testing is possible.

---

## 7. `extract_schedule_from_page` Is Not Tested Against Real Columbia HTML

**Severity: Test coverage gap**

The plan creates `tests/fixtures/butler-august-2026.html` with a minimal three-cell fixture:

```html
<table class="calendar">
  <tr>
    <td>...</td><td>...</td><td>...</td>
  </tr>
</table>
```

But the actual `extract_schedule_from_page` in `scrape.py` (lines 108-140+) uses a multi-strategy parsing approach that searches for ISO dates in `td` text content, then `div.fulldate`, then `div.day-date`. The minimal fixture covers the `div.fulldate` / `div.day-hours` path but not the other parsing strategies. If Columbia changes their HTML structure (which they have done before), the fixture won't catch the regression.

**Suggestion:** Save a real snapshot of a Columbia library page as a fixture (sanitized if needed) alongside the minimal one, and test both.

---

## 8. The `make_fallback_entry` Has `scrapeFailed: True` — This Is Never Validated on the Existing Path

**Severity: Correctness gap in current code, surfaced by the plan**

The current `scrape.py` line 327 produces entries with `"scrapeFailed": True` when parsing fails. The plan's validator correctly rejects these. But the plan's `build_payload` (Task 1, Step 7) calls `scrape_library` for all 12 libraries, and if any of the six displayed libraries fails, `build_payload` returns a payload containing `scrapeFailed: True`, which `validate_publishable_payload` rejects. Good.

But `build_payload` still calls the scraper for all 12 libraries. If a **non-displayed** library (like `journalism`) fails, it gets `scrapeFailed: True` in the payload. The validator only checks the 6 required IDs, so the non-displayed failure is silently included. This is fine for correctness (the frontend ignores it), but it means the stored snapshot in Redis contains an entry that says "scrape failed" — which is ugly and could confuse anyone reading the API response directly.

**Suggestion:** Either strip non-displayed libraries from the output payload, or document that non-displayed library failures are expected and benign.

---

## 9. Cache Headers May Serve Stale Data During Columbia Schedule Transitions

**Severity: UX concern**

The API uses:

```
Cache-Control: public, max-age=0, s-maxage=300, stale-while-revalidate=3600
```

`s-maxage=300` means Vercel's CDN caches for 5 minutes. `stale-while-revalidate=3600` means the CDN can serve stale data for up to 1 hour while revalidating. Combined with the 4-hour scrape interval, library hours can be up to **5 hours old** in the worst case (scraped at T+0, CDN caches at T+3:59, serves stale for 1 hour until T+4:59).

For a university library that changes hours at semester boundaries or during exams, 5 hours of staleness is probably fine. But the design claims "approximately every four hours" without stating the worst-case staleness. The plan should document the actual worst case.

---

## 10. No Monitoring or Alerting

**Severity: Operational gap**

The plan mentions "observe the first scheduled run" in Task 6 Step 8 but provides no ongoing monitoring. After the initial rollout:

- There's no alert if the GitHub Actions workflow fails for multiple consecutive runs.
- There's no alert if the Redis snapshot hasn't been refreshed in > 8 hours.
- There's no alert if the Upstash Redis instance becomes unreachable.
- GitHub sends failure emails by default, but only to the repository owner. If the owner's email notifications are noisy, failures will be missed.

For a personal project this may be acceptable, but the plan should at least acknowledge it as a known gap.

---

## 11. The Plan Introduces `package.json` and `node_modules` to a Currently Zero-Dependency Frontend

**Severity: Complexity concern**

The current project is: one HTML file, one Python scraper, one `vercel.json`, static assets. No `package.json`, no `node_modules`, no build step.

The plan adds `package.json` with `@upstash/redis` as a production dependency, plus Node's built-in test runner for testing. This means:

- `node_modules/` appears in the project (needs `.gitignore` entry — the plan doesn't add one).
- Vercel will detect `package.json` and may try to run a build step or change the framework detection (the plan sets `"framework": null` which should prevent this, but it's a subtle interaction).
- Dependabot PRs for `@upstash/redis` become a maintenance burden.

**Missing:** The plan never adds `node_modules/` to `.gitignore`.

---

## 12. The Rollback Procedure Requires Reverting Specific Commits

**Severity: Operational complexity**

The rollback plan says:

> 2. Revert only the frontend hydration commit to restore embedded schedules immediately.
> 3. If the API itself is faulty, revert the API/store commit after the frontend no longer calls it.

This requires identifying which commits to revert and doing targeted `git revert`s under pressure. For a personal project with a single maintainer, a simpler rollback would be to remove the `<script src="assets/library-hours.js"></script>` tag from `index.html` and push. The existing `data.js` path (or no overlay at all) handles the rest.

---

## 13. Test Fixture IDs Don't Match the Plan's Global Constraints

**Severity: Inconsistency**

The plan's Global Constraints section lists the six displayed library IDs as:

```
butler, noco, lehman, uris, avery, math
```

These are the **venue IDs** (frontend). But the test fixtures and validators use the **scraper IDs**:

```
butler_24, science_engineering, lehman, business, avery, math
```

The plan uses both ID systems without a clear glossary. A reader could easily confuse which system a given ID belongs to. The design spec uses scraper IDs in the data contract but venue IDs in the architecture diagram. A terminology table would prevent implementation errors.

---

## 14. `temporarilyClosed` Is Checked by the Frontend but Not by the New Validator

**Severity: Potential correctness gap**

The existing `index.html` doesn't check `temporarilyClosed` in the overlay code — it just converts hours and applies them. The new `validateLibraryHoursSnapshot` in the plan doesn't validate or reject `temporarilyClosed: true` entries (it only checks `scrapeFailed`). So a temporarily closed library passes validation and gets overlaid with all-null hours, which is correct behavior — the venue shows as closed.

But the design's "Closed is valid source data" rule is only enforced implicitly. If the scraper marks a library as `temporarilyClosed: true` with an all-null schedule, the validator accepts it, the frontend overlays it, and the venue shows "Closed" — even if the underlying data is wrong (e.g., the scraper misinterpreted the page). There's no human-in-the-loop check for "this library that was open yesterday is now marked as closed."

---

## Summary

| # | Issue | Severity | Action Needed |
|---|-------|----------|---------------|
| 1 | Slug-to-ID derivation is implicit and untested | Low | Document and test the rule |
| 2 | `business` prefix collision potential | Low | Document the constraint |
| 3 | Redis adds infra cost/complexity; static-file alternative not evaluated | Medium | Evaluate committing JSON as a static file |
| 4 | `24:00` accepted by validator but never produced by scraper | Low | Align scraper and validator on midnight |
| 5 | No staleness indicator for visitors | Medium | Add "last updated" timestamp |
| 6 | Hardcoded production URL in workflow | Low | Make URL configurable |
| 7 | Test fixture doesn't match real Columbia HTML | Medium | Add a real HTML snapshot fixture |
| 8 | Non-displayed library failures included in snapshot | Low | Strip or document |
| 9 | Worst-case staleness undocumented | Low | Document the 5-hour bound |
| 10 | No monitoring or alerting | Medium | Acknowledge or add basic alerts |
| 11 | `node_modules/` not in `.gitignore` | Bug | Add to `.gitignore` |
| 12 | Rollback procedure is over-engineered | Low | Simplify to single-line revert |
| 13 | Two ID systems used without glossary | Low | Add a terminology table |
| 14 | `temporarilyClosed` bypass not guarded | Low | Document or add a check |
