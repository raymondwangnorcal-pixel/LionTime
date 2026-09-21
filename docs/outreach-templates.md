# LionHour outreach — messaging and templates

Companion to [the outreach plan](ad-sales-outreach-plan.md). Revised 2026-09-10.
These are drafts for individual human approval, not authorization to send.

## 1. Core selling language

**20,000 views per week on the site.**

Resolved 2026-09-12: the figure is reported by a third-party analytics platform.
See the plan, section 1.
Outreach copy says "views" (owner, 2026-09-20); the underlying metric is the
analytics platform's weekly site impressions figure — page views, not individual
students. If a prospect asks what "views" counts, say so plainly. Do not
substitute people, students, unique visitors, or guaranteed sponsor impressions. The weekly site figure is separate from
campaign-specific delivered impressions and clicks.

Keep the pitch direct: a Columbia student built a useful campus-hours site,
local businesses can buy a clearly labeled sponsored placement, and the owner can
review the placement and terms with one small next step. Do not invoke a Spectator
role or imply university endorsement. Only describe the sender as a student while
that remains accurate.

## 2. Claims and personalization

- Use the core claim once in the first email. Store its approved evidence snapshot
  with the draft; changed or unsupported evidence requires review.
- **No per-business personalization.** Every draft is identical except the
  business name and greeting. The generated observation line was removed on
  2026-09-11; effort moved to prospect discovery instead. Re-adding any varying
  sentence is a design change, tracked in
  [outreach-personalization-v2.md](outreach-personalization-v2.md).
- Never invent opening hours, customer behavior, or a prior visit. The one
  exception is touch 1's approved sentence that students are "looking for
  restaurants around campus" (owner, 2026-09-19); use it verbatim, and make no
  other claim about the recipient's customers or foot traffic.
- Do not assert 10 PM traffic spikes, Sunday peaks, or a business's busiest hour
  without specific supporting evidence. Site visits do not establish foot traffic.
- Mention sponsors only when currently active and approved for public reference.
  One active sponsor does not necessarily mean it is the first or recently joined.
- State available placement capacity only from current dated campaign/reservation
  records. Omit scarcity language when capacity is uncertain. No availability
  means pause new offers and review pending drafts.
- Treat claims about subject lines, plain text, or follow-up response rates as
  hypotheses to evaluate in the pilot, not established performance guarantees.

## 3. Email structure

Send every touch from `Raymond Wang <info@gaplesslabs.com>` (owner, 2026-09-19). Replies go
to the same mailbox, which the suppression checks must monitor.

Aim for under 150 words in the first touch and under 80 in follow-ups, excluding
the required footer. Every message is plain text only (owner, 2026-09-20): a
single text/plain body, no HTML alternative, no styling, no images and no
tracking pixels, so open and click tracking are deliberately unavailable. Use one
clear ask. Every touch uses the same subject line,
`{{business_name}} + LionHour` (owner, 2026-09-20), which names the sponsorship opportunity
honestly; do not vary it per touch. Keep links minimal. Every touch must identify the solicitation and carry the postal address
and opt-out footer. Do not manufacture reply-thread prefixes on first contact.

The templates below assume a verified business name, reviewed weekly claim,
stored student-reach figure, valid postal address, and the reply-based opt-out
footer.
Missing required fields block draft generation. Use a verified first name only
when available; otherwise the business-team greeting avoids guessing a person.

### Touch 1 — day 0

Owner-supplied copy, adopted 2026-09-11. Two figures are bound to stored records
rather than written into the template: see the notes below the block.

```text
From: Raymond Wang <info@gaplesslabs.com>
Subject: {{business_name}} + LionHour

Hi {{greeting_name}}!

I hope you're doing well! I'm Raymond Wang, a sales manager at Gapless Labs,
which runs LionHour, one of Columbia's most used websites that gets over 20,000
views a week.

We reach over {{students_reached}} students who would love {{business_name}}!
I'd love to help you get in front of them, and with the start of the semester,
we're offering ads for only $100 for a limited time. Two out of our four
allocated slots are already filled, and I'd love if {{business_name}} was the
third or fourth.

If you'd like more information or to set up a meeting, you can reach me anytime
at info@gaplesslabs.com!

Sincerely,
Raymond Wang
{{postal_address}}
If you'd rather not hear from me, just reply and let me know.
```

