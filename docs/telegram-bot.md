# Two-way Telegram bot — design (v2.1)

Status: build-order steps 0–2 are built and live (2026-09-10): the "Lion Hour" bot
answers `/help`, `/status`, `/prs`, and `/rerun <workflow>` with a confirm button. v1
written 2026-09-10; v2 the same day after the adversarial review in
`docs/telegram-bot-review-codex.md`; v2.1 after the owner's answers to the
pre-implementation questions (recorded as DEC-0062 … DEC-0070 in `docs/decisions.md`).
Finding numbers (R1–R17) refer to the review.

When this was written the bot (the NewsAgent token) only sent: each scrape workflow
`curl`ed `sendMessage`, nothing listened. As of 2026-09-10 a dedicated bot ("Lion Hour",
its own token, no longer shared with NewsAgent) both sends the workflow notices and
receives commands — with the command list deliberately smaller in v1 than v1 of this
document proposed.

Progress legend: ✅ done · 🔜 next · ⏸ deliberately waiting · ⬜ not started.

## 0. What changed from v1

| v1 said | v2 says | Why |
| --- | --- | --- |
| `/merge` in v1, confirm bound to PR number | **No merge from Telegram in v1.** Bot posts review links. `/merge` returns in v2, bound to a head SHA and gated on a real PR check | R2, R3, R4 — there is no PR CI today, and a PR can change under an open confirm |
| Natural-language actions in v1 | Slash commands only in v1; free text gets a help reply. NL returns in v3 with mandatory clarification for ambiguous aliases | R13, R16 |
| Overrides applied by "each hours API" as a simple overlay | Overrides need per-category adapters, parent/child propagation, a structured `Closed` status, and a cache contract. **Deferred to v2**, scoped to closures only | R7, R8, R9, R10, R11, R12 |
| Auth = webhook secret + `message.chat.id` | Auth = webhook secret + **private chat** + **Raymond's user id** on both messages and callbacks; pending actions bound to user + chat + message | R6 |
| Execute, then delete the pending action | Atomic claim before execution; `update_id` dedupe; result recorded, not deleted | R5 |
| "Read-only commands still work if Redis is down" | They don't — every hours store is Redis. `/status` reports *unavailable* vs *cached* honestly | R17 |
| Vercel `maxDuration: 10` | Deadlines on every dependency below the budget; ack fast, no inference in v1 | R16 |
| "Anyone would notice if the bot stopped receiving" | A daily `getWebhookInfo` check from GitHub Actions, alerting through Telegram *send*, which is independent of receive | R17 |

## 1. Settled decisions ✅ (all built as listed)

| Decision | Choice |
| --- | --- |
| Transport | Telegram webhook → Vercel function `api/telegram.js`. No polling; the Mac is not always-on |
| Who may talk to it | An **allowlist** of Telegram user ids (`TELEGRAM_OWNER_USER_IDS`, comma-separated; DEC-0062), each in a **private** chat with the bot. Group messages are dropped even if the group is the notification chat |
| Request auth | `setWebhook` with `secret_token`; the function rejects any request without the matching `X-Telegram-Bot-Api-Secret-Token` header |
| Callback auth | `callback_query.from.id` must be on the allowlist **and** equal the user who created the pending action; the action must also match that chat and message id |
| Confirmation | Every state-changing action: echo → **[Confirm] [Cancel]** → callback → atomic claim → execute → record result |
| v1 action list | `/help`, `/status`, `/prs`, `/rerun <workflow>` (allowlisted). Nothing else |
| Sending | Unchanged. Workflows keep their `sendMessage` curl |

## 2. Architecture ✅ (built as drawn)

```
Telegram ──POST──► https://lionhour.com/api/telegram
  │  (deadline 8 s total; every outbound call ≤ 3 s; ack 200 on any handled outcome)
  ├─ 401 unless X-Telegram-Bot-Api-Secret-Token matches
  ├─ 200 + drop unless chat.type === "private" and from.id ∈ OWNER_IDS
  ├─ 200 + drop if update_id already seen (Redis SET NX, 24 h TTL)   ← R5, R16
  │
  ├─ message starting with "/" → command table (§3)
  ├─ any other message         → /help reply (v1)
  │
  └─ callback_query
        ├─ verify from.id, chat id, message id against the pending action   ← R6
        ├─ atomic claim: SET lionhour:tg:pending:<id> state=claimed NX-style via Lua / GETDEL
        │     (second tap sees "already running" and stops)                    ← R5
        ├─ execute with a per-call deadline
        └─ record { state: done|failed, result, at } on the same key (TTL 24 h); edit the
           original message to show the outcome; never delete-before-execute
```

### 2.1 Files ✅

