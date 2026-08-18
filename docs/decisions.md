# Project Decisions

## DEC-0001 — Prioritize live availability in the campus mockup

- Date: 2026-08-16
- Owner: shared
- Status at record: active
- Decision: The campus mockup groups the all-category view by live availability and gives every card one next-action time summary before its daily and weekly hours.
- Rationale: Students should be able to determine whether a place is usable now or when it next opens with one quick scan.
- Scope: `mockup-campus.html` and its focused regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0002 — Minimize campus mockup scan noise

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: The campus mockup omits duration countdowns and duplicate status chrome, keeps caveats inside expanded weekly schedules, and excludes Wallach Art Gallery and Dodge Membership Office from the catalog.
- Rationale: The default view should make status, next time, and today's hours readable with minimal distraction.
- Scope: `mockup-campus.html` and its focused regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0003 — Provide feedback and About controls in the mockup header

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: The campus mockup header exposes the supplied Google Form through a Feedback link and an inline About disclosure with the user-provided project description.
- Rationale: Visitors need a lightweight way to send feedback and understand the project's purpose without adding page clutter.
- Scope: `mockup-campus.html` and its focused regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0004 — Treat expanded About content as a temporary overlay

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: The expanded About content is displayed above page content and closes on scrolling or a press outside the disclosure.
- Rationale: The description should be easy to inspect without blocking the availability list or remaining open after the visitor changes context.
- Scope: `mockup-campus.html` and its focused regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0005 — Use the rounded crown logo as the mockup favicon

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: The campus mockup uses the supplied crown logo as a project-local RGBA PNG favicon with rounded corners and transparent corner pixels.
- Rationale: The favicon should carry the requested visual identity while remaining legible in a browser tab.
- Scope: `assets/lionhour-favicon.png`, `mockup-campus.html`, and the favicon regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none

## DEC-0006 — Stack split operating intervals in the mockup

- Date: 2026-08-16
- Owner: user
- Status at record: active
- Decision: A place's multiple operating intervals for the same day are displayed on separate lines in both card and weekly schedule views.
- Rationale: Split schedules such as Ferris Booth Commons are more readable without comma-separated time ranges.
- Scope: `mockup-campus.html` and its Ferris rendering regression test.
- Implementation: pending
- Recorded against HEAD: `dc133f104490b4bd3aecc96847397232dec1b7d5`
- Supersedes: none
- Evidence: `docs/superpowers/specs/2026-08-16-campus-hours-layout-design.md`
- Privacy waivers: none
