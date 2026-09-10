/**
 * Two-way Telegram bot — v1 commands plus the confirm flow (docs/telegram-bot.md).
 *
 * Pure request handling: no environment access, no network of its own. The
 * API route (api/telegram.js) supplies the secret, the owner allowlist, a
 * dedupe function, the pending-action store, and a fetch implementation, then
 * delivers the replies, message edits, and callback acknowledgements.
 *
 * Authorization model (R6):
 *   - the webhook secret header must match, else 401
 *   - the chat must be private, else silently dropped
 *   - the sender's user id must be on the allowlist, else silently dropped
 *   - a repeated update_id (Telegram retry) is silently dropped (R5)
 *   - a button tap must come from the user who created the pending action, in
 *     the same chat, on the same message, else it is acknowledged and ignored
 * State changes (R5): the pending action is claimed atomically before it runs,
 * a second tap is told "already running", and the outcome is recorded on the
 * record rather than the record being deleted.
 * Every handled outcome is HTTP 200 so Telegram stops retrying.
 */

import { ACTIONS } from './telegram-actions.js';

const REPO = 'raymondwangnorcal-pixel/LionTime';
const SITE = 'https://lionhour.com';
const HOURS_APIS = [
  ['Library', 'library-hours'],
  ['Dining', 'dining-hours'],
  ['Recreation', 'recreation-hours'],
  ['Student Life', 'student-services-hours'],
];
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const CALLBACK = /^(confirm|cancel):([a-f0-9]{16})$/;

const HELP = [
  'LionHour bot.',
  '',
  '/status — is each hours feed live, stale, or down',
  '/prs — open pull requests with check state',
  '/rerun <dining|library|recreation|student-services> — re-run a scrape workflow on main (asks you to confirm)',
  '/help — this list',
  '',
  'Closures and merges arrive in later versions; see docs/telegram-bot.md.',
].join('\n');

