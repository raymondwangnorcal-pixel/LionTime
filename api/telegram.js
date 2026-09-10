import { Redis } from '@upstash/redis';

import { createTelegramService } from '../lib/telegram-service.js';

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

async function telegram(method, payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3_000);
  try {
    await fetch(`${TELEGRAM_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    // Reply delivery is best-effort; the update itself has been handled.
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

  const service = createTelegramService({
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    ownerIds: process.env.TELEGRAM_OWNER_USER_IDS,
    dedupe: await makeDedupe(redisOrNull()),
    githubToken: process.env.GITHUB_TOKEN || null,
  });

  const result = await service.handle({
    secretHeader: req.headers['x-telegram-bot-api-secret-token'],
    update: req.body,
  });

  for (const reply of result.replies) {
    await telegram('sendMessage', { chat_id: reply.chatId, text: reply.text, disable_web_page_preview: true });
  }
  if (result.answerCallback) {
    await telegram('answerCallbackQuery', { callback_query_id: result.answerCallback.id, text: result.answerCallback.text });
  }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(result.status).json({ ok: result.status === 200 });
}
