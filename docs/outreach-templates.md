# LionHour outreach — postal address + persuasion structure

Companion to `ad-sales-outreach-plan.md`. Not legal advice.

## 1. The CAN-SPAM postal address

The FTC permits exactly three forms of address in a commercial email:

1. Your current street address.
2. A post office box you have registered with the USPS.
3. A private mailbox you have registered with a commercial mail receiving
   agency (CMRA) established under Postal Service regulations.

### Why the Columbia student mail center fails

**It is not on the list.** A student mailbox is campus mail provided by the
university incident to enrollment. It is not a USPS-registered PO Box held in
your name, and it is not a CMRA — CMRAs are commercial operators registered
under USPS rules, and opening a box at one requires PS Form 1583 plus two forms
of ID. Columbia's mail center is neither of those things, so it does not satisfy
the requirement even though physical mail reaches you there.

**It expires while your obligations don't.** You must honor opt-outs for as long
as you are sending, and the address in the message has to stay valid. A mailbox
tied to enrollment dies when you graduate, take a leave, or move off the
assignment. A dead address in a sent commercial email is a violation, and the
messages are already out there.

**It asserts a Columbia affiliation you don't have.** A footer reading
`2920 Broadway, Lerner Hall, New York, NY` tells a business owner they are
dealing with a Columbia entity. LionHour is your private venture. That runs at
the accurate-identification requirement, it implies an endorsement Columbia has
not given, and combined with a Columbia-adjacent product name it materially
strengthens any trademark or affiliation complaint the university might raise.

**It is very likely against Columbia policy.** Universities generally prohibit
using a university address, mail service, or name for private commercial
activity. Read Columbia's actual policy before assuming — but assume the answer
is no.

### What to use instead

| Option | Rough cost | Notes |
| --- | --- | --- |
| **CMRA / virtual mailbox** (iPostal1, Anytime Mailbox, PostScan, Stable) | ~$10–30/mo | **Recommended.** Explicitly permitted. Reads as a street address with a suite number, which looks far better in a B2B footer than a PO Box. Mail is scanned to an app. Needs PS Form 1583 + ID. |
| **USPS PO Box** | ~$50–150 / 6 mo in Manhattan | Cheapest fully compliant option. Downside: "PO Box 1234" in a sales email signals a one-person operation. |
| **Your home address** | Free | Compliant and honest, but it goes into hundreds of inboxes permanently and cannot be recalled. Bad trade for a student. |
| **LLC registered agent address** | Varies | Only worth it if you form an entity anyway. Note NY's LLC publication requirement runs well over $1,000 in NYC counties — premature at this stage. |

Verify current prices; they move.

## 2. Influence, applied — and where it turns into lying

Cialdini's seven principles, mapped to what you can *actually* claim today.

### Available to you now

**Unity** — the strongest lever you have, and the most honest. You are a Columbia
student emailing businesses whose customers are Columbia students. You are not a
vendor calling from outside; you are inside the same community they sell to.
Lead with this. It is true, it is unfakeable by your competitors, and it is the
whole reason a shop owner reads past line one.

**Authority** — not credentials, data. "3,400 students checked library hours here
last month" is authority. Your Spectator role would also be authority, but per the
earlier discussion it isn't yours to spend on this. The numbers are.

**Reciprocity** — give before asking. A genuinely free two-week placement, or an
unsolicited useful observation about their hours versus campus traffic patterns,
creates real obligation. A "free consultation" does not; everyone recognizes that
as a sales call.

**Liking** — specificity and a human voice. One true detail proving you have been
in their shop beats any amount of polish. Write like a person, not a media agency.

**Commitment and consistency** — do not ask for the sale in email one. Ask for a
micro-yes: "want me to send the one-page numbers?" A small yes makes the next one
much likelier. This is why the three-touch sequence works.

### Social proof and scarcity — make them true by construction

Both are legitimate here: the ad unit has a fixed slot count, so scarcity is a
real cap rather than a manufactured one, and the sponsor count becomes real as
soon as sponsors sign. The risk isn't the claim, it's drift — a template that
hardcodes a number keeps asserting it after it stops being accurate.

