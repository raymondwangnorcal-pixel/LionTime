# LionHour ad sales outreach — design

Status: proposed, nothing built. Decisions below are settled; open questions are in §7.

## 1. Settled decisions

| Decision | Choice |
| --- | --- |
| Sender | Raymond's personal Gmail, SMTP + app password |
| Volume | 20–30/day, weekdays |
| Send time | ~9:40 AM ET |
| Approval | Telegram, human-approved; nothing sends unattended |
| Scheduler | GitHub Actions (matches the seven existing workflows) |
| Prospects | Local businesses, discovered programmatically |
| Email discovery | Scrape each business's own contact page |
| Sequence | 3 touches: day 0, day 4, day 10 |
| Pricing | Tiered — flat monthly for small local, CPM for larger buys |
| Inventory | Build the on-site ad slot first, then sell against it |

## 2. Prerequisite: the ad slot does not exist

`index.html` contains no sponsor or ad markup. Before outreach ships, LionHour needs:

- A sponsored unit in the page (card in the library/dining grid, or a footer band).
- An impression counter, so CPM is measurable rather than asserted. Vercel Web
  Analytics counts pageviews, not slot impressions — those differ once the slot
  is below the fold. A `/api/impression` beacon writing to the existing Upstash
  Redis, mirroring `qr-tracker-store.js`, is the cheap version.
- A one-page media kit at `lionhour.com/advertise` the emails can link to.

Outreach without these is selling a promise. That's defensible for a founding-sponsor
discount, but the copy must say so plainly.

## 3. Pipeline

```
discover  ->  find-emails  ->  qualify  ->  [Redis: prospects]
                                                  |
                                     09:00 ET GH Action: generate drafts
                                                  |
                                     Telegram message per draft, approve/skip
                                                  |
                                   Vercel /api/outreach-callback -> Redis
                                                  |
                                     09:40 ET GH Action: send approved
                                                  |
                                        Gmail SMTP -> prospect
```

### 3.1 Discovery — `outreach/discover.mjs`

Use the **Google Places API**, not HTML scraping. Scraping maps.google.com breaches
Google's ToS and gets rate-limited fast; Places has a monthly free credit that
comfortably covers a few hundred lookups. Nearby Search around Morningside Heights
and the Upper West Side, filtered to relevant types (cafe, restaurant, bookstore,
gym, salon, pharmacy, print shop). Persists `placeId`, name, category, website, address.

### 3.2 Email discovery — `outreach/find-emails.mjs`

For each business website: fetch home, `/contact`, `/about`; extract `mailto:` hrefs
and text-matched addresses; rank a named address above `info@`/`hello@`. Expect
40–60% coverage. Respect `robots.txt`, 1 req/sec, identify in the User-Agent.
No-website and no-email businesses go to a `manual_review` bucket rather than being dropped.

### 3.3 State — Upstash Redis

Reuses the credentials the dining vote and QR tracker already use.

```
outreach:prospect:<id>    hash    name, email, category, website, status, touches, lastSentAt
outreach:queue:pending    zset    scored by next-eligible timestamp
outreach:draft:<date>:<id> hash   subject, body, approved
outreach:suppressed       set     replied, bounced, unsubscribed, manually excluded
```

### 3.4 Draft generation — `outreach/generate.mjs`

Pulls live figures from the Vercel Web Analytics endpoint already used by
`report-site-views.yml`, so every email quotes a current number rather than a
hardcoded one. Merges into a template chosen by business category. Personalization
is drawn only from stored fields — never invented. Any prospect missing a required
merge field is skipped, not sent with a blank.

### 3.5 Approval — Telegram

The 09:00 job posts one message per draft with inline `Approve` / `Skip` / `Edit`
buttons. Callback buttons need a listener, which GitHub Actions cannot provide, so
a new Vercel route `/api/outreach-callback` registers as the Telegram webhook and
writes the verdict to Redis. It authenticates via Telegram's
`X-Telegram-Bot-Api-Secret-Token` header and ignores any chat ID that isn't yours.

Default is skip. A draft with no verdict by 09:40 does not send.

### 3.6 Send — `outreach/send.mjs`

Gmail SMTP over an app password in GitHub secrets. 20–30/day sits far under Gmail's
500/day cap. Randomized 30–90s spacing between sends rather than a burst.

### 3.7 Reply detection

Before any follow-up touch, IMAP-check the thread. Any reply, bounce, or
auto-responder moves the prospect to `suppressed`. Bumping someone who already
replied is the fastest way to lose a local account.

## 4. Legal requirements — not optional

Commercial email is governed by CAN-SPAM regardless of sender or volume:

- Accurate From, To, and routing. No deceptive subject lines.
- A clear opt-out mechanism, honored within 10 business days.
- A valid physical postal address in every message.

Implementation: a `/api/unsubscribe?t=<token>` Vercel route writing to
`outreach:suppressed`, plus a footer address. **Decide what postal address to use** —
a home address is a real privacy cost, and Columbia's address is not yours to
use for a private venture. A cheap PO box or virtual mailbox is the normal answer.

## 5. Scheduling caveat

GitHub Actions cron is UTC and has no DST awareness. 9:40 AM ET is 13:40 UTC in
summer and 14:40 UTC in winter. Either run two crons guarded by a date check, or
accept a one-hour drift twice a year. Actions cron also drifts 5–15 minutes under
load; if 9:40 must be exact, the scheduler belongs on the Mac instead.

## 6. Build order

1. Ad slot + impression beacon + `/advertise` media kit page.
2. Redis schema, suppression list, unsubscribe route.
3. Discovery and email-finding, run manually, output reviewed by hand.
4. Templates, informed by the Spectator threads that earned replies.
5. Telegram approval loop, tested end to end with a single prospect.
6. Send path, first week capped at 5/day.
7. Follow-up sequencing and reply detection.

Nothing sends to a real prospect until steps 1–5 are verified.

## 7. Open questions

- Postal address for the CAN-SPAM footer.
- Flat-tier price point and CPM rate. Needs the traffic figure first.
- Does the Spectator have any claim or policy interest here, given LionHour serves
  the same campus audience they sell against? Worth checking before the first send.
- Ad slot design: does a sponsor card sit in the library grid, or is it a footer band?
