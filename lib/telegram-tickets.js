/**
 * Tickets: a generic "someone tapped a button on a card" recorder for the Telegram bot.
 *
 * Another system writes a ticket to Redis and posts a card whose buttons carry
 * `t:<verb>:<ticket id>`. This module knows nothing about what a ticket is for.
 * It checks the tap against the ticket and records a verdict; the other system
 * reads the verdict later and decides what it means. It never acts on a verdict
 * itself and it holds no copy, labels or business rules of its own: button
 * labels and prompts come from the ticket.
 *
 * The service has already authenticated the webhook secret, the private chat
 * and the owner allowlist before anything here runs. On top of that:
 *   - the tap must be in the ticket's chat, on the ticket's own message
 *   - the ticket must not have expired, and the verb must be one it offers
 *   - the first verdict wins (SET NX); a second tap is told what was recorded
 *   - an edit tap voids the ticket, then the owner's next plain message is
 *     stored as the edit text and a follow-up job is dispatched
 *
 * Keys (namespace defaults to `lionhour:tickets:`):
 *   ticket:<id>       {id, kind, hash, chatId, messageId, expiresAt, verbs, editVerb?, editPrompt?}  written elsewhere
 *   verdict:<id>      {verb, hash, userId, chatId, at}     SET NX here
 *   void:<id>         {userId, at}                         set here on an edit tap
 *   edit:<id>         {text, userId, at}                   set here
 *   editwait:<chat>   ticket id awaiting the owner's text, 10 min
 */

export const TICKET_CALLBACK = /^t:([a-z]{1,2}):([a-f0-9]{16})$/;
export const EDIT_WAIT_SECONDS = 10 * 60;
export const EDIT_MAX_CHARS = 80;
const GRACE_SECONDS = 24 * 60 * 60;

function parse(raw) {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return null; }
}

/** @param {import('@upstash/redis').Redis} redis */
export function createRedisTicketStore(redis, { namespace = 'lionhour:tickets:' } = {}) {
  const key = (family, id) => `${namespace}${family}:${id}`;
  return {
    async getTicket(id) { return parse(await redis.get(key('ticket', id))); },
    async getVerdict(id) { return parse(await redis.get(key('verdict', id))); },
    async isVoid(id) { return (await redis.exists(key('void', id))) === 1; },
    /** @returns {Promise<boolean>} false when a verdict already exists */
    async recordVerdict(id, verdict, ttlSeconds) {
      return (await redis.set(key('verdict', id), JSON.stringify(verdict), { nx: true, ex: ttlSeconds })) === 'OK';
    },
    async markVoid(id, record, ttlSeconds) {
      await redis.set(key('void', id), JSON.stringify(record), { ex: ttlSeconds });
    },
    async setEditWait(chatId, id) {
      await redis.set(key('editwait', chatId), id, { ex: EDIT_WAIT_SECONDS });
    },
    async takeEditWait(chatId) {
      const id = await redis.getdel(key('editwait', chatId));
      return id == null ? null : String(id);
    },
    async saveEdit(id, record, ttlSeconds) {
      await redis.set(key('edit', id), JSON.stringify(record), { ex: ttlSeconds });
    },
  };
}

function eastern(date) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' })
    .format(date) + ' ET';
}

export function createTicketHandler({ store, now = () => new Date(), dispatch = async () => false } = {}) {
  if (!store) throw new Error('ticket store is required');

  const seconds = () => Math.floor(now().getTime() / 1000);
  const ttlFor = (ticket) => Math.max(60, Number(ticket.expiresAt) - seconds() + GRACE_SECONDS);

  /** @returns a service result, or null when the callback is not a ticket tap */
  async function handleCallback(callback, { from, chat }) {
    const match = TICKET_CALLBACK.exec(String(callback.data || ''));
    if (!match) return null;
    const [, verb, id] = match;
    const messageId = callback.message?.message_id;
    const ack = (text, extra = {}) => ({ status: 200, replies: [], edits: [], answerCallback: { id: callback.id, text }, ...extra });
    const stamp = (label) => ({
      chatId: chat.id, messageId,
      replyMarkup: { inline_keyboard: [[{ text: `${label} · ${eastern(now())}`, callback_data: `t:x:${id}` }]] },
    });

    if (verb === 'x') return ack('Already recorded.');
    const ticket = await store.getTicket(id);
    if (!ticket) return ack('That card expired.');
    if (String(ticket.chatId) !== String(chat.id) || ticket.messageId == null || String(ticket.messageId) !== String(messageId)) {
      return ack(ticket.messageId == null ? 'Not ready yet — tap again in a moment.' : 'Not yours.');
    }
    if (seconds() >= Number(ticket.expiresAt)) return ack('That card expired.', { markups: [stamp('Expired')] });
    const label = ticket.verbs?.[verb];
    if (typeof label !== 'string') return ack('Nothing to do.');

    if (ticket.editVerb && verb === ticket.editVerb) {
      // Void first: from this moment no earlier or later approval of this version counts.
      await store.markVoid(id, { userId: String(from.id), at: seconds() }, ttlFor(ticket));
      await store.setEditWait(String(chat.id), id);
      return {
        ...ack(label, { markups: [stamp(label)] }),
        replies: [{ chatId: chat.id, text: String(ticket.editPrompt || 'Send the new text as your next message.') }],
      };
    }

    if (await store.isVoid(id)) return ack('That version was replaced.', { markups: [stamp('Replaced')] });
    const verdict = { verb, hash: String(ticket.hash || ''), userId: String(from.id), chatId: String(chat.id), at: seconds() };
    if (!(await store.recordVerdict(id, verdict, ttlFor(ticket)))) {
      const existing = await store.getVerdict(id);
      const was = ticket.verbs?.[existing?.verb] || 'recorded';
      return ack(`Already ${was.toLowerCase()}.`, { markups: [stamp(was)] });
    }
    return ack(`${label}.`, { markups: [stamp(label)] });
  }

  /** @returns a service result, or null when no edit is waiting on this chat */
  async function handleText(text, { from, chat }) {
    const id = await store.takeEditWait(String(chat.id));
    if (!id) return null;
    const reply = (message) => ({ status: 200, replies: [{ chatId: chat.id, text: message }] });
    const ticket = await store.getTicket(id);
    if (!ticket || seconds() >= Number(ticket.expiresAt)) return reply('That card expired — nothing was changed.');
    const value = String(text || '').split(/\r?\n/)[0].trim().slice(0, EDIT_MAX_CHARS);
    if (!value) return reply('Empty text — nothing was changed.');
    await store.saveEdit(id, { text: value, userId: String(from.id), at: seconds() }, ttlFor(ticket));
    const started = await dispatch({ ticketId: id, kind: String(ticket.kind || '') });
    return reply(started
      ? 'Saved. A new version will arrive shortly and needs its own approval.'
      : 'Saved, but the follow-up job could not be started. It will be applied on the next scheduled run.');
  }

  return { handleCallback, handleText };
}