export function createTelegramService({
  webhookSecret,
  ownerIds,
  dedupe = async () => true,          // returns false when the update_id was already seen
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  githubToken = null,
  timeoutMs = 3_000,
  pendingStore = null,                // null → state-changing commands refuse (docs §8)
  actions = ACTIONS,
} = {}) {
  if (!webhookSecret) throw new Error('webhookSecret is required');
  const owners = new Set((Array.isArray(ownerIds) ? ownerIds : String(ownerIds || '').split(','))
    .map(v => String(v).trim()).filter(Boolean));
  if (!owners.size) throw new Error('at least one owner id is required');

  async function fetchJson(url, headers = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json', ...headers }, signal: controller.signal });
      if (!response.ok) return { ok: false, status: response.status };
      return { ok: true, status: response.status, body: await response.json() };
    } catch (error) {
      return { ok: false, error: error?.name === 'AbortError' ? 'timeout' : (error?.message || 'error') };
    } finally {
      clearTimeout(timer);
    }
  }

  function eastern(date) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    }).format(date) + ' ET';
  }

  async function status() {
    const current = now();
    const lines = await Promise.all(HOURS_APIS.map(async ([label, path]) => {
      const result = await fetchJson(`${SITE}/api/${path}`);
      if (!result.ok) return `✗ ${label}: unavailable (${result.error || `HTTP ${result.status}`})`;
      const generated = Date.parse(result.body?.generated);
      if (Number.isNaN(generated)) return `? ${label}: no timestamp in response`;
      const age = current.getTime() - generated;
      const mark = age < 6 * HOUR_MS ? '✓' : age < DAY_MS ? '~' : '✗';
      const word = age < 6 * HOUR_MS ? 'live' : age < DAY_MS ? 'stale' : 'out of date';
      return `${mark} ${label}: ${word} · ${eastern(new Date(generated))}`;
    }));
    return [
      `Hours feeds as served by the CDN (up to 5 min behind):`,
      ...lines,
      '',
      `Checked ${eastern(current)}`,
    ].join('\n');
  }

  async function prs() {
    const headers = githubToken ? { Authorization: `Bearer ${githubToken}` } : {};
    const list = await fetchJson(`https://api.github.com/repos/${REPO}/pulls?state=open&per_page=10`, headers);
    if (!list.ok) return `GitHub didn't answer (${list.error || `HTTP ${list.status}`}). Nothing was changed.`;
    if (!Array.isArray(list.body) || !list.body.length) return 'No open pull requests.';
    const rows = await Promise.all(list.body.map(async (pr) => {
      const sha = pr.head?.sha || '';
      const checks = await fetchJson(`https://api.github.com/repos/${REPO}/commits/${sha}/check-runs`, headers);
      let state = 'checks: unknown';
      if (checks.ok) {
        const runs = checks.body?.check_runs || [];
        if (!runs.length) state = 'checks: none';
        else if (runs.some(r => r.status !== 'completed')) state = 'checks: running';
        else if (runs.every(r => r.conclusion === 'success')) state = 'checks: passing';
        else state = `checks: failing (${runs.filter(r => r.conclusion !== 'success').map(r => r.name).join(', ')})`;
      }
      return `#${pr.number} ${pr.title}\n   ${sha.slice(0, 7)} · ${state}\n   ${pr.html_url}`;
    }));
    return rows.join('\n\n');
  }

  function minutes(seconds) {
    const m = Math.max(1, Math.ceil(seconds / 60));
    return `${m} min`;
  }

  /**
   * A state-changing command: validate, check the cooldown, store a pending
   * action, and reply with the describe() text under [Confirm] [Cancel].
   * The API route binds the pending action to the message Telegram assigns.
   */
  async function propose(action, text, { from, chat }) {
    const parsed = action.parseArgs(text);
    if (!parsed.ok) return { text: parsed.reason };
    if (!pendingStore) return { text: 'The pending-action store is unavailable, so I will not take changes right now. Nothing was changed.' };

    const scope = action.scope?.(parsed.args);
    if (scope) {
      const left = await pendingStore.cooldown.check(scope);
      if (left > 0) {
        return { text: `${action.describe(parsed.args).replace(/\?$/, '')} — already requested less than 30 min ago. Try again in ${minutes(left)}.` };
      }
    }

    const record = await pendingStore.create({ action: action.name, args: parsed.args, ownerId: from.id, chatId: chat.id });
    return {
      text: action.describe(parsed.args),
      pendingId: record.id,
      replyMarkup: { inline_keyboard: [[
        { text: 'Confirm', callback_data: `confirm:${record.id}` },
        { text: 'Cancel', callback_data: `cancel:${record.id}` },
      ]] },
    };
  }

  async function handleCallback(callback, { from, chat }) {
    const ack = (text) => ({ status: 200, replies: [], edits: [], answerCallback: { id: callback.id, text } });
    const messageId = callback.message?.message_id;
    const match = CALLBACK.exec(String(callback.data || ''));
    if (!match || messageId == null) return ack('Nothing to do.');
    const [, verb, id] = match;
    const edit = (text) => ({ chatId: chat.id, messageId, text });

    if (!pendingStore) return ack('The pending-action store is unavailable. Nothing was changed.');

    const record = await pendingStore.get(id);
    if (!record) {
      return { ...ack('That request expired.'), edits: [edit('That request expired — send it again.')] };
    }
    // R6: the tap must come from the creator, in the same chat, on the confirm message itself.
    if (record.ownerId !== String(from.id) || record.chatId !== String(chat.id) || record.messageId !== String(messageId)) {
      return ack('Not yours.');
    }
    if (record.state !== 'pending') {
      const words = { claimed: 'already running', done: 'already done', failed: 'already attempted', cancelled: 'already cancelled' };
      return ack(`That request is ${words[record.state] || record.state}.`);
    }

    const action = actions[record.action];
    if (!action) {
      await pendingStore.finish(id, { state: 'failed', result: 'unknown action' });
      return { ...ack('Unknown action.'), edits: [edit('Unknown action — nothing was changed.')] };
    }
    const summary = action.describe(record.args).replace(/\?$/, '');

    // Atomic claim: the first tap (confirm *or* cancel) owns the record from here (R5).
    if (!(await pendingStore.claim(id))) return ack('Already running.');

    if (verb === 'cancel') {
      await pendingStore.finish(id, { state: 'cancelled' });
      return { ...ack('Cancelled.'), edits: [edit(`${summary} — cancelled. Nothing was changed.`)] };
    }

    const scope = action.scope?.(record.args);
    if (scope && !(await pendingStore.cooldown.start(scope))) {
      await pendingStore.finish(id, { state: 'failed', result: 'cooldown' });
      return { ...ack('Too soon.'), edits: [edit(`${summary} — already requested less than 30 min ago. Nothing was changed.`)] };
    }

    const outcome = await action.run(record.args, { githubToken, fetchImpl, timeoutMs });
    if (!outcome.ok && scope) await pendingStore.cooldown.clear(scope);
    await pendingStore.finish(id, { state: outcome.ok ? 'done' : 'failed', result: outcome.text });
    return {
      ...ack(outcome.ok ? 'Done.' : 'Failed.'),
      edits: [edit(`${outcome.ok ? '✓' : '✗'} ${outcome.text}\n\n(${summary}, confirmed ${eastern(now())})`)],
    };
  }

  const COMMANDS = {
    '/help': async () => ({ text: HELP }),
    '/start': async () => ({ text: HELP }),
    '/status': async () => ({ text: await status() }),
    '/prs': async () => ({ text: await prs() }),
    '/rerun': (text, ctx) => propose(actions.rerun, text, ctx),
  };

  /**
   * @param {{ secretHeader?: string, update: object }} input
   * @returns {Promise<{
   *   status: number,
   *   replies: Array<{ chatId: number|string, text: string, replyMarkup?: object, pendingId?: string }>,
   *   edits?: Array<{ chatId: number|string, messageId: number, text: string }>,
   *   answerCallback?: { id: string, text: string },
   * }>}
   */
  async function handle({ secretHeader, update }) {
    if (!secretHeader || secretHeader !== webhookSecret) return { status: 401, replies: [] };
    if (!update || typeof update !== 'object') return { status: 200, replies: [] };

    const message = update.message || update.edited_message || null;
    const callback = update.callback_query || null;
    const from = message?.from || callback?.from || null;
    const chat = message?.chat || callback?.message?.chat || null;

    if (!from || !chat) return { status: 200, replies: [] };
    if (chat.type !== 'private') return { status: 200, replies: [] };
    if (!owners.has(String(from.id))) return { status: 200, replies: [] };
    if (typeof update.update_id === 'number' && !(await dedupe(update.update_id))) {
      return { status: 200, replies: [] };
    }

    if (callback) return handleCallback(callback, { from, chat });

    const text = String(message?.text || '').trim();
    const command = text.split(/\s+/)[0]?.split('@')[0]?.toLowerCase();
    const run = COMMANDS[command];
    const reply = run ? await run(text, { from, chat }) : { text: HELP };
    return { status: 200, replies: [{ chatId: chat.id, ...reply }] };
  }

  return { handle, HELP };
}
