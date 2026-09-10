/**
 * Action table for the Telegram bot's state-changing commands
 * (docs/telegram-bot.md §3). Every entry has:
 *
 *   parseArgs(text)  → { ok: true, args } | { ok: false, reason }   (rejects before any confirm)
 *   describe(args)   → the confirm text, rendered from the *stored* args, never the user's text
 *   run(args, deps)  → { ok, text }                                   (only after an atomic claim)
 *
 * v1 has one entry: /rerun, a workflow_dispatch on main for exactly one of the
 * four scrape workflows.
 */

export const REPO = 'raymondwangnorcal-pixel/LionTime';

export const RERUN_WORKFLOWS = Object.freeze({
  'dining':           { file: 'update-dining-hours.yml',           name: 'Update dining hours' },
  'library':          { file: 'update-library-hours.yml',          name: 'Update library hours' },
  'recreation':       { file: 'update-recreation-hours.yml',       name: 'Update recreation hours' },
  'student-services': { file: 'update-student-services-hours.yml', name: 'Update student services hours' },
});

const RERUN_USAGE = `Usage: /rerun <${Object.keys(RERUN_WORKFLOWS).join('|')}>`;

export const rerun = {
  name: 'rerun',

  parseArgs(text) {
    const parts = String(text || '').trim().split(/\s+/).slice(1);
    if (parts.length !== 1) return { ok: false, reason: RERUN_USAGE };
    const key = parts[0].toLowerCase();
    if (!Object.hasOwn(RERUN_WORKFLOWS, key)) {
      return { ok: false, reason: `"${parts[0]}" isn't a workflow I can re-run.\n${RERUN_USAGE}` };
    }
    return { ok: true, args: { workflow: key } };
  },

  /** Cooldown scope: one re-run per workflow per 30 minutes (docs §10). */
  scope(args) {
    return `rerun:${args.workflow}`;
  },

  describe(args) {
    const wf = RERUN_WORKFLOWS[args.workflow];
    return `Re-run "${wf.name}" on main now?`;
  },

  async run(args, { githubToken, fetchImpl = globalThis.fetch, timeoutMs = 3_000 } = {}) {
    const wf = RERUN_WORKFLOWS[args.workflow];
    if (!wf) return { ok: false, text: 'Unknown workflow. Nothing was changed.' };
    if (!githubToken) return { ok: false, text: 'GITHUB_TOKEN is not configured on the server. Nothing was changed.' };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`https://api.github.com/repos/${REPO}/actions/workflows/${wf.file}/dispatches`, {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${githubToken}`,
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({ ref: 'main' }),
        signal: controller.signal,
      });
      if (response.status === 204) {
        return { ok: true, text: `Started "${wf.name}" on main.\nhttps://github.com/${REPO}/actions/workflows/${wf.file}` };
      }
      let detail = `HTTP ${response.status}`;
      try { const body = await response.json(); if (body?.message) detail += ` — ${body.message}`; } catch { /* no body */ }
      return { ok: false, text: `GitHub refused the re-run (${detail}). Nothing was changed.` };
    } catch (error) {
      const why = error?.name === 'AbortError' ? "GitHub didn't answer in time" : `GitHub call failed (${error?.message || 'error'})`;
      return { ok: false, text: `${why}; nothing was changed.` };
    } finally {
      clearTimeout(timer);
    }
  },
};

export const ACTIONS = Object.freeze({ rerun });
