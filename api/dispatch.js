import { timingSafeEqual } from 'node:crypto';

import { dispatchWorkflow } from '../lib/github-dispatch.js';

/**
 * External-scheduler entry point. GitHub's own cron drops and delays scheduled runs, so a
 * minute-precise scheduler (Upstash QStash, cron-job.org, ...) calls this instead:
 *
 *   POST /api/dispatch?job=draft
 *   Authorization: Bearer <OUTREACH_DISPATCH_SECRET>
 *
 * The only thing this endpoint knows is a job NAME from a fixed allowlist; it starts that
 * workflow through `workflow_dispatch` and reports whether GitHub queued it. Every workflow it
 * can start is idempotent on its own side (daily locks, run locks, per-message claims), so a
 * scheduler retry or a stray double call is harmless.
 */
export const JOBS = Object.freeze({
  draft: 'draft.yml',
  send: 'send.yml',
  sync: 'sync.yml',
  regenerate: 'regenerate.yml',
});

/**
 * Fixed workflow inputs per job. `send.yml` defaults `dry_run` to true so a run started by hand
 * from the GitHub UI never mails anyone; the scheduled send must opt out of that, or every
 * on-time run is a dry run. Real mail still needs the repo variable OUTREACH_LIVE=1, an armed
 * system, the send window and an approved draft — this only stops the dispatch forcing a dry run.
 */
export const INPUTS = Object.freeze({
  send: Object.freeze({ dry_run: 'false' }),   // a string: the dispatch API wants string values; send.yml types it boolean
});

function authorized(header, secret) {
  if (!secret || typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(secret);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function createDispatchHandler({ env = process.env, dispatch = dispatchWorkflow } = {}) {
  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }
    if (!env.OUTREACH_DISPATCH_SECRET) return res.status(503).json({ ok: false, error: 'Dispatch is not configured' });
    if (!authorized(req.headers?.authorization, env.OUTREACH_DISPATCH_SECRET)) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    const job = typeof req.query?.job === 'string' ? req.query.job : req.body?.job;
    const workflow = Object.hasOwn(JOBS, job) ? JOBS[job] : null;
    if (!workflow) return res.status(400).json({ ok: false, error: 'Unknown job' });
    const queued = await dispatch(workflow, { env, inputs: INPUTS[job] });
    // A non-2xx answer makes a retrying scheduler try again, which is what we want when GitHub
    // did not accept the dispatch.
    return res.status(queued ? 200 : 502).json({ ok: queued, job });
  };
}

export default createDispatchHandler();
