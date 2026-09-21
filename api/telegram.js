import { Redis } from '@upstash/redis';

import { createTelegramService } from '../lib/telegram-service.js';
import { createRedisPendingStore } from '../lib/telegram-pending-store.js';
import { createRedisTicketStore, createTicketHandler } from '../lib/telegram-tickets.js';

const TELEGRAM_API = 'https://api.telegram.org';
const UPDATE_TTL_SECONDS = 86_400;

function redisOrNull() {
  try { return Redis.fromEnv(); } catch { return null; }
}

/**
 * SET NX on the update id — `seen` is false when Telegram is redelivering something we already
 * handled. `forget` releases the id again when handling FAILED, so Telegram's retry is processed
 * instead of being dropped: a tap that was never recorded must not look like one that was.
 */
function makeDedupe(redis) {
  if (!redis) return { seen: async () => true, forget: async () => {} };
  const key = (updateId) => `lionhour:tg:update:${updateId}`;
  return {
    seen: async (updateId) => {
      try {
        const result = await redis.set(key(updateId), '1', { nx: true, ex: UPDATE_TTL_SECONDS });
        return result === 'OK';
      } catch {
        return true; // a Redis hiccup must not silence the bot; a duplicate reply is the lesser harm
      }
    },
    forget: async (updateId) => {
      try { await redis.del(key(updateId)); } catch { /* the key expires on its own */ }
    },
  };
}

/** Best-effort call to the Bot API; returns the `result` field or null. */
async function telegram(method, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`${TELEGRAM_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);
    return body?.ok ? body.result : null;
  } catch {
    return null; // Reply delivery is best-effort; the update itself has been handled.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Start the follow-up job for a saved card edit. Entirely env-configured; unset means "no dispatch"
 * and the edit is simply picked up by that job's next scheduled run.
 */
async function dispatchTicketJob() {
  const { TICKET_DISPATCH_REPO: repo, TICKET_DISPATCH_WORKFLOW: workflow, TICKET_DISPATCH_TOKEN: token } = process.env;
  if (!repo || !workflow || !token) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: process.env.TICKET_DISPATCH_REF || 'main' }),
      signal: controller.signal,
    });
    return response.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_WEBHOOK_SECRET || !process.env.TELEGRAM_OWNER_USER_IDS) {
    return res.status(503).json({ error: 'Telegram bot is not configured' });
  }

  const redis = redisOrNull();
  const pendingStore = redis ? createRedisPendingStore(redis) : null;
  const dedupe = makeDedupe(redis);
  const service = createTelegramService({
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    ownerIds: process.env.TELEGRAM_OWNER_USER_IDS,
    dedupe: dedupe.seen,
    githubToken: process.env.GITHUB_TOKEN || null,
    pendingStore,
    tickets: redis ? createTicketHandler({ store: createRedisTicketStore(redis), dispatch: dispatchTicketJob }) : null,
  });

  let result;
  try {
    result = await service.handle({
      secretHeader: req.headers['x-telegram-bot-api-secret-token'],
      update: req.body,
    });
  } catch {
    // Nothing was recorded. Release the update id and answer 500 so Telegram redelivers it.
    if (typeof req.body?.update_id === 'number') await dedupe.forget(req.body.update_id);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ ok: false });
  }

  for (const reply of result.replies) {
    const sent = await telegram('sendMessage', {
      chat_id: reply.chatId,
      text: reply.text,
      disable_web_page_preview: true,
      ...(reply.replyMarkup ? { reply_markup: reply.replyMarkup } : {}),
    });
    // A pending action can only be confirmed from the message it was sent with (R6).
    // If the send failed we never learn the message id, so the action can never be claimed.
    if (reply.pendingId && sent?.message_id != null && pendingStore) {
      try { await pendingStore.bindMessage(reply.pendingId, sent.message_id); } catch { /* fails closed */ }
    }
  }
  for (const edit of result.edits || []) {
    await telegram('editMessageText', { chat_id: edit.chatId, message_id: edit.messageId, text: edit.text, disable_web_page_preview: true });
  }
  for (const markup of result.markups || []) {
    await telegram('editMessageReplyMarkup', { chat_id: markup.chatId, message_id: markup.messageId, reply_markup: markup.replyMarkup });
  }
  if (result.answerCallback) {
    await telegram('answerCallbackQuery', { callback_query_id: result.answerCallback.id, text: result.answerCallback.text });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(result.status).json({ ok: result.status === 200 });
}
