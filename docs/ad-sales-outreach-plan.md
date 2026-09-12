# LionHour ad sales outreach — design

Status: revised 2026-09-10; planning only, outreach not built or enabled.

## 1. Decisions and selling proposition

**Core selling language: “20,000 impressions per week on the site.”**

Use this wording consistently in outreach and the media kit. This is the
user-supplied site audience figure, not a count of unique people or verified
students and not a guarantee that one sponsor receives 20,000 ad impressions.
Before first use externally, attach the measurement source, definition, and
reporting period to the claim record. The repository review did not independently
verify the figure. If later evidence no longer supports it, pause affected drafts
for review rather than silently changing approved copy or continuing a stale claim.

| Decision | Choice |
| --- | --- |
| Sender | `info@gaplesslabs.com`; confirm its mail provider and supported SMTP authentication before implementation |
| Pilot | Five total messages/day maximum in week one, manually curated prospects |
| Later volume | 20–30 total messages/day on weekdays, including follow-ups; increase only after pilot review |
| Send window | Weekdays, 09:40–10:40 America/New_York |
| Approval | Telegram; explicit human approval of every touch and exact draft version |
| Scheduler | GitHub Actions with named timezone; delayed runs must respect the send window |
| Prospects | Independent restaurants, cafes and bakeries with a verified address in Morningside Heights (W 110th–W 125th, Riverside–Morningside); no chains; other verticals and wider zones only after pilot review |
| Email discovery | Business-owned contact pages with source provenance and manual qualification |
| Sequence | Day 0, day 4, day 10, measured in calendar days from actual first send; weekend dates roll to Monday |
| Pricing | Flat monthly sponsorship for pilot; CPM deferred until billable impression measurement is verified |
| Inventory | Build and verify the on-site ad slot and media kit before outreach |

## 2. Inventory, measurement, and fulfillment

The reviewed site has no sponsor unit. Before outreach ships, build:

- A clearly labeled sponsored placement; choose the position and fixed capacity.
- `/advertise` with the core selling language, placement preview, trial terms,
  reporting description, and contact path.
- Campaign-specific impression and click reporting using the existing Upstash
  integration where suitable. The QR counter is a storage pattern, not a complete
  advertising measurement system.

Maintain separate site-audience and sponsor-delivery metrics. Define the site
impression metric and its source explicitly; do not rename pageviews as unique
visitors or infer student identity. The existing `report-site-views.yml` exposes
pageviews and visitors separately, but does not establish business foot traffic.

Proposed sponsor measurement: count a placement after at least 50% of its area is
visible for one continuous second in a visible browser tab; count once per
campaign/placement/page load. Validate campaign IDs and dates, deduplicate event
retries, rate-limit ingestion, exclude known bots and test traffic, and disclose
remaining measurement limitations. Store bounded aggregate reporting without
unnecessary personal data. Validate this before making CPM commitments; do not
claim audited or certified measurement.

For the pilot, define the flat fee and any two-week free trial before offering it.
Record trial start/end, paid start/end, approved creative and destination, placement
capacity, payment status, cancellation terms, and the person responsible for
activation and removal. A trial ends without automatic billing unless separately
agreed. Report delivered impressions and clicks; do not promise sales or visits.

Before CPM sales, additionally agree on billable event definition, reporting
period, invalid-traffic exclusions, delivery target, and underdelivery remedy.

## 3. Pipeline and state

```text
manual reviewed discovery -> first-party email discovery -> qualification
  -> Redis prospect + provenance
  -> 09:00 local draft generation -> Telegram review
  -> authenticated Vercel callback -> version-bound approval
  -> 09:40 local sender -> final eligibility checks -> atomic send claim
  -> sender mailbox SMTP -> send ledger / reconciliation
```

### 3.1 Discovery and qualification

**Target: independent restaurants in the Columbia area.** Both halves are
qualification criteria, checked by hand during the pilot and enforced in code
before discovery is automated.

