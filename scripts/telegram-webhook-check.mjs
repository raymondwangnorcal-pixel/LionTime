#!/usr/bin/env node
/**
 * telegram-webhook-check.mjs — proves the bot can still *receive*.
 *
 * Outbound notifications only prove GitHub can send (R17). This asks Telegram
 * what it believes about the webhook and alerts — through the send path,
 * which is independent of the receiver — when it drifts:
 *   - URL is not the expected endpoint (re-registered elsewhere)
 *   - Telegram reports a recent delivery error (bad secret, 5xx, timeout)
 *   - updates are piling up (pending_update_count) because nobody accepts them
 *
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, optional TELEGRAM_WEBHOOK_URL.
 * Exits non-zero on any problem so the workflow run is red too.
 */
const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
const expectedUrl = process.env.TELEGRAM_WEBHOOK_URL || 'https://lionhour.com/api/telegram';
if (!token || !chatId) {
  console.error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required');
  process.exit(2);
}

const api = (method, init) => fetch(`https://api.telegram.org/bot${token}/${method}`, init).then(r => r.json());

const info = await api('getWebhookInfo');
if (!info.ok) {
  console.error('getWebhookInfo failed:', JSON.stringify(info));
  process.exit(1);
}
const w = info.result;
const problems = [];
if (w.url !== expectedUrl) problems.push(`webhook URL is "${w.url || '(none)'}", expected ${expectedUrl}`);
if (w.last_error_date && Date.now() / 1000 - w.last_error_date < 6 * 3600) {
  problems.push(`Telegram reported a delivery error ${Math.round((Date.now() / 1000 - w.last_error_date) / 60)} min ago: ${w.last_error_message}`);
}
if ((w.pending_update_count || 0) > 5) problems.push(`${w.pending_update_count} updates are waiting undelivered`);

const summary = `webhook=${w.url || '(none)'} pending=${w.pending_update_count || 0} last_error=${w.last_error_message || 'none'}`;
if (!problems.length) {
  console.log(`✓ Telegram webhook healthy · ${summary}`);
  process.exit(0);
}
console.error(`✗ Telegram webhook problems:\n- ${problems.join('\n- ')}\n${summary}`);
await api('sendMessage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    text: `⚠️ LionHour bot may not be receiving messages:\n- ${problems.join('\n- ')}`,
    disable_web_page_preview: true,
  }),
});
process.exit(1);
