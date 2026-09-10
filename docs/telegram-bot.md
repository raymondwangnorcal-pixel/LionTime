# Two-way Telegram bot — design

Status: proposed, nothing built. Written 2026-09-10.

Today the bot (the NewsAgent token) only sends: each scrape workflow ends by `curl`-ing
`sendMessage`. Nothing listens. This plan makes the same bot receive messages from
Raymond and act on a short, fixed list of things — merging a LionHour PR, marking a
building closed when the live data is wrong, re-running a scrape — with a confirmation
tap before anything changes.

## 1. Settled decisions

| Decision | Choice |
| --- | --- |
| Transport | Telegram webhook → Vercel function `api/telegram.js` (no always-on process; the Mac is not one) |
| Who may talk to it | Exactly one chat id (`TELEGRAM_CHAT_ID`); everything else is dropped silently |
| Request auth | `setWebhook` with a `secret_token`; the function checks `X-Telegram-Bot-Api-Secret-Token` on every call |
| Confirmation | Every action that changes anything is echoed back with **[Confirm] [Cancel]** inline buttons; only the callback executes it |
| Parsing | Slash commands for the common cases; natural language via the Claude API for the rest, always producing a structured action, never executing |
| Action list | Fixed and short (§3). The model chooses *among* them; it cannot invent new ones |
| Overrides | Stored in Upstash Redis (already a dependency), applied by the hours APIs, and **self-expiring** |
| Sending | Unchanged. The workflows keep their `sendMessage` curl; the same token now also receives |

### Why the list of actions is fixed

Every action the bot can take is an action a stolen phone can take. The chat-id check
and the confirm tap limit *who* and *when*; the fixed list limits *what*. Adding an action
is a code change and a conscious decision, not a prompt tweak.

## 2. Architecture

```
Telegram ──POST──► https://lionhour.com/api/telegram
                      │
                      ├─ reject unless secret header matches
                      ├─ reject unless message.chat.id === TELEGRAM_CHAT_ID
                      │
                      ├─ callback_query (a button tap)
                      │     └─ look up pending action by id in Redis → execute → reply with result
                      │
                      └─ message
                            ├─ starts with "/"  → command table (§3)
                            └─ anything else    → Claude API → { action, args } or { clarify }
                                                  → store as pending in Redis (10-min TTL)
                                                  → reply "Did you mean …?" [Confirm] [Cancel]
```

Read-only actions (`/prs`, `/status`) reply immediately with no confirm step.

### 2.1 Files

| File | Purpose |
| --- | --- |
| `api/telegram.js` | Webhook handler: auth, routing, replies |
| `lib/telegram-actions.js` | The action table: name, args schema, `run()`, `describe()` for the confirm text |
| `lib/telegram-intent.js` | Natural-language → action via the Claude API; the venue list and action list are the only context it gets |
| `lib/hours-override-store.js` | Redis-backed overrides (§4) |
| `api/overrides.js` | Read/write overrides (authenticated with the existing update secret; the bot calls it in-process) |
| `tests/telegram-*.test.mjs` | Handler with a fake Telegram payload, action table, intent parsing with a stubbed model |

### 2.2 Env (Vercel)

| Variable | Notes |
| --- | --- |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | same values as the GitHub secrets |
| `TELEGRAM_WEBHOOK_SECRET` | random string; passed to `setWebhook` |
| `GITHUB_TOKEN` | fine-grained PAT, LionTime repo only: *Contents: write*, *Pull requests: write*, *Actions: write* |
| `ANTHROPIC_API_KEY` | natural-language step only |
| `UPSTASH_REDIS_*` | already present |

The webhook is registered once, by hand:

```
curl "https://api.telegram.org/bot$TOKEN/setWebhook" \
  --data-urlencode "url=https://lionhour.com/api/telegram" \
  --data-urlencode "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  --data-urlencode "allowed_updates=[\"message\",\"callback_query\"]"
```

`vercel.json` gets an entry for `api/telegram.js` with `maxDuration: 10`; the Claude call
is the only slow step and stays well inside that.

## 3. Actions

| Action | Trigger | Confirm? | What it does |
| --- | --- | --- | --- |
| `prs` | `/prs` | no | Lists open PRs with number, title, and CI state |
| `merge` | `/merge 14`, "merge the health fix" | **yes** | `PUT /repos/…/pulls/14/merge` (squash). Refuses if checks are failing |
| `override` | "Butler is closed right now", "JJ's closes at midnight tonight" | **yes** | Writes an override (§4). Default expiry: end of today, Eastern |
| `clear` | "Butler is open again", `/clear butler` | **yes** | Removes an override early |
| `status` | `/status` | no | The four footer lines from the live site: what is live, stale, or unavailable |
| `rerun` | `/rerun dining`, "re-run the recreation scrape" | **yes** | `POST …/actions/workflows/<file>/dispatches` |
| `help` | `/help` or anything unparseable | no | The list above |