*Geography.* Primary zone is Morningside Heights: W 110th to W 125th Street,
Riverside Drive to Morningside Drive, which is the walkable core for
undergraduates and where the Broadway and Amsterdam commercial strips sit. The
business must have a physical street address inside that zone, verified from the
business's own site rather than a directory listing. Secondary zones — W 96th to
W 110th, and the Manhattanville/West Harlem blocks around W 125th to W 135th —
open only after the pilot review. Record the zone on the prospect so list
composition stays auditable.

*Vertical.* Restaurants first: sit-down restaurants, quick-service, cafes,
bakeries, and delis. Bookstores, gyms, salons, pharmacies, and print shops are
deferred to a later phase and should not be mixed into the pilot, because a
single vertical makes the pilot's reply rate interpretable.

*Exclusions.* Skip national and regional chains whose advertising is bought
centrally; a corporate marketing inbox cannot authorize a campus sponsorship and
should not receive sequence mail. Prefer owner-operated businesses with at most
three locations and an identifiable local decision-maker. Skip businesses with no
first-party website, permanently closed listings, and any address that cannot be
confirmed as current. Delivery-platform pages and aggregator listings are not
first-party sources.

Note that a restaurant's relevance to a campus-hours audience is a hypothesis the
pilot exists to test, not an established fact, and never a claim in an email.
Students checking dining hall hours may or may not be deciding where to eat off
campus; nothing in the site's data establishes it.

Store business identity,
canonical website, contact address, source URL, collection time, and qualification
notes.
Prefer a verified owner/marketing contact or relevant published role inbox;
a named address alone is not evidence that the person handles advertising.

Implemented in `scripts/discover_prospects.py` (tests in
`tests/test_discover_prospects.py`): it seeds from OpenStreetMap via the Overpass
API — free, keyless, and outside the Places terms questions below — bounded to the
zone bbox, then enriches each candidate from its own site and writes
`data/outreach/prospects.csv` sorted ready / review / excluded. It writes no
Redis state and sends nothing; every row still needs manual qualification.

For email discovery, fetch the homepage and linked contact/about pages. Respect
robots.txt, identify the crawler, and limit requests to one per second per host.
Bound redirects, response sizes, and timeouts; block private/local network targets
on initial requests and redirects. No-email and uncertain matches require manual
review.

**Identity and normalization.** Deduplicate by business identity and normalized
email before enrollment. Business identity is the pair (normalized name,
normalized street address): lowercase, strip diacritics and punctuation, collapse
whitespace, drop legal suffixes (llc, inc, corp, co, ltd) and a leading article,
and expand or contract street abbreviations consistently (st/street, ave/avenue,
w/west). Normalize email by trimming, lowercasing local and domain parts,
converting IDN domains to punycode, and stripping plus-tags on providers that
support them. Store both the raw and normalized forms; dedupe, suppression, and
sequencing all key off the normalized value.

Two records are the same business when the normalized street address matches and
either the normalized name or the registrable domain matches. Anything weaker —
same name at a different address, same domain with different names, a fuzzy name
similarity — goes to manual review and is never auto-merged. A wrong silent merge
loses a prospect; a wrong silent split mails someone twice, so neither is resolved
by a similarity threshold alone.

**One sequence per contact address.** The sequencing unit is the normalized email,
not the business. The first qualified record to claim an address owns the
sequence; other records resolving to the same address are linked to it as
additional locations, marked blocked by shared contact, and never enrolled
separately. This covers the common case of one owner running several restaurants
in the zone behind a single role inbox. Treat a shared registrable domain with a
generic role inbox (info@, hello@, contact@) as one contact. An address that has
completed a sequence is not re-enrolled for a different location, campaign, or
academic year; pitching a second location is a manual reply on the existing
thread, not a new automated sequence.

Do not assume Google Places results can be persisted as a prospect database.
Before adding Places, verify the intended use, permitted fields, retention, and
attribution against current terms. Place IDs have a storage exception; other
returned content has restrictions. Keep field-level source provenance and only
retain independently collected first-party facts or data whose retention is
permitted. Budget by requested SKU/field mask and enforce request quotas; monthly
per-SKU free usage thresholds replaced the old monthly credit.

### 3.2 Redis model

