import assert from 'node:assert/strict';
import test from 'node:test';

import { createTelegramService } from '../lib/telegram-service.js';
import { createMemoryPendingStore, PENDING_TTL_SECONDS, RERUN_COOLDOWN_SECONDS } from '../lib/telegram-pending-store.js';

const OWNER = 8325088675;
const SECRET = 'test-webhook-secret';
const T0 = Date.parse('2026-09-10T20:00:00Z');

function harness({ dispatchStatus = 204, githubToken = 'ghp_test', store = true } = {}) {
  let nowMs = T0;
  const now = () => new Date(nowMs);
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('/dispatches')) return { ok: dispatchStatus < 400, status: dispatchStatus, json: async () => ({ message: 'nope' }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const pendingStore = store ? createMemoryPendingStore({ now }) : null;
  const s = createTelegramService({ webhookSecret: SECRET, ownerIds: String(OWNER), fetchImpl, now, githubToken, pendingStore });
  let updateId = 100;
  const message = (text, extra = {}) => s.handle({ secretHeader: SECRET, update: {
    update_id: updateId++,
    message: { message_id: 10, from: { id: OWNER }, chat: { id: OWNER, type: 'private' }, text, ...extra },
  } });
  const tap = (data, { fromId = OWNER, chatId = OWNER, messageId = 55, cbId = 'cb' } = {}) => s.handle({ secretHeader: SECRET, update: {
    update_id: updateId++,
    callback_query: { id: cbId, from: { id: fromId }, message: { message_id: messageId, chat: { id: chatId, type: 'private' } }, data },
  } });
  /** what api/telegram.js does after sendMessage returns */
  const bind = (reply, messageId = 55) => pendingStore.bindMessage(reply.pendingId, messageId);
  const advance = (seconds) => { nowMs += seconds * 1000; };
  return { s, message, tap, bind, advance, calls, pendingStore };
}

test('/rerun rejects bad arguments before anything is stored', async () => {
  const { message, pendingStore } = harness();
  for (const text of ['/rerun', '/rerun menus', '/rerun dining library']) {
    const { replies } = await message(text);
    assert.match(replies[0].text, /Usage: \/rerun <dining\|library\|recreation\|student-services>/);
    assert.equal(replies[0].replyMarkup, undefined);
  }
  assert.equal(pendingStore._records.size, 0);
});

test('/rerun proposes the stored action under Confirm/Cancel, and Confirm dispatches the workflow', async () => {
  const { message, tap, bind, calls, pendingStore } = harness();
  const { replies } = await message('/rerun Recreation');
  const reply = replies[0];
  assert.equal(reply.text, 'Re-run "Update recreation hours" on main now?');
  assert.deepEqual(reply.replyMarkup.inline_keyboard[0].map(b => b.text), ['Confirm', 'Cancel']);
  assert.match(reply.replyMarkup.inline_keyboard[0][0].callback_data, /^confirm:[a-f0-9]{16}$/);
  const stored = await pendingStore.get(reply.pendingId);
  assert.deepEqual(stored.args, { workflow: 'recreation' });
  assert.equal(stored.state, 'pending');
  assert.equal(calls.length, 0, 'nothing is dispatched before the confirm');

  await bind(reply);
  const result = await tap(`confirm:${reply.pendingId}`);
  assert.equal(result.answerCallback.text, 'Done.');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.github.com/repos/raymondwangnorcal-pixel/LionTime/actions/workflows/update-recreation-hours.yml/dispatches');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer ghp_test');
  assert.deepEqual(JSON.parse(calls[0].init.body), { ref: 'main' });
  assert.equal(result.edits[0].messageId, 55);
  assert.match(result.edits[0].text, /^✓ Started "Update recreation hours" on main\./);
  assert.match(result.edits[0].text, /confirmed Sep 10, 4:00 PM ET/);
  assert.equal((await pendingStore.get(reply.pendingId)).state, 'done');
});

test('a second tap on the same confirm does not dispatch again', async () => {
  const { message, tap, bind, calls } = harness();
  const { replies: [reply] } = await message('/rerun dining');
  await bind(reply);
  const [first, second] = await Promise.all([tap(`confirm:${reply.pendingId}`, { cbId: 'a' }), tap(`confirm:${reply.pendingId}`, { cbId: 'b' })]);
  assert.equal(calls.length, 1);
  const texts = [first.answerCallback.text, second.answerCallback.text].sort();
  assert.deepEqual(texts, ['Already running.', 'Done.']);
  const late = await tap(`confirm:${reply.pendingId}`, { cbId: 'c' });
  assert.equal(late.answerCallback.text, 'That request is already done.');
  assert.equal(calls.length, 1);
});

test('a forged or misdirected tap is acknowledged and ignored', async () => {
  const { message, tap, bind, calls } = harness();
  const { replies: [reply] } = await message('/rerun library');
  await bind(reply);
  // wrong message id
  let r = await tap(`confirm:${reply.pendingId}`, { messageId: 56 });
  assert.equal(r.answerCallback.text, 'Not yours.');
  // unbound-looking id that never existed
  r = await tap('confirm:0123456789abcdef');
  assert.equal(r.answerCallback.text, 'That request expired.');
  assert.match(r.edits[0].text, /expired — send it again/);
  // garbage data
  r = await tap('confirm:../../etc');
  assert.equal(r.answerCallback.text, 'Nothing to do.');
  assert.equal(calls.length, 0);
});