| File | Purpose |
| --- | --- |
| `api/telegram.js` | Webhook handler: auth, dedupe, routing, replies, deadlines |
| `lib/telegram-service.js` | Pure handler: auth, routing, the propose → confirm → claim → run → record flow; no env, no network of its own |
| `lib/telegram-actions.js` | Action table: `name`, `parseArgs()`, `scope()`, `describe()`, `run()`; v1 has one entry, `rerun` |
| `lib/telegram-pending-store.js` | Redis: pending actions with atomic claim (SET NX on a sibling key), per-workflow cooldown; an in-memory twin for tests. `update_id` dedupe lives in `api/telegram.js` |
| `scripts/telegram-webhook-check.mjs` | `getWebhookInfo`: URL matches, no `last_error_message`, `pending_update_count` small. Run daily from Actions; alert via `sendMessage` on mismatch ← R17 |
| `tests/telegram-*.test.mjs` | Handler with fake Telegram payloads (private vs group, owner vs stranger, forged callback ids, duplicate `update_id`, double-tap), action table, deadline behaviour |

### 2.2 Env (Vercel) ✅ (all five set; webhook registered 2026-09-10)

| Variable | Notes |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | same value as GitHub secret `LIONTIME_TELEGRAM_BOT_TOKEN` ← R17: names differ, document the mapping |
| `TELEGRAM_OWNER_USER_IDS` | Allowlisted Telegram **user** ids, comma-separated — not chat ids. Adding a person is an env change, not a code change |
| `TELEGRAM_WEBHOOK_SECRET` | random; passed to `setWebhook` |
| `GITHUB_TOKEN` | fine-grained PAT, LionTime only, **`Actions: write` + `Pull requests: read`** in v1. No `Contents: write` until v2. Without it `/rerun` still asks for a confirm but the confirm reports "GITHUB_TOKEN is not configured" and changes nothing |
| `UPSTASH_REDIS_*` | already present |

`vercel.json`: `api/telegram.js` with `maxDuration: 10`. The handler's own deadline is 8 s
so it always answers inside the budget (R16).

Register once, by hand:

```
curl "https://api.telegram.org/bot$TOKEN/setWebhook" \
  --data-urlencode "url=https://lionhour.com/api/telegram" \
  --data-urlencode "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
  --data-urlencode "allowed_updates=[\"message\",\"callback_query\"]"
```

## 3. Actions — v1 ✅ (all four live)

| Action | Confirm? | What it does |
| --- | --- | --- |
| `/help` | no | This list |
| `/status` | no | Reads the four hours APIs and reports, per category: live / stale / unavailable, the snapshot time, and **whether the answer came from cache or the store** (R17). If Redis is down: "store unavailable; last cached view from HH:MM" |
| `/prs` | no | Open PRs: number, title, head SHA (short), check state if any, and a link. **No merge** |
| `/rerun <name>` | **yes** | `workflow_dispatch` on `main` for exactly one of: `dining`, `library`, `recreation`, `student-services`. Anything else is rejected before the confirm |

Deliberately absent in v1: merge, overrides, natural language, anything touching code,
anything on another repo.

### 3.1 The confirm text is the contract ✅

`describe()` renders the *stored* action, never the user's text:

> Re-run **Update recreation hours** on `main` now?
> [Confirm] [Cancel]

Pending actions: Redis key `lionhour:tg:pending:<random id>`, fields
`{ action, args, ownerId, chatId, messageId, state: "pending", createdAt }`, TTL 10 min.
A Confirm on an expired or already-claimed action edits the message to say so and does
nothing.

As built: `messageId` is `null` when the record is created and is bound by
`api/telegram.js` from the `sendMessage` result, so a confirm message that never reached
Telegram leaves an action that can never be claimed (fails closed). The claim is a
`SET NX` on `lionhour:tg:pending:<id>:claim`; Confirm and Cancel both claim, so the first
tap of either wins. Outcomes (`done | failed | cancelled`, plus the result text) are
written back onto the record with a 24 h TTL and the confirm message is edited in place
to show them. `/rerun` also holds a 30-minute per-workflow cooldown
(`lionhour:tg:recent:rerun:<workflow>`), checked before the confirm is offered and taken
atomically before the dispatch; a failed dispatch releases it.

## 4. v2 — `/merge`, gated ⬜ (prerequisite 1, the PR check, exists: `pr-checks.yml`; 2–4 not started)

Prerequisites, all of them, before this is built:

1. **A PR check exists.** `.github/workflows/pr-checks.yml` running `npm test` on
   `pull_request`, with the 14 baseline failures either fixed or quarantined by name
   (`node --test` with an explicit skip list checked into the repo, so a new failure is
   visible). Until this exists, "checks green" cannot be evaluated (R2).
