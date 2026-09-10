# Automated parser fixes — design

Status: proposed, nothing built. Written 2026-09-10 after four parser breaks in one week
(Barnard gym, Dining locations feed, Health, Mail), all caused by Columbia pages rolling
over to their Fall 2026 wording. Each fix took the same shape by hand: fetch the live page,
run the parser against it, patch the parser, save the page as a fixture, add a test, commit.
This plan automates that loop — up to, but not including, the merge.

## 1. Settled decisions

| Decision | Choice |
| --- | --- |
| Output | A pull request, never a push to `main` |
| Reviewer | Raymond, from the Telegram link, usually on a phone |
| Trigger | A `parse` or `missing-content` failure inside a scrape workflow — not the Telegram message |
| Evidence | The failing page is saved as a workflow artifact and handed to the fixer verbatim |
| Fixer | Claude Code GitHub Action (`anthropics/claude-code-action`) |
| Dedupe | One open autofix PR per source; a persistent failure does not retry every 4 hours |
| Scope of edits | Parser + fixture + test for the one failing source; nothing else |
| Arming | Dry-run via `workflow_dispatch` against a captured page before the trigger is enabled |

### Why a PR and not a push

A parser that *fails* is loud: the site shows "stale" or "Hours unavailable" and Telegram
reports it. A parser that is *wrong* is silent: it publishes confident, incorrect hours,
which is the one thing an hours site cannot do. An unsupervised model editing a parser and
pushing has exactly that failure mode. The PR keeps a human between the model and the live
site, and the review is designed to take ten seconds (see §5).

## 2. What is and is not fixable by code

The scrape workflows already classify every failure. Only some classes are code problems.

| Failure code | Cause | Route to the fixer? |
| --- | --- | --- |
| `parse` | Page changed shape (all four breaks this week) | Yes |
| `missing-content` | Page loaded but the expected data was absent | Yes — usually a shape change |
| `navigation` / `timeout` | Runner offline, no network (the Mac) | No — Telegram only |
| `challenge` | Cloudflare / managed security challenge | No — Telegram only |

Routing `navigation` failures to a model would produce plausible, wrong edits to a parser
that was never at fault.

## 3. Architecture

```
scrape workflow (dining / library / recreation / student-services)
  │
  ├─ source succeeds ──────────────────────────────► publish, notify (unchanged)
  │
  └─ source fails with parse | missing-content
        ├─ save the fetched page/JSON as artifact  autofix-evidence-<source>
        ├─ write  { sourceId, parser, error, artifact }  to job outputs
        └─ notify (unchanged)

autofix-parser.yml   (workflow_run on the scrape workflows, filtered to failures)
  1. read the failure list from the upstream run
  2. for each failing source:
       a. skip if an open PR labelled autofix:<source> exists
       b. download the evidence artifact
       c. run claude-code-action with the prompt in §4
       d. require `npm test` green inside the action
       e. open PR  "autofix(<source>): follow <date> page change"
       f. Telegram: one message with the PR link and the parsed-values table
```

### 3.1 Evidence capture (the part that makes it work)

Every fix this week needed the *actual failing page*. A model given only
"health: failure (parse)" will guess. So each scrape step, on a parse failure, writes the
raw source to `$RUNNER_TEMP/autofix/<sourceId>.<html|json>` and uploads it with
`actions/upload-artifact`. For the dining locations feed that is the `dining_nodes` string;
for the others it is the page HTML the parser received.

Where the scraper already has the page in memory (all four), this is a few lines per
acquire function. The dining scraper on the self-hosted Mac runner uploads artifacts the
same way as hosted runners.

### 3.2 Dedupe

Before invoking the model, `gh pr list --label "autofix:<source>" --state open`. If one
exists, post a one-line Telegram reminder with the existing link and stop. This also stops
a wrong fix from being regenerated on every run: closing the PR without merging is the
signal to try again with fresh evidence.

### 3.3 Permissions and secrets

| Item | Where |
| --- | --- |
| `ANTHROPIC_API_KEY` | repo secret |
| `contents: write`, `pull-requests: write` | workflow permissions (the fixer branch + PR) |
| `actions: read` | to download the upstream artifact |
| Telegram token / chat id | already present as secrets |

