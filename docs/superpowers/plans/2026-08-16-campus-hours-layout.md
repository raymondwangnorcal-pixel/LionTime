# Campus Hours Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the campus mockup prioritize a place's next time-relevant action and group the all-campus view by live availability.

**Architecture:** Keep the mockup as one self-contained HTML file. Enrich the existing status result with structured event data, derive a small card time-summary view model from it, and use a `timeGroups` helper only for the all-category view. A Node test evaluates the real embedded script in a sandbox and asserts those view-model contracts against the venue fixture data.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js built-in `node:test` and `node:vm`.

## Global Constraints

- Change only `mockup-campus.html` and new mockup-specific tests and documentation.
- Preserve the existing Eastern Time, overnight-hours, search, category, and status-filter behavior.
- Do not modify the unrelated working-tree edits in `index.html` or `scrape.py`.
- Do not add dependencies.

---

### Task 1: Specify the time-summary and grouping contracts

**Files:**
- Create: `tests/mockup-campus.test.mjs`
- Read: `mockup-campus.html:494-797`

**Interfaces:**
- Consumes: the embedded `VENUES` data, `getStatus(venue, now)`, and `todayHoursText(venue, now)`.
- Produces: test expectations for `primaryTimeSummary(venue, now)` and `timeGroups(venues, now)`.

- [x] **Step 1: Write the failing tests**

```js
test('reports all-day access as Open 24 hours', () => {
  const butler = api.VENUES.find(({ id }) => id === 'butler');
  assert.equal(api.primaryTimeSummary(butler, { dow: 1, mins: 600 }).headline, 'Open 24 hours');
});

test('reports a same-day break as a reopening', () => {
  const pool = api.VENUES.find(({ id }) => id === 'uris-pool');
  assert.equal(api.primaryTimeSummary(pool, { dow: 1, mins: 870 }).headline, 'Reopens today at 7 PM');
});

test('groups the all-campus list by live availability', () => {
  const groups = api.timeGroups(api.VENUES, { dow: 1, mins: 1335 });
  assert.deepEqual(groups.map(({ id }) => id), ['open', 'closing-soon', 'closed']);
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: FAIL because `primaryTimeSummary` and `timeGroups` are not exported from the embedded mockup script.

- [x] **Step 3: Add the smallest script helpers**

```js
function primaryTimeSummary(venue, now) {
  const status = getStatus(venue, now);
  const todayHours = todayHoursText(venue, now);
  if (status.event === 'close') {
    if (status.status === 'open' && todayHours === 'Open 24 hours') {
      return { state: 'open', label: 'Open now', headline: 'Open 24 hours', detail: '' };
    }
    const dayOffset = Math.floor(status.eventAt / 1440);
    const closeDay = dayOffset > 0 ? `${DAY_NAMES[(now.dow + dayOffset) % 7]} at ` : '';
    return {
      state: status.status,
      label: status.status === 'closing-soon' ? 'Closing soon' : 'Open now',
      headline: `Open until ${closeDay}${fmt12(status.eventAt)}`,
      detail: `${fmtDuration(status.minutesUntil)} left`,
    };
  }
  if (status.event === 'open') {
    const reopenedToday = status.dayOffset === 0
      && dayHours(venue, now.dow).some(interval => toMin(interval[0]) < now.mins);
    const day = status.dayOffset === 0 ? 'today'
      : status.dayOffset === 1 ? 'tomorrow'
      : DAY_NAMES[(now.dow + status.dayOffset) % 7];
    return {
      state: 'closed',
      label: 'Closed',
      headline: `${reopenedToday ? 'Reopens' : 'Opens'} ${day} at ${fmt12(status.eventAt)}`,
      detail: `in ${fmtDuration(status.minutesUntil)}`,
    };
  }
  return { state: 'closed', label: 'Closed', headline: 'No upcoming hours', detail: '' };
}

function timeGroups(venues, now) {
  const groups = [
    { id: 'open', title: 'Open now', status: 'open' },
    { id: 'closing-soon', title: 'Closing soon', status: 'closing-soon' },
    { id: 'closed', title: 'Opens next', status: 'closed' },
  ];
  return groups.map(group => ({
    ...group,
    venues: venues.filter(venue => getStatus(venue, now).status === group.status),
  })).filter(group => group.venues.length);
}
```

- [x] **Step 4: Run the test to verify it passes**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: PASS with three passing subtests.

- [x] **Step 5: Preserve the test and source changes without committing**

The user did not request a Git commit and the worktree has unrelated user changes. Leave the changes unstaged and report their paths.

### Task 2: Apply the decision-first card layout and time-grouped all-campus view

**Files:**
- Modify: `mockup-campus.html:175-256, 658-745, 784-790`
- Test: `tests/mockup-campus.test.mjs`

**Interfaces:**
- Consumes: `primaryTimeSummary(venue, now)` returning `state`, `headline`, and `detail`, plus `timeGroups(venues, now)` returning groups with `id`, `title`, and `venues`.
- Produces: a card with one primary status/time message and all-category sections named `Open now`, `Closing soon`, and `Opens next`.

- [x] **Step 1: Write the failing rendered-output assertions**

```js
assert.match(api.cardHTML(butler, { dow: 1, mins: 600 }), /Open 24 hours/);
assert.match(api.cardHTML(butler, { dow: 1, mins: 600 }), /Next 7 days/);
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: FAIL because the existing card does not contain the `Next 7 days` disclosure label.