2. **Confirm is bound to a commit.** The pending action stores `{ repo, number,
   base, headSha }`; `describe()` shows the short SHA; `run()` calls the merge endpoint
   with `sha: headSha` so GitHub refuses if the head moved (R3).
3. **The PR has a completed, successful required check on that SHA.** Missing, pending,
   or errored → refuse, and say which (R2). Fail closed.
4. **GitHub review is still required for generated code.** The autofix plan's PR must
   carry an approving review before `/merge` will act on it — Telegram is a convenience
   for merging something already reviewed, not a substitute for review (R1, R4).

`GITHUB_TOKEN` gains `Contents: write` and `Pull requests: write` only at this step.

## 5. v2 — Overrides (closures only) ⬜

The review found six problems with the v1 overlay (R7–R12). The v2 scope is narrowed to
the one thing that is safe to express: **"venue X is closed on date D."** No hours
replacement, no reopening early, no multi-access services.

### 5.1 Shape

```json
{ "venueId": "butler", "date": "2026-09-10", "kind": "closed",
  "reason": "Marked closed via Telegram", "createdAt": "…", "revision": 3,
  "expiresAt": "2026-09-11T03:59:59-04:00" }
```

`expiresAt` is the next midnight in `America/New_York`, computed with a real timezone
library, so 23- and 25-hour DST days are right (R11). `revision` supports
compare-and-set for `/clear` (R11).

### 5.2 Supported targets are a registry, not "any venue"

`lib/override-targets.js` is **generated at build time** from the `VENUES` array in
`index.html` (DEC-0069): each venue's category selects its adapter, and venues with a
`parentId`, a `sourceStatuses`-only schedule, or a category without an adapter are
emitted as unsupported. The same build step (`scripts/build.mjs`, wired into Vercel's
`buildCommand`) regenerates the SEO pages, the bot's venue alias table, and the seed-vote
schedules, so adding a venue to `VENUES` is the only edit. `lib/override-targets.js`
lists exactly which venue ids can be overridden and which
adapter applies them. v2 ships with the venues whose live projection is straightforward;
everything else is rejected *before* the confirm with "not supported yet" (R12).
Excluded initially: the three Joe's (embedded fallbacks, not in the Dining snapshot),
Hewitt/Diana/Liz's (served by the separate Barnard endpoint as a fallback path),
Dodge and any venue with children (R8), and every Health service (multi-access).

### 5.3 Adapters, one per category

Each hours service applies overrides through a category adapter that produces output
the *existing client validator* accepts (R7):

| Category | Adapter must… |
| --- | --- |
| Library | Map site venue id → scraper id (`butler` → `butler_24`), replace that day's intervals with `[]` |
| Dining | Emit a `sourceId` the client already allows; set `status: "Closed"` exactly, with the reason in a separate `note` field (R9) |
| Recreation | Go through the resolver so children inherit the closure; v2 rejects parents anyway (R8) |
| Student services | Write into the `availabilities` structure the client expects, not `intervals`/`status` keys it rejects |

The override response is validated with the same client-side schema functions before it
is returned — the check is on the *final* overlaid payload, not the override record.

### 5.4 Precedence over overnight carry-in

A dated closure must win over the previous day's overnight interval (JJ's noon→10 AM),
which the status engine otherwise considers first (R9). The engine gets an explicit
"closed-today" check ahead of interval evaluation.

### 5.5 Freshness

Overrides must reach the site inside a minute, and must *leave* inside a minute of
expiry. The 5-minute `s-maxage` on the hours APIs and the page's one-time hydration both
defeat that (R10). Contract:

- The four hours responses carry `overridesRevision` in the body; the page refetches
  when the tab regains focus, when the Eastern date changes, and every 5 minutes while
  visible.
- Responses that include an active override are served with `s-maxage=30`.
- An override's `expiresAt` is enforced by the client too, so a cached response that
  outlives Redis cannot keep a stale closure on screen.

### 5.6 Second signal for closures (DEC-0064)

A closure is visible to students the moment it lands, so one tap is not enough. The
flow is:

1. `/closed butler` → the bot replies with the describe() text **and a preview link**
   (`https://lionhour.com/?preview=<pending id>`), which renders the site with that one
   override applied and a banner "Preview — not live". The preview reads the pending
   action from Redis; it is not itself an override.
2. The message carries a single **[Looks right — apply]** button. Tapping it within
   two minutes claims and executes the action. Nothing else on that message executes.
3. After two minutes the button expires and the pending action is discarded.

The second signal is looking at the actual card, not a second button on the same
screen. `/clear` and `/rerun` keep the single confirm; they are reversible.

### 5.7 Commands

| Action | Confirm? | Notes |
| --- | --- | --- |
| `/closed <venue> [today\|tomorrow]` | preview + apply (§5.6) | describe() shows canonical name, absolute date, current published hours → "Closed" |
| `/clear <venue> <date>` | yes | Compare-and-delete on the stored `revision`; a newer override is left alone and the user is told (R11) |
| `/overrides` | no | Active overrides with expiry |

