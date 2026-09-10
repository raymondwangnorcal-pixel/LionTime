/**
 * Two-way Telegram bot — v1 read-only commands (docs/telegram-bot.md).
 *
 * Pure request handling: no environment access, no network of its own. The
 * API route (api/telegram.js) supplies the secret, the owner allowlist, a
 * dedupe function, and a fetch implementation, then delivers the replies.
 *
 * Authorization model (R6):
 *   - the webhook secret header must match, else 401
 *   - the chat must be private, else silently dropped
 *   - the sender's user id must be on the allowlist, else silently dropped
 *   - a repeated update_id (Telegram retry) is silently dropped (R5)
 * Every handled outcome is HTTP 200 so Telegram stops retrying.
 */

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

const HELP = [
  'LionHour bot — read-only for now.',
  '',
  '/status — is each hours feed live, stale, or down',
  '/prs — open pull requests with check state',
  '/help — this list',
  '',
  'Changes (re-runs, closures, merges) arrive in later versions; see docs/telegram-bot.md.',
].join('\n');

export function createTelegramService({
  webhookSecret,
  ownerIds,
  dedupe = async () => true,          // returns false when the update_id was already seen
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  githubToken = null,
  timeoutMs = 3_000,
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

  const COMMANDS = {
    '/help': async () => HELP,
    '/start': async () => HELP,
    '/status': status,
    '/prs': prs,
  };

  /**
   * @param {{ secretHeader?: string, update: object }} input
   * @returns {Promise<{ status: number, replies: Array<{ chatId: number|string, text: string }> }>}
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

    if (callback) {
      // No pending-action flow in v1; acknowledge so the client stops spinning.
      return { status: 200, replies: [], answerCallback: { id: callback.id, text: 'Nothing to confirm yet.' } };
    }

    const text = String(message?.text || '').trim();
    const command = text.split(/\s+/)[0]?.split('@')[0]?.toLowerCase();
    const run = COMMANDS[command];
    const reply = run ? await run() : HELP;
    return { status: 200, replies: [{ chatId: chat.id, text: reply }] };
  }

  return { handle, HELP };
}