- [x] **Step 3: Render the new hierarchy and responsive styles**

```html
<div class="card-time-summary open">
  <span class="time-state">Open now</span>
  <strong class="time-headline">Open 24 hours</strong>
</div>
<div class="card-hours"><span class="today-label">Today</span>…</div>
<button class="schedule-toggle" aria-expanded="false">Next 7 days <span>⌄</span></button>
```

- [x] **Step 4: Run all mockup tests**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: PASS with all card and grouping assertions passing.

- [x] **Step 5: Inspect the diff and leave it unstaged**

Run: `git diff --check -- mockup-campus.html tests/mockup-campus.test.mjs && git status --short`

Expected: no whitespace diagnostics; only the mockup, its test, and accompanying documentation are new or modified by this work.

### Task 3: Remove redundant time and interface noise

**Files:**
- Modify: `mockup-campus.html`
- Modify: `tests/mockup-campus.test.mjs`

**Interfaces:**
- Consumes: `primaryTimeSummary(venue, now)` and the `VENUES` fixture.
- Produces: one time headline per card, a smaller venue catalog, and a default view without duplicate status controls.

- [x] **Step 1: Write failing behavior tests**

```js
assert.match(api.cardHTML(dodge, { dow: 1, mins: 540 }), /Open until 10 PM/);
assert.doesNotMatch(api.cardHTML(dodge, { dow: 1, mins: 540 }), /left/);
assert.equal(new Set(api.VENUES.map(({ id }) => id)).has('wallach'), false);
assert.equal(api.VENUES.find(({ id }) => id === 'chefdons').name, "Chef Don's");
```

- [x] **Step 2: Run the test to verify it fails**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: FAIL because the existing card contains duration text and the requested records remain in `VENUES`.

- [x] **Step 3: Remove duration and redundant interface chrome**

Remove card duration output, the mockup banner, aggregate status summary, status-filter controls, and their unused script paths. Move venue notes into the expandable schedule and reduce the header to the title and minute-precision Eastern Time.

- [x] **Step 4: Remove and rename the requested catalog entries**

Delete the Wallach Art Gallery and Dodge Membership Office records, remove the now-empty Arts category, and rename `Chef Don's Pizza Pi` to `Chef Don's`.

- [x] **Step 5: Run mockup tests and inspect the worktree**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: PASS with six passing subtests and no duration copy in a standard open card.

### Task 4: Add compact header feedback and About controls

**Files:**
- Modify: `mockup-campus.html`
- Modify: `tests/mockup-campus.test.mjs`

**Interfaces:**
- Produces: a Feedback anchor that opens the supplied external form and a right-aligned About disclosure containing the supplied text.

- [x] **Step 1: Write and run the failing header-control test**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: FAIL because the Feedback anchor and About disclosure do not yet exist.

- [x] **Step 2: Add and verify the header controls**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: PASS with seven passing subtests.

### Task 5: Dismiss the About overlay on contextual interactions

**Files:**
- Modify: `mockup-campus.html`
- Modify: `tests/mockup-campus.test.mjs`

**Interfaces:**
- Produces: `configureAboutDismissal(about, eventTarget, scrollTarget)` to keep the overlay open only while the visitor stays within its context.

- [x] **Step 1: Write and run the failing dismissal test**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: FAIL because the dismissal controller does not exist.

- [x] **Step 2: Add and verify the overlay controller**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: PASS with eight passing subtests.

### Task 6: Add a rounded crown favicon

**Files:**
- Create: `assets/lionhour-favicon.png`
- Modify: `mockup-campus.html`
- Modify: `tests/mockup-campus.test.mjs`

**Interfaces:**
- Produces: an RGBA PNG favicon and an HTML `rel="icon"` link to the project-local asset.

- [x] **Step 1: Write and run the failing favicon test**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: FAIL because the document does not link the local asset and the asset is not RGBA.

- [x] **Step 2: Create and verify the favicon**

Run: `sips -g hasAlpha assets/lionhour-favicon.png && node --test tests/mockup-campus.test.mjs`

Expected: `hasAlpha: yes` and nine passing subtests.

### Task 7: Stack split daily hours

**Files:**
- Modify: `mockup-campus.html`
- Modify: `tests/mockup-campus.test.mjs`

**Interfaces:**
- Produces: HTML interval formatting that separates multiple ranges with `<br>` while retaining comma-separated plain text for status logic.

- [x] **Step 1: Write and run the failing Ferris rendering test**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: FAIL because split intervals render with commas.

- [x] **Step 2: Add and verify split-hour formatting**

Run: `node --test tests/mockup-campus.test.mjs`

Expected: PASS with ten passing subtests.
