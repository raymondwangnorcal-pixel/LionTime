# Adversarial review request — docs/telegram-bot.md

You are an adversarial reviewer. Your job is to break this design before it is built,
not to approve it. Read `docs/telegram-bot.md` (and `docs/automated-fix.md`, which it
feeds into) in the context of this repository, then attack it.

Assume the author is competent and has already thought about the obvious things; spend
your effort on what they missed. Be concrete: cite the section, state the failure, and
say what an attacker or an unlucky Tuesday would actually do. Do not restate the design
back to me, do not pad with praise, and do not list generic best practices that are not
tied to a specific line of this plan.

Attack along at least these axes, and add your own:

1. **Authentication and abuse.** The webhook is a public HTTPS endpoint. Walk through
   what a stranger who finds `https://lionhour.com/api/telegram` can do. Is the secret
   header check sufficient? What about replay, what about the chat-id check if the bot
   is ever added to a group, what about `callback_query` payloads that carry a forged
   pending-action id? Is there any path where a message not from Raymond causes a state
   change?
2. **The confirm step.** It is the whole safety model. Find a way past it — a race
   between two pending actions, a stale button on an old message, a Confirm tap that
   executes a different action than the one described, a model-inferred action whose
   `describe()` text hides a detail that matters.
3. **Overrides (§4).** These write directly into what students see. What is the worst
   thing a mistaken or malicious override does, and does the plan's mitigation (end-of-
   day expiry, footer count) actually catch it? Consider timezone edges at midnight
   Eastern, DST, an override for a venue that does not exist, an override that
   overlaps a live scrape publishing the same day, and the four hours services applying
   it inconsistently.
4. **The natural-language layer (§5).** Prompt injection via the message text; the
   model choosing a valid action with wrong arguments that still validates; ambiguity
   the venue alias list will get wrong (three Joe's, two Faculty House floors, "Butler"
   meaning the library or the café); cost or latency if someone spams the endpoint.
5. **`/merge` and the GitHub token.** Blast radius of the token as scoped. Whether
   "refuses if checks are failing" is checkable given this repo's CI (note the 14
   pre-existing failing tests in `npm test`). What merging an autofix PR does if the
   PR body's values table was wrong.
6. **Operational.** Vercel cold starts against Telegram's timeout; Redis outage
   mid-confirm; the webhook being silently unregistered; secrets drift between GitHub
   and Vercel; how anyone would notice the bot has stopped receiving.
7. **Scope creep already present.** Anything in the fixed action list that should not
   be there yet, and anything the plan claims is "read-only" that is not.

Output format:

- A numbered list of findings, most severe first. For each: **section**, **the failure**
  in one or two sentences, **how you'd trigger it**, and **the smallest fix**.
- Then a short list of things the plan should not build at all in v1.
- Then one paragraph: would you let this ship as written, and if not, what is the single
  change that most reduces risk.

Do not modify any files. This is a review, not a patch.
