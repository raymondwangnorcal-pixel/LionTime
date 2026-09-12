# Outreach personalization v2 — deferred design change

Status: deferred and unapproved, recorded 2026-09-11. Not authorized for build.
Revisit only after the pilot review in
[the outreach plan](ad-sales-outreach-plan.md) build order, gates 7–8.

## 1. What ships today (v1)

Nothing varies per business except the business name and greeting. The generated
observation line described in earlier revisions of this document was removed on
2026-09-11 before it was built; effort moved to prospect discovery. Both the
observation line and the relevance line below are therefore future changes, and
the observation line's grounding rules — snippet must match stored page text, no
claims about customers or foot traffic, no generic fallback — apply to either if
personalization returns.

## 2. The proposed change

Add a second varying sentence — an audience-relevance line saying why a campus
library and dining hours audience is plausibly relevant to this kind of business.
Two custom sentences out of five instead of one.

## 3. When to reconsider

Not on a date. Only when pilot data exists and says something. Before deciding,
record from the pilot:

- first touches actually delivered, and replies, separated from bounces
- opt-outs and negative replies
- the operator's read on whether the drafts felt generic in review

The templates already treat response-rate claims as hypotheses to evaluate, not
established performance. A low reply count at five messages/day is directional at
best; do not read significance into a pilot-sized sample, and do not adopt this
change merely because the pilot underperformed an unstated expectation.

## 4. Constraints this change must satisfy

The relevance line is the single most likely place for the claims v1 deliberately
bans to creep back in — foot traffic, student clientele, proximity to campus,
busiest hours. It describes LionHour's audience and placement, never the
recipient's customers.

- **Pre-written, not model-generated.** Unlike the observation line, a relevance
  sentence cannot be grounded in the business's own page, because it is a claim
  about LionHour. So it must come from a small library of human-written, reviewed,
  dated sentences — one per business category — selected by a stored field. No
  model drafting for this line; that keeps its hallucination surface at zero.
- **Category must be verified and stored** at qualification, not inferred at draft
  time. Unknown or ambiguous category falls back to v1 and omits the line.
- **Every §2.1 prohibition still applies**, and the core weekly claim is still
  used once, verbatim, from its reviewed evidence record.
- **Word budget holds:** first touch stays under 150 words excluding the footer.
- **Library review is dated** and re-reviewed whenever the claim evidence changes.

## 5. Explicitly out of scope

- Varying the ask or offer by category — considered and declined when v1 was set.
- Varying the subject line. It stays `{{business_name}} <> LionHour Ads` on every
  touch.
- Any increase in daily volume. That is governed by the plan's pilot review.

## 6. Gates if it is ever adopted

1. Category sentence library written, reviewed, and dated.
2. Unknown/mismatched category demonstrably falls back to v1.
3. Word-count check enforced at draft generation.
4. Prohibited-claim checks extended to the new line.
5. Controlled test inbox pass before any real prospect sees it.