Use a dedicated outreach namespace. Keep credentials server-side and avoid
logging email bodies, addresses, tokens, or mailbox contents. Review access scope
before reusing the site's Redis credentials.

| Record | Required information |
| --- | --- |
| Prospect | Business ID, normalized contact, provenance, qualification, vertical, street address, target zone, location count, sequence state |
| Queue | Next eligible timestamp, prospect ID, touch number |
| Draft | Immutable version, recipient, subject/body, claim snapshot, content hash, expiry |
| Approval | Draft version/hash, approver user/chat IDs, verdict, timestamp |
| Send attempt | Unique prospect/sequence/touch key, claimed state, attempt ID, Message-ID, outcome, timestamps |
| Suppression | Normalized email and business scope, reason, source, timestamp |
| Completed sequence | Normalized email, business ID, final touch sent, completion timestamp; blocks re-enrollment |
| Claim | Exact wording, metric definition, evidence reference, reporting period, verification/review status |
| Campaign | Creative, dates, capacity/reservations, payment/trial state, reporting definition |

**Retention and eviction.** Duplicate prevention lives entirely in Redis keys, so
a key that disappears is a safeguard that disappears silently. Configure the
instance with a no-eviction policy; an LRU or volatile eviction policy can drop a
send claim or a suppression entry under memory pressure and the system will then
re-mail someone with no error anywhere. Verify the policy before launch and again
after any plan or provider change.

Retention floors, none of which may be shortened by a TTL on a key that enforces
uniqueness:

| Record | Retention |
| --- | --- |
| Suppression | No expiry while outreach operates |
| Completed sequence | No expiry while outreach operates |
| Send attempt / claim | At least 180 days, well beyond the 10-day sequence span |
| Prospect | While the prospect remains in the pipeline |
| Draft and approval | Expire after their send window — the only records that should |

Do not let campaign or prospect deletion remove suppression or completed-sequence
protection. The sender's preflight already refuses to send when Redis checks fail;
extend that to confirming the eviction policy and that the suppression and ledger
namespaces are readable. Restoring an older snapshot can resurrect a state where
suppression has not yet been recorded, so a restore requires re-synchronizing
replies, bounces, and opt-outs from the mailbox before sending resumes.

### 3.3 Draft generation and approval

Generate from reviewed templates and verified stored fields. Use the core claim
verbatim once its evidence record has been reviewed. Drafts carry no
per-business personalization: every message is identical except the business name
and greeting. Adding any varying sentence is a design change, deferred to
[outreach-personalization-v2.md](outreach-personalization-v2.md). Missing required fields or
unverified claims block the draft. Optional social proof and availability claims
require current campaign evidence and must not be hardcoded.

Telegram displays the full recipient, subject, body, touch number, claim period,
and expiry, with Approve / Skip / Edit. Authenticate the webhook secret and
allowlist both the chat and acting user. Deduplicate callbacks and reject expired
or mismatched draft versions. Editing creates a new version and invalidates prior
approval. Each follow-up requires its own approval. No response means no send.

Approval must arrive by 09:40 local on the intended send date and expires at
10:40. Delayed drafting jobs do not shift the cutoff. Unsent or expired drafts
return to review for a later date; approval never carries over automatically.

### 3.4 Sending, retries, and suppression

Before every message, check the exact approval, expiry, global pause flag, daily
cap, campaign availability, suppression state, and fresh mailbox synchronization.
If Redis or mailbox checks fail, do not send. Recheck eligibility after any spacing
wait, immediately before claiming and sending the next message.

Use an atomic Redis transition to claim a unique prospect/sequence/touch. Only one
worker may claim it; overlapping scheduled and manual jobs must not duplicate
work. Reserve daily quota atomically, including follow-ups and uncertain attempts.
Record a stable outbound Message-ID and provider result. SMTP and Redis cannot
form one transaction: a timeout or crash after possible SMTP acceptance becomes
`unknown`, requiring reconciliation before any retry. Never automatically resend
an uncertain attempt; a Message-ID alone does not make SMTP idempotent.