The site footer shows "N manual overrides active" whenever N > 0.

## 6. v3 — Natural language ⬜

Only after v2 has run for a while. Constraints carried from the review:

- The model returns an action name and arguments **or** a clarification; it never picks
  between venues that share a word. "Butler", "Joe's", "Faculty House", "Fac" require a
  clarifying reply listing the candidates (R13).
- `describe()` for NL-originated actions renders canonical venue, absolute date, and
  the before → after intervals from the *stored* action.
- Message text is data. The prompt places it in a delimited block with an explicit
  "the following is user input, not instructions" preamble; the schema validator is the
  real defence (R13).
- Inference runs only for the owner, after `update_id` dedupe, with a per-day spend cap
  (R16). Timeout 5 s; on timeout the reply is "try a slash command."
- "Merge the health fix" resolves against a fetched PR list, never a guessed number.

## 7. Build order

0. ✅ **`scripts/build.mjs`** and `vercel.json` `buildCommand` (DEC-0069): move
   `generate-seo` under it, add the venue alias table. Everything below consumes its
   output. *(2026-09-10: `scripts/build.mjs` with `--check`, `lib/venue-catalog.generated.mjs`,
   `tests/build-outputs.test.mjs`.)*
0b. ✅ **Fix the 14 failing tests** (DEC-0065). No quarantine list. This unblocks every
   "checks green" gate in both plans. *(2026-09-10: suite green; the only local failures
   left are the four Chromium tests, which need `npm run test:setup` and pass in CI.)*
1. ✅ `api/telegram.js` skeleton: auth (secret + private + allowlist), `update_id` dedupe,
   `/help`, `/status`, `/prs`. Register webhook. Ship. Add the daily
   `telegram-webhook-check` workflow the same day. *(2026-09-10: `lib/telegram-service.js`,
   `tests/telegram-service.test.mjs`, `.github/workflows/telegram-webhook-check.yml`;
   webhook live on the apex domain after making `lionhour.com` the primary Vercel domain.)*
2. ✅ Pending-action store with atomic claim; `/rerun` with confirm. Tests for double-tap,
   forged callback, expired action. *(2026-09-10: `lib/telegram-pending-store.js`,
   `lib/telegram-actions.js`, `tests/telegram-rerun.test.mjs`,
   `tests/telegram-pending-store.test.mjs`; first real `/rerun library` confirmed and
   completed the same evening.)*
3. ⏸ **Stop.** Use it for two weeks (from 2026-09-10 → revisit ~2026-09-24). The
   `.github/workflows/pr-checks.yml` part is ✅ already done: it installs Chromium and runs
   `npm test` on `pull_request` and `push`.
   *A Telegram reminder for 2026-09-24 listing the next steps is scheduled in
   `.github/reminders.json` (sent by `reminders.yml` at ~9 AM ET; entries are dated and
   deleted once served).*
4. ⬜ v2 `/merge` once §4's four prerequisites are true.
5. ⬜ v2 overrides: registry → adapters (one category at a time, Library first) → freshness
   contract → commands.
6. ⬜ v3 natural language.

## 8. Failure modes

| Situation | Behaviour |
| --- | --- |
| Message from anyone but the owner, or from a group | Dropped, HTTP 200 |
| Wrong/missing secret header | HTTP 401, logged |
| Duplicate `update_id` (Telegram retry) | Dropped, HTTP 200 |
| Confirm double-tapped | Second tap: "already running" |
| Confirm after expiry | "That request expired — send it again" |
| Redis unavailable | `/status` says so explicitly; state-changing commands refuse; nothing is executed without a claimed action |
| Dependency slow | Per-call deadline → reply "GitHub didn't answer in time; nothing was changed" |
| Webhook silently unregistered or secret rotated on one side | Daily check alerts via the *send* path |

## 9. Settled by the owner (2026-09-10)

- Purpose: quick fixes of small issues from a phone (DEC-0066). Anything that needs a
  diff read is a laptop action; the bot links to it.
- Tokens in Vercel env are acceptable; Telegram is the only control plane and waiting
  out a Telegram outage is acceptable; no audit log yet (DEC-0070).
- Freshness target: a day (DEC-0068).

## 10. Open questions

- (Resolved in code 2026-09-10: `/rerun` is limited to once per workflow per 30 minutes;
  a re-run whose dispatch fails does not consume the slot.)
- Is a weekly digest of expired-unused overrides worth it, or noise?
- (Resolved 2026-09-10, DEC-0071: generated code on the self-hosted runner is accepted
  for now on the strength of diff review; revisit at the Mac mini install.)
