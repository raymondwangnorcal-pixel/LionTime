# Campus Hours Layout Design

## Goal

Let a student determine whether a campus place is usable now, and when it next changes state, without reading a full weekly schedule.

## Approved direction

Use a status-first, decision-first layout:

- The all-campus page groups results by `Open now`, `Closing soon`, and `Opens next` rather than by category.
- Category tabs remain available as a narrower view; status chips and search continue to refine either view.
- A card contains the place name, then one primary time message. The primary message is `Open until …`, `Reopens today at …`, `Opens tomorrow at …`, or `Open 24 hours` depending on the live state.
- The normal hours row is explicitly labelled `Today`. The expanded disclosure is labelled `Next 7 days` and retains the existing seven-day vertical schedule.

## State rules

| Live state | Primary label | Primary message |
| --- | --- | --- |
| Open | Open now | Open until `<time>` |
| Closing within one hour | Closing soon | Open until `<time>` |
| Closed after an earlier shift today | Closed | Reopens today at `<time>` |
| Closed before the first shift or on a later day | Closed | Opens `<day>` at `<time>` |
| Open for the entire current day | Open now | Open 24 hours |

The status label is text, so the meaning does not depend on color. Color is used only as a secondary scanning cue.

## Scope

This change is limited to `mockup-campus.html`. It does not revise venue data, source attribution, or the production `index.html`.

## Noise reduction adjustment

- Cards show the status and next opening or closing time, but never a remaining-duration countdown.
- The default page omits the mockup banner, aggregate status summary, and redundant status-filter controls. Search and category filters remain.
- Venue notes and estimated-hours notices appear only after expanding `Next 7 days`.
- Wallach Art Gallery and Dodge Membership Office are not included in the catalog. Chef Don's uses its shorter display name.

## Header links

- A `Feedback` link in the header opens the supplied Google Form in a new tab.
- An `About` link directly beneath it expands this message: `LionHour is an aggregator for building times at Columbia University. I created this because I was tired of parsing through all the random building links lol`.
- The expanded About panel is layered above the page and closes whenever the visitor scrolls, wheels, touch-scrolls, or presses outside it.

## Favicon

- The mockup uses the supplied crown logo as a project-local PNG favicon at `assets/lionhour-favicon.png`.
- The original artwork is preserved with a 16% rounded-corner mask and genuine transparent corner pixels.

## Split hours

- When a place has more than one interval on a day, each interval appears on its own line in both the card's Today row and the expanded seven-day schedule.
