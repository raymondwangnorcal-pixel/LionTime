import { Redis } from '@upstash/redis';

import { createTelegramService } from '../lib/telegram-service.js';
import { createRedisPendingStore } from '../lib/telegram-pending-store.js';

const TELEGRAM_API = 'https://api.telegram.org';
const UPDATE_TTL_SECONDS = 86_400;

function redisOrNull() {
  try { return Redis.fromEnv(); } catch { return null; }
}

/** SET NX on the update id — false when Telegram is redelivering something we already handled. */
async function makeDedupe(redis) {
  if (!redis) return async () => true;
  return async (updateId) => {
    try {
      const result = await redis.set(`lionhour:tg:update:${updateId}`, '1', { nx: true, ex: UPDATE_TTL_SECONDS });
      return result === 'OK';
    } catch {
      return true; // a Redis hiccup must not silence the bot; a duplicate reply is the lesser harm
    }
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
  const service = createTelegramService({
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    ownerIds: process.env.TELEGRAM_OWNER_USER_IDS,
    dedupe: await makeDedupe(redis),
    githubToken: process.env.GITHUB_TOKEN || null,
    pendingStore,
  });

  const result = await service.handle({
    secretHeader: req.headers['x-telegram-bot-api-secret-token'],
    update: req.body,
  });

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
  if (result.answerCallback) {
    await telegram('answerCallbackQuery', { callback_query_id: result.answerCallback.id, text: result.answerCallback.text });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(result.status).json({ ok: result.status === 200 });
}