So neither line is ever written by hand. Both render from live Redis state, and
the generator omits the line rather than guessing when the data isn't there.

**Sponsor count** — from `outreach:sponsors:active`:

| Count | Rendered |
| --- | --- |
| 0 | line omitted entirely |
| 1 | `{{sponsor_name}} just came on as the first sponsor` |
| 2+ | `join {{n}} local businesses already on the site` |

**Slot availability** — from `slots_total` and `slots_sold`:

| State | Rendered |
| --- | --- |
| 0 sold | `I'm running {{slots_total}} spots this semester` |
| 1+ sold, some left | `{{slots_left}} of {{slots_total}} spots left` |
| 0 left | prospect is not contacted at all |

The distinction in the first row is the one that matters. "3 slots left" carries
an implicature that some were taken — if none have sold, it's literally true and
still misleading, and it's the kind of thing a shop owner asks about on a call.
"I'm running 4 spots this semester" makes the same scarcity point, is unambiguous,
and costs you nothing.

The general rule: a persuasion claim in the template must be backed by a field in
the prospect store. If the field is empty, the line is dropped. That way the email
cannot make a claim the system can't substantiate, and you never have to remember
to go update copy after a sponsor signs or churns.

## 3. Email skeleton

```
Subject:      lowercase, specific, no pitch, reads like a person wrote it
Line 1:       UNITY      — who you are, same community, no preamble
Line 2-3:     AUTHORITY  — the real number, stated plainly, once
Line 4-5:     LIKING     — one true, specific observation about their business
Line 6:       SCARCITY   — one placement, this semester (only if true)
Line 7:       RECIPROCITY + CONSISTENCY — free trial, micro-yes ask
Sign-off:     first name only
Footer:       postal address + one-click unsubscribe
```

Hard limits: under 150 words, one ask, one link maximum, no images, no attachment,
no HTML styling. Plain text from a Gmail address outperforms designed templates in
cold B2B and is far less likely to be filtered.

### Subject lines

Good — specific, low-pressure, no claim:
- `quick question about your sunday hours`
- `students checking if you're open at 10pm`
- `built a campus hours site — one question`

Avoid — these are the ones that get filtered and ignored:
- anything with `RE:` or `FWD:` on a first touch (deceptive under CAN-SPAM)
- `Partnership Opportunity`, `Advertising Inquiry`, `Quick Question` (capitalized)
- any subject containing a price, a percentage, or an exclamation mark

### Touch 1 — example

> Subject: students checking if you're open at 10pm
>
> Hi {{first_name}},
>
> I'm a Columbia student. I built lionhour.com — it's the site people here use to
> check whether Butler's still open or when Ferris stops serving. {{views_30d}}
> people used it last month.
>
> The pattern I keep seeing: traffic spikes around 10pm and Sunday afternoon,
> which is exactly when someone's deciding where to go. Right now the site tells
> them what's closed on campus. It doesn't tell them you're open.
>
> {{specific_observation}}
>
> I'm adding one sponsored spot this semester. Want to try two weeks free and see
> what it does? If nothing comes of it, no cost and we both learned something.
>
> Raymond
>
> {{postal_address}} · {{unsubscribe_link}}

`{{specific_observation}}` must come from stored data or your own note. If it's
empty, the prospect is skipped — never sent with a generic filler line.

### Touch 2 — day 4, reciprocity

Send something of value, don't re-ask. One line: here's what the traffic looked
like this week, here's the hour your block is busiest. Then a single sentence
returning to the offer. Under 60 words.

### Touch 3 — day 10, graceful close

The highest-reply message in most sequences is the one that lets them off the
hook. "Sounds like this isn't a fit right now — I'll stop here. If it changes,
you know where to find me." No guilt, no final-notice framing. Genuinely stop.

## 4. Suppression rules

Any reply, bounce, or auto-responder ends the sequence immediately. So does an
unsubscribe click, permanently. A business that says no goes on the suppression
list for the academic year — you have to live in this neighborhood.