test('a confirm message that was never bound to a Telegram message cannot be confirmed', async () => {
  const { message, tap, calls } = harness();
  const { replies: [reply] } = await message('/rerun library');
  const r = await tap(`confirm:${reply.pendingId}`);
  assert.equal(r.answerCallback.text, 'Not yours.');
  assert.equal(calls.length, 0);
});

test('a confirm after the 10-minute TTL is told to send the request again', async () => {
  const { message, tap, bind, advance, calls } = harness();
  const { replies: [reply] } = await message('/rerun student-services');
  await bind(reply);
  advance(PENDING_TTL_SECONDS + 1);
  const r = await tap(`confirm:${reply.pendingId}`);
  assert.equal(r.answerCallback.text, 'That request expired.');
  assert.equal(calls.length, 0);
});

test('Cancel claims the action so a later Confirm does nothing', async () => {
  const { message, tap, bind, calls, pendingStore } = harness();
  const { replies: [reply] } = await message('/rerun dining');
  await bind(reply);
  const cancelled = await tap(`cancel:${reply.pendingId}`);
  assert.equal(cancelled.answerCallback.text, 'Cancelled.');
  assert.match(cancelled.edits[0].text, /cancelled\. Nothing was changed/);
  assert.equal((await pendingStore.get(reply.pendingId)).state, 'cancelled');
  const r = await tap(`confirm:${reply.pendingId}`);
  assert.equal(r.answerCallback.text, 'That request is already cancelled.');
  assert.equal(calls.length, 0);
});

test('one re-run per workflow per 30 minutes; other workflows are unaffected', async () => {
  const { message, tap, bind, advance, calls } = harness();
  const { replies: [first] } = await message('/rerun dining');
  await bind(first);
  await tap(`confirm:${first.pendingId}`);
  assert.equal(calls.length, 1);

  const { replies: [again] } = await message('/rerun dining');
  assert.equal(again.replyMarkup, undefined);
  assert.match(again.text, /already requested less than 30 min ago\. Try again in 30 min/);

  const { replies: [other] } = await message('/rerun library');
  assert.ok(other.replyMarkup, 'a different workflow still gets a confirm');

  advance(RERUN_COOLDOWN_SECONDS + 1);
  const { replies: [later] } = await message('/rerun dining');
  assert.ok(later.replyMarkup);
});

test('a failed dispatch is reported, recorded, and does not start the cooldown', async () => {
  const { message, tap, bind, pendingStore } = harness({ dispatchStatus: 422 });
  const { replies: [reply] } = await message('/rerun dining');
  await bind(reply);
  const r = await tap(`confirm:${reply.pendingId}`);
  assert.equal(r.answerCallback.text, 'Failed.');
  assert.match(r.edits[0].text, /^✗ GitHub refused the re-run \(HTTP 422 — nope\)\. Nothing was changed\./);
  assert.equal((await pendingStore.get(reply.pendingId)).state, 'failed');
  const { replies: [retry] } = await message('/rerun dining');
  assert.ok(retry.replyMarkup, 'the owner can try again immediately');
});

test('without a GitHub token or a store, /rerun refuses before changing anything', async () => {
  const noToken = harness({ githubToken: null });
  const { replies: [reply] } = await noToken.message('/rerun dining');
  await noToken.bind(reply);
  const r = await noToken.tap(`confirm:${reply.pendingId}`);
  assert.match(r.edits[0].text, /GITHUB_TOKEN is not configured/);
  assert.equal(noToken.calls.length, 0);

  const noStore = harness({ store: false });
  const { replies: [refused] } = await noStore.message('/rerun dining');
  assert.match(refused.text, /pending-action store is unavailable/);
  assert.equal(refused.replyMarkup, undefined);
  const tapped = await noStore.tap('confirm:0123456789abcdef');
  assert.match(tapped.answerCallback.text, /store is unavailable/);
});

test('a slow GitHub dispatch is cut off at the deadline and reported as not changed', async () => {
  let nowMs = T0;
  const pendingStore = createMemoryPendingStore({ now: () => new Date(nowMs) });
  const fetchImpl = (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const s = createTelegramService({ webhookSecret: SECRET, ownerIds: String(OWNER), fetchImpl, githubToken: 'x', pendingStore, timeoutMs: 20 });
  const record = await pendingStore.create({ action: 'rerun', args: { workflow: 'dining' }, ownerId: OWNER, chatId: OWNER });
  await pendingStore.bindMessage(record.id, 55);
  const started = Date.now();
  const r = await s.handle({ secretHeader: SECRET, update: {
    update_id: 1, callback_query: { id: 'cb', from: { id: OWNER }, message: { message_id: 55, chat: { id: OWNER, type: 'private' } }, data: `confirm:${record.id}` },
  } });
  assert.ok(Date.now() - started < 1_000);
  assert.match(r.edits[0].text, /GitHub didn't answer in time; nothing was changed/);
});