`{{greeting_name}}` is a verified first name where one exists, otherwise the
`{{business_name}} team` form, and the greeting ends with `!` (owner,
2026-09-20).

`{{students_reached}}` is 5,000 students (owner, 2026-09-20); record its analytics
source and reporting period before first send. It must come from a stored
analytics figure with a named source and reporting period, the same evidence requirement as the weekly
impressions claim. Unset means the draft does not generate. It is a distinct
metric from site impressions and must not be derived from them.

The slots sentence is fixed copy (owner, 2026-09-20): it is not generated from
campaign records and does not vary per draft. Two of four booked is the stated
position; revisit the wording by hand if that changes.

`{{total_slots}}` is 4 (owner, 2026-09-20) and comes from the configured placement
capacity, not the copy.

### Touch 2 — nominal day 4

```text
From: Raymond Wang <info@gaplesslabs.com>
Subject: {{business_name}} + LionHour

Hi {{business_name}} team,

Following up on the LionHour placement. Sponsors receive a report of their
placement's measured impressions and clicks, so you can review what it delivered.

Would you like the preview and terms?

Raymond
{{postal_address}}
If you'd rather not hear from me, just reply and let me know.
```

Reporting is manual: the sentence promises a report the owner compiles and sends
by hand, so only claim what the analytics platform can actually attribute.
Set real thread headers referencing the first sent message. Suppression and fresh
human approval are required, even if the recipient has not replied.

### Touch 3 — nominal day 10

```text
From: Raymond Wang <info@gaplesslabs.com>
Subject: {{business_name}} + LionHour

Hi {{business_name}} team,

I'll leave it here after this email. If a LionHour sponsored placement becomes
useful for {{business_name}}, you're welcome to reply whenever the timing fits.

Thanks,
Raymond
{{postal_address}}
If you'd rather not hear from me, just reply and let me know.
```

Stop after this touch. Do not automatically restart the sequence in another
campaign or academic year. Follow the plan's weekday and actual-send spacing rules.

## 4. Postal address and opt-out

**`{{postal_address}}` = `70 Morningside Dr, RZW2006 WBH, New York, NY 10027-7236`**
(owner-supplied 2026-09-12). It renders on one line in every footer. Draft
generation fails if the value is missing, as with any other required field.

This is a Columbia mail address. Owner confirms the assignment runs through the
end of next year, which covers the pilot and the first full campaign season. A
CAN-SPAM address must be current when the message is sent and reachable while
opt-out obligations run, so re-verify before any send after that date or after a
move, and pause outreach if it lapses. Verify that Columbia permits a mail address
assigned for residential or student use to appear as the business address of a
private commercial venture — owner confirmed this is fine (2026-09-19). Using
this address never implies Columbia sponsorship or endorsement.

**Opt-out is reply-based (owner, 2026-09-13).** No unsubscribe endpoint, token, or
link is built. Every footer instead carries `If you'd rather not hear from me,
just reply and let me know.` (owner, 2026-09-20) Commercial email still requires a working opt-out, so this line is the
mechanism and it only works if it is honored:

- Any reply asking to stop — "STOP", "unsubscribe", "remove me", or a sentence
  saying so — suppresses that contact immediately and cancels pending drafts.
- The sender mailbox must be monitored while outreach runs; an opt-out sitting
  unread in an inbox is not an honored opt-out.
- Suppression is permanent while outreach operates and survives campaign or
  prospect deletion, as in the plan.
- Opting out must never require anything of the recipient beyond that reply.

Every reply, bounce, or auto-response also stops the automated sequence.

[FTC commercial email guidance](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)