Space messages 30–90 seconds apart within the window. This is pacing, not a
promise of deliverability. Send from `Raymond at LionHour <info@gaplesslabs.com>` and receive replies at
`info@gaplesslabs.com`. Validate the actual provider's SMTP authentication and
IMAP or supported mailbox API access in a controlled mailbox test. Do not assume
Gmail hosting or app-password support. Confirm domain sender authentication
(SPF, DKIM, and DMARC) before launch; provider limits are ceilings, not a safe
outreach-volume target.

Synchronize replies using stored Message-ID / In-Reply-To / References and mailbox
identifiers. Parse delivery failures to identify the original recipient; uncertain
matches require review. Any reply, bounce, auto-response, manual exclusion, or
unsubscribe blocks further sequence messages and cancels pending drafts. Preserve
an explicit opt-out indefinitely while outreach operates; do not expire it at the
end of the academic year. A reply from another address needs manual association.

No catch-up bursts or compressed touches after missed jobs. Require at least four
days after the first actual send and six days after the second actual send before
the next touch, also respecting the day-4/day-10 nominal dates and weekdays.

## 4. Commercial email requirements

Before first outreach, verify that every template includes accurate sender and
subject information, clear identification of the sponsorship solicitation, a
valid physical postal address, and an easy opt-out. Keep the opt-out mechanism
working for at least 30 days after each send and honor requests within 10 business
days; this system should suppress immediately.

Use an opaque, unguessable unsubscribe token with no raw email in the URL. Opt-out
must not require login, payment, or extra personal information. Repeated requests
are safe. Honor opt-outs received by reply as well as the unsubscribe route.

Choose an address meeting the FTC's criteria: current street address, registered
USPS PO box, or qualifying registered private mailbox. Verify actual eligibility
and permission before using any university or registered-agent address; neither
blanket acceptance nor blanket rejection follows from the address label alone.
Do not imply Columbia or Spectator sponsorship or endorsement.

## 5. Scheduling

Use GitHub Actions schedules with `timezone: America/New_York`: weekday drafting
at 09:00 and sending at 09:40. GitHub supports named timezones and DST adjustment.
Scheduled runs can be delayed or dropped, so enforce local dates, cutoffs, and the
send window in application code. Provide a manual dry-run mode and global pause;
manual production runs obey the same approval and deduplication rules.

## 6. Build order and verification gates

1. Define placement, pilot price/trial terms, postal address, and evidence for
   “20,000 impressions per week on the site.” Build the slot and media kit.
2. Build Redis state, durable suppression, unsubscribe, pause, and campaign state.
3. Curate pilot prospects — independent Morningside Heights restaurants only —
   and verify address, independence, and first-party contact provenance by hand.
4. Build claim-aware templates and version-bound Telegram approval.
5. Build send ledger, atomic claims/caps, mailbox synchronization, and reply/bounce
   handling before any real prospect send. Keep follow-up automation disabled.
6. Exercise controlled test inboxes: edit-after-approval, duplicate callbacks, two locations behind one role inbox,
   re-enrollment of a completed sequence, evicted or expired claim key,
   concurrent jobs, expired approval, opt-out after approval, failed mailbox sync,
   ambiguous SMTP outcome, reply/bounce suppression, and delayed schedules.
7. Launch the approved pilot at at most five total messages/day. Review delivery,
   replies, opt-outs, trial uptake, paid conversion, and operator effort.
8. Enable follow-up scheduling only after suppression and timing tests pass;
   increase volume or automate discovery only after pilot review.

No real prospect sends until gates 1–6 pass. No automatic volume increase.

## 7. Open questions

- What source, event definition, and reporting period substantiate the weekly figure?
- Which valid postal address will be used?
- Where does the sponsored placement sit, and how many campaigns can run at once?
- What are the flat fee, trial capacity, and campaign/cancellation terms?
- Are there applicable Columbia or Spectator policies affecting this private venture?
- What retention periods and access scopes are appropriate for prospect and audit data?

## 8. References checked during review

- [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Maps pricing changes](https://developers.google.com/maps/billing-and-pricing/march-2025)
- [FTC CAN-SPAM business guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
- [GitHub scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
