# Dining source-retention implementation plan

**Goal:** Keep Dining hours available when one official Columbia page returns a managed security challenge, without bypassing the control or weakening validation.

## Contract

- Scrape the Locations feed, NSOP article, Labor Day article, and Fall article as four ordered source attempts.
- Classify a 403, 429, or recognized challenge page immediately as `challenge`; do not wait for content selectors or attempt circumvention.
- Publish successes and bounded failures in one strictly validated batch.
- Retain each source's last successful normalized payload independently in the existing Dining Redis key.
- Continue returning the existing public snapshot shape. Preserve a legacy public snapshot during migration until all four retained payloads have initialized.
- Resolve a new public snapshot from current-or-retained payloads only after validating both the incoming batch and merged state.

## Verification

- [x] Red test for immediate 403 detection without reading `#main-article`.
- [x] Red test for later-source continuation after one challenge.
- [x] Red test for staggered source initialization and total-outage retention.
- [x] Strict boundary validation for all four payload types and failure codes.
- [x] Focused Dining suite.
- [x] Full repository suite with unrelated failures reported separately.
- [x] Operations and decision documentation.