Not on the list, on purpose: editing code, changing venue definitions, touching secrets,
anything on a repo other than LionTime. The autofix plan (`docs/automated-fix.md`) adds one
message type — an autofix PR notification with a [Merge] button — which is just `merge`
with the number pre-filled.

### 3.1 The confirm text is the contract

Whatever the model inferred is rendered by the action's `describe()` and sent back before
anything runs:

> Mark **Butler Library** as *Closed* until **11:59 PM tonight**?
> Reason: "actually closed right now"
> [Confirm] [Cancel]

If the model misread the venue or the time, this is where it shows. Pending actions live
in Redis keyed by a random id, expire in 10 minutes, and are deleted on execute — a
[Confirm] tap on a stale message does nothing.

## 4. Overrides

The one piece of new plumbing. Today manual overrides are hard-coded in
`lib/recreation-hours-manual-overrides.js` and need a commit; the bot needs a store.

### 4.1 Shape

```json
{
  "venueId": "butler",
  "date": "2026-09-10",
  "status": "Closed",
  "intervals": [],
  "reason": "Marked closed via Telegram",
  "createdAt": "2026-09-10T15:42:00Z",
  "expiresAt": "2026-09-11T03:59:59Z"
}
```

Redis key `lionhour:override:<venueId>:<date>`, with the Redis TTL set to `expiresAt` so
it disappears on its own. `intervals: []` means closed; a non-empty list replaces the day's
hours (for "closes at midnight tonight").

### 4.2 Applying it

Each hours API (`library`, `dining`, `recreation`, `student-services`) already builds a
per-day structure. On GET, the service reads active overrides for its venues and, for a
matching venue+date, replaces that day's `intervals` and sets `status` to the override
reason, tagged `sourceId: "manual-override"`. The client's existing status rendering then
shows it; the week view's `closedDayLabel()` already treats a status starting with
"Closed" as a genuine closure, so **Closed** displays without further changes.

The footer line gains a count: "1 manual override active" — so a forgotten override is
visible on the site itself, not only in Redis.

### 4.3 Expiry default

End of the current Eastern day. An override for tomorrow ("Butler is closed tomorrow for
the event") sets `date` to tomorrow and expires at the end of *that* day. Nothing persists
past the day it was for without being re-issued; a wrong override costs at most one day.

## 5. Natural-language step

A single Claude API call per free-text message. The prompt contains:

- the action table from §3 (names and argument schemas — not the code);
- the venue list from `index.html`'s `VENUES` (id + name + a few aliases: "JJ's",
  "Ferris", "Dodge");
- today's date and time in Eastern;
- the user's message.

The model returns JSON: `{ "action": "override", "args": { "venueId": "butler",
"status": "Closed", "until": "end-of-day" } }`, or `{ "clarify": "Which Joe's — NoCo,
Journalism, or Dodge?" }`. The handler validates the JSON against the schema before
storing it as pending. Anything that doesn't validate becomes a `/help` reply.

The model never sees a secret, never calls a tool, and never decides whether to execute.

## 6. Build order

1. **Webhook skeleton**: `api/telegram.js` with secret + chat-id checks, `/help`,
   `/status`, `/prs`. Register the webhook. Ship. (This alone is useful: status from your
   phone without opening the site.)
2. **`/merge` with confirm buttons** and the pending-action store. First real action;
   proves the callback path.
3. **Override store + API + application** in the four hours services, with `/clear`.
   Test by overriding a venue and watching the site.
4. **Natural-language layer** (`lib/telegram-intent.js`) with a stubbed-model test suite
   covering the sentences in §3.
5. **`/rerun`**, then hand the [Merge] button to the autofix plan.

Steps 1–2 are an evening. Step 3 is the largest because it touches all four services.

## 7. Failure modes and what happens

| Situation | Behaviour |
| --- | --- |
| Message from anyone but Raymond | Dropped; HTTP 200 so Telegram doesn't retry |
| Wrong or missing secret header | HTTP 401; logged |
| Model returns garbage | `/help` reply; nothing stored |
| Confirm tapped after 10 minutes | "That request expired — send it again" |
| Merge on a PR with failing checks | Refused with the check names |
| Redis unavailable | Read-only commands still work; changing commands reply "store unavailable" |
| Vercel cold start | Telegram waits up to ~60 s; fine |

## 8. Open questions

- Should `/merge` require the PR to carry an `autofix:` label, or is any open PR fair
  game? (Leaning: any PR, since Raymond is the only author.)
- Should overrides also post to the site's status footer as a dated note, or is the count
  enough?
- Is a weekly "you have N overrides that expired unused" digest worth it, or noise?
