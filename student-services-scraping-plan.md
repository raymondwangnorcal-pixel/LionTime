# Student Life & Services — Live Hours Scraping Plan

## Overview

All eight Student Life & Services venues currently use **hardcoded hours** in `index.html`. Two are flagged `estimated: true` (Bookstore, Package Center). This plan outlines how to bring them to parity with the Dining and Library pipelines — a server-side scraper that produces a validated JSON snapshot, consumed by a client-side hydration module (`student-hours.js`).

---

## Source Pages

| Venue | Source URL | Structure | Update cadence |
|---|---|---|---|
| **Alfred Lerner Hall** | [lernerhall.columbia.edu/content/operating-hours](https://lernerhall.columbia.edu/content/operating-hours) | Plain text under "Regular Building Hours" heading. Seasonal pages linked separately. | Semester boundaries |
| **Columbia Bookstore** | [columbia.bncollege.com (Location & Contact)](https://columbia.bncollege.com/webapp/wcs/stores/servlet/BNCBLocationAndContactView?catalogId=10001&langId=-1&storeId=45552) | HTML `<table>` — one row per day, two columns (day name, hours). | Semester boundaries |
| **Lerner Package Center** | [columbia.edu/cu/lernerhall/departments](https://www.columbia.edu/cu/lernerhall/departments/index.html) | Plain text list within Lerner departments directory. | Semester boundaries |
| **Medical Services** | [health.columbia.edu/content/hours-and-locations](https://www.health.columbia.edu/content/hours-and-locations) | `cu_accordion_item` divs. M-Th 9-5, F 8-4; seasonal variations. | Semester + summer |
| **CAPS** | [health.columbia.edu/content/hours-and-locations](https://www.health.columbia.edu/content/hours-and-locations) | Same accordion page. Two seasonal schedules (summer vs. academic year). | Semester + summer |
| **Disability Services** | [health.columbia.edu/content/hours-and-locations](https://www.health.columbia.edu/content/hours-and-locations) | Same accordion page. Weekdays 9-5. | Rarely changes |
| **SVR** | [health.columbia.edu/content/hours-and-locations](https://www.health.columbia.edu/content/hours-and-locations) | Same accordion page. Varying drop-in hours. | Semester |
| **Immunization Compliance** | [health.columbia.edu/content/hours-and-locations](https://www.health.columbia.edu/content/hours-and-locations) | Same accordion page. Weekdays 9-5. | Rarely changes |

### Key observations

- **Five of eight venues** (Medical, CAPS, Disability, SVR, Immunization) share a single source page on Columbia Health. One scrape covers all five.
- **Lerner Hall** hours live on the Lerner Hall site and change by semester/season. The operating-hours page has links to seasonal sub-pages, but the main page lists regular hours as plain text.
- **Bookstore** hours are on the Barnes & Noble college portal in a clean `<table>`.
- **Package Center** hours are the least structured — buried in a departments directory page. May need a fallback to static.

---

## Proposed Architecture

Follow the existing pattern (see `dining-hours.js`, `library-hours.js`):

```
Scraper (server) → /api/student-hours → student-hours.js (client hydration)
```

### 1. Server-side scraper

Two independent scrapers producing one combined snapshot:

#### a) Columbia Health scraper
- **Target:** `https://www.health.columbia.edu/content/hours-and-locations`
- **Method:** Fetch HTML, parse the `cu_accordion_item` elements.
- **Extract for each department:** name, hours (day → open/close intervals), seasonal date ranges, notes.
- **Map to venue IDs:** `medical`, `caps`, `disability`, `svr`, `immunization`
- **Challenges:**
  - CAPS has two seasonal schedules (summer vs. academic year) — scraper must extract date ranges or use the current one.
  - SVR has "varying" drop-in hours — may fall back to general weekday hours with a note.
  - Some departments show "Click here for current business hours" links to sub-pages. The scraper should follow those links for Medical, CAPS, and SVR if the accordion doesn't contain inline hours.

#### b) Lerner / Bookstore scraper
- **Lerner Hall:** Fetch `https://lernerhall.columbia.edu/content/operating-hours`, extract the "Regular Building Hours" text block. Parse day ranges + times (e.g., "Monday - Friday: 7:30am - 12:30am").
- **Bookstore:** Fetch the BN College location page, parse the `<table>` of day/hours rows.
- **Package Center:** Fetch the Lerner departments directory. If hours are not parseable, flag `useEmbeddedFallback: true` and use the hardcoded hours in the client.

### 2. Snapshot schema

```json
{
  "schemaVersion": 1,
  "source": "student-life-services",
  "generated": "2026-08-23T12:00:00Z",
  "venues": [
    {
      "id": "lerner",
      "name": "Alfred Lerner Hall",
      "sourceUrl": "https://lernerhall.columbia.edu/content/operating-hours",
      "hours": {
        "0": [["08:30", "00:30"]],
        "1": [["07:30", "00:30"]],
        "2": [["07:30", "00:30"]],
        "3": [["07:30", "00:30"]],
        "4": [["07:30", "00:30"]],
        "5": [["07:30", "00:30"]],
        "6": [["08:30", "00:30"]]
      },
      "note": "Times subject to change throughout the academic year.",
      "scrapeFailed": false
    },
    {
      "id": "bookstore",
      "name": "Columbia University Bookstore",
      "sourceUrl": "https://columbia.bncollege.com/...",
      "hours": { "0": [["11:00","17:00"]], "1": [["09:00","18:00"]], ... },
      "scrapeFailed": false
    },
    {
      "id": "package",
      "name": "Lerner Package Center",
      "useEmbeddedFallback": true,
      "fallbackReason": "hours-not-structured"
    },
    {
      "id": "medical",
      "name": "Medical Services",
      "sourceUrl": "https://www.health.columbia.edu/content/hours-and-locations",
      "hours": { "0": null, "1": [["09:00","17:00"]], ... , "5": [["08:00","16:00"]], "6": null },
      "note": "Check-in closes 30 min before closing.",
      "scrapeFailed": false
    }
  ]
}
```

### 3. Client-side module: `assets/student-hours.js`

Follow the `library-hours.js` pattern:

```
LionHourStudentHours.hydrate({ venues, fetchImpl, render, setStatus, today })
```

- Fetch `/api/student-hours`
- Validate snapshot schema (version, venue count, interval format)
- Map scraped hours onto the VENUES array, replacing the hardcoded values
- For `useEmbeddedFallback` venues, keep the existing hardcoded hours
- Call `render()` to re-draw
- Update the footer status indicator

### 4. Fallback strategy

| Condition | Behavior |
|---|---|
| API unreachable | Keep hardcoded hours; status = "fallback" |
| Scrape failed for one venue | That venue keeps hardcoded hours; others update; status = "partial" |
| `useEmbeddedFallback` flag | Keep hardcoded hours for that venue (Package Center default) |
| Schema validation fails | Reject entire snapshot; keep hardcoded; status = "fallback" |
| Snapshot too old (>7 days) | Use it but status = "stale" (these hours change at most a few times per semester, so a weekly threshold avoids false stale warnings if the scraper misses a run) |

---

## Implementation Order

1. **Columbia Health scraper** — covers 5 venues from 1 page, highest value.
2. **Bookstore scraper** — clean table structure, straightforward.
3. **Lerner Hall scraper** — plain-text parsing, needs seasonal logic.
4. **Package Center** — attempt scraping; default to `useEmbeddedFallback`.
5. **Client module** (`student-hours.js`) — validate + hydrate.
6. **Wire up** in `index.html` — add `<script src="assets/student-hours.js">` and call `hydrate()`.
7. **Remove `estimated: true`** flags once live data is flowing.

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Columbia Health redesigns the accordion markup | Scraper validates structure; fails gracefully to fallback. Health check alerts on consecutive failures. |
| CAPS seasonal schedule switch not detected | Scraper extracts date ranges from the page; falls back to the active schedule. |
| BN College portal blocks automated requests | Cache aggressively (hours change at most monthly). User-Agent spoofing or use a headless browser if needed. |
| Lerner Hall seasonal sub-pages not linked consistently | Scraper checks for "current" or latest-dated link; falls back to "Regular Building Hours." |
| Package Center hours unparseable | Already planned for `useEmbeddedFallback`. |

---

## Notes

### Columbia Health sub-page URLs

The main hours-and-locations page shows "Click here for current business hours" for three departments instead of listing hours inline. The scraper must follow these links as a second pass:

- **Medical Services:** [health.columbia.edu/content/medical-services](https://www.health.columbia.edu/content/medical-services)
- **CAPS:** [health.columbia.edu/content/individual-counseling](https://www.health.columbia.edu/content/individual-counseling)
- **SVR:** [health.columbia.edu/content/sexual-violence-response-columbia-university](https://www.health.columbia.edu/content/sexual-violence-response-columbia-university)

Disability Services and Immunization Compliance show hours inline on the accordion page and do not require a second fetch.

### Cross-midnight close times

Lerner Hall closes at 12:30 AM (`"00:30"`), which is a close time numerically earlier than the open time. The `CLOSE_TIME` regex accepts this, but the client-side validator must explicitly allow `close < open` for cross-midnight intervals rather than treating them as malformed. This parallels how `library-hours.js` special-cases Butler's 24-hour schedule.

### Staleness threshold

These hours change at most a few times per semester, unlike dining hours which can vary daily. A 7-day staleness threshold is appropriate — anything older shows status = "stale" but still renders. This avoids false stale warnings if the scraper misses a daily run, while still surfacing genuinely outdated data.

---

## Sources

- [Lerner Hall Operating Hours](https://lernerhall.columbia.edu/content/operating-hours)
- [Lerner Hall Building Hours](https://lernerhall.columbia.edu/building-hours)
- [Columbia Health Hours and Locations](https://www.health.columbia.edu/content/hours-and-locations)
- [Columbia Health Office Directory](https://www.health.columbia.edu/content/office-directory-and-hours)
- [Columbia Bookstore (BN College)](https://columbia.bncollege.com/webapp/wcs/stores/servlet/BNCBLocationAndContactView?catalogId=10001&langId=-1&storeId=45552)
- [Lerner Hall Departments Directory](https://www.columbia.edu/cu/lernerhall/departments/index.html)
- [Sexual Violence Response](https://www.health.columbia.edu/content/sexual-violence-response-columbia-university)
