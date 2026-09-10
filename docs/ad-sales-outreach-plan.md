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
| Sender | Raymond's personal Gmail, SMTP + app password; verify account access before implementation |
| Pilot | Five total messages/day maximum in week one, manually curated prospects |
| Later volume | 20–30 total messages/day on weekdays, including follow-ups; increase only after pilot review |
| Send window | Weekdays, 09:40–10:40 America/New_York |
| Approval | Telegram; explicit human approval of every touch and exact draft version |
| Scheduler | GitHub Actions with named timezone; delayed runs must respect the send window |
| Prospects | Local businesses; start with reviewed first-party sources, automate discovery after pilot |
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
  -> Gmail SMTP -> send ledger / reconciliation
```

### 3.1 Discovery and qualification

Pilot with a small, manually reviewed list of nearby cafes, restaurants,
bookstores, gyms, salons, pharmacies, and print shops. Store business identity,
canonical website, contact address, source URL, collection time, and qualification
notes. Prefer a verified owner/marketing contact or relevant published role inbox;
a named address alone is not evidence that the person handles advertising.

For email discovery, fetch the homepage and linked contact/about pages. Respect
robots.txt, identify the crawler, and limit requests to one per second per host.
Bound redirects, response sizes, and timeouts; block private/local network targets
on initial requests and redirects. No-email and uncertain matches require manual
review. Deduplicate by business identity and normalized email before enrollment;
shared inboxes must not receive parallel sequences from different location records.

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
| Prospect | Business ID, normalized contact, provenance, qualification, sequence state |
| Queue | Next eligible timestamp, prospect ID, touch number |
| Draft | Immutable version, recipient, subject/body, claim snapshot, content hash, expiry |
| Approval | Draft version/hash, approver user/chat IDs, verdict, timestamp |
| Send attempt | Unique prospect/sequence/touch key, claimed state, attempt ID, Message-ID, outcome, timestamps |
| Suppression | Normalized email and business scope, reason, source, timestamp |
| Claim | Exact wording, metric definition, evidence reference, reporting period, verification/review status |
| Campaign | Creative, dates, capacity/reservations, payment/trial state, reporting definition |

Define retention before rollout: expire unsent drafts and approvals after their
send window; retain only the minimum audit data needed for operations. Retain
minimal suppression identifiers while outreach remains active so rediscovery
cannot re-enroll opted-out contacts. Do not let campaign or prospect deletion
remove suppression protection.

### 3.3 Draft generation and approval

Generate from reviewed templates and verified stored fields. Use the core claim
verbatim once its evidence record has been reviewed. Missing required fields or
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
promise of deliverability. Validate Gmail SMTP and IMAP access in a controlled
mailbox test; account limits are ceilings, not a safe outreach-volume target.

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
3. Curate pilot prospects and verify first-party contact provenance by hand.
4. Build claim-aware templates and version-bound Telegram approval.
5. Build send ledger, atomic claims/caps, mailbox synchronization, and reply/bounce
   handling before any real prospect send. Keep follow-up automation disabled.
6. Exercise controlled test inboxes: edit-after-approval, duplicate callbacks,
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