The fixer never receives the publish secret (`LIBRARY_HOURS_UPDATE_SECRET`), so it cannot
touch the live API even if it wanted to.

## 4. The prompt

Same for every source, parameterised. Kept in `.github/autofix/prompt.md` so it is
reviewable and versioned.

```
The `${SOURCE_ID}` source failed in `${WORKFLOW}` with:

    ${ERROR}

The page the parser received is saved at `${EVIDENCE_PATH}`. This is the live page as of
${DATE}; treat it as ground truth.

Do exactly this, and nothing else:
1. Reproduce the failure: run the parser in `${PARSER_FILE}` against the evidence file.
2. Update the parser so it parses this page. Prefer anchoring on stable structure
   (service headings, weekday labels, data attributes) over the page's prose.
3. Copy the evidence file to `tests/fixtures/${FIXTURE_NAME}` with a header comment
   giving the URL and capture date.
4. Add a test in `${TEST_FILE}` that parses the new fixture and asserts the concrete
   values (weekdays and intervals) — not just "does not throw".
5. Keep every existing fixture and test passing. Run `npm test`.
6. In the PR body, list every venue/service and the hours you parsed for it, as a table.

Do not change any other parser, scraper, workflow, or the site. Do not modify or delete
existing fixtures. If the page cannot be parsed without guessing, stop and say why
instead of producing a fix.
```

The last instruction matters: an honest "I can't tell what this page means" PR comment is
far better than a confident wrong parser.

## 5. The review

The PR body carries the parsed values as a table:

| Service | Weekdays | Hours |
| --- | --- | --- |
| Alice! Health Promotion | Mon–Thu | 09:00–18:00 |
| Alice! Health Promotion | Fri | 09:00–17:00 |
| … | | |

The reviewer compares that table to the official page on their phone and taps merge.
Reading a diff is optional. Vercel deploys on merge; the next scheduled scrape goes green.

## 6. Build order

1. **Evidence capture** in the four scrapers + artifact upload. Ship alone; it is useful
   on its own for manual fixes too.
2. **`autofix-parser.yml`** with the dedupe guard and Telegram message, but with the
   model step stubbed to "would run". Confirm it triggers on the right failures and not on
   `navigation`.
3. **Model step** via `claude-code-action`, gated behind a repo variable
   `AUTOFIX_ENABLED`.
4. **Dry run**: `workflow_dispatch` with one of this week's captured pages (the Fall 2026
   Health fixture is a good candidate — revert the parser change on a branch and let the
   action rediscover it). Compare its PR to the hand-written fix.
5. Enable `AUTOFIX_ENABLED`.

Roughly an hour of work for 1–3; the dry run is the part worth doing carefully.

## 7. Cost and rate

A fix is one action run: a few minutes of hosted runner time and a few dollars of model
usage. At the observed rate (a handful of breaks per semester rollover) this is
negligible. The dedupe guard is what keeps a persistent failure from becoming a bill.

## 8. Known limits

- **It patches wording, it does not restructure.** The "raw" parsers for Health and Mail
  match August prose (`"Fall Rush: September 8 - 27"`, `"Regular Fall Hours (Beginning
  September 28)"`). A model asked to fix a break will keep patching prose, and they will
  break again in January. The prompt nudges toward structural anchors, but the real fix
  is a deliberate rewrite of those two parsers — a separate task, not something to
  delegate to an autofix.
- **It cannot fix the runner.** Most dining outages this week were the Mac being asleep,
  not a parser. Those stay as Telegram alerts.
- **It cannot fix a block.** If Columbia Dining challenges the scraper, no code change
  helps.
- **Evidence is a snapshot.** A page mid-edit by Columbia staff could be captured in a
  half-updated state. The values table in the PR is the defence.

## 9. Open questions

- Should a merged autofix also close the loop by re-running the scrape workflow via
  `workflow_dispatch`, rather than waiting up to four hours for the next cron? (Probably
  yes; one extra step.)
- OpenAI instead of Claude Code: same design, but the agent loop (checkout, read, edit,
  run tests, commit, open PR) has to be written by hand. Nothing in §3 depends on the
  vendor except step 2c.
