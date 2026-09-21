import assert from 'node:assert/strict';
import test from 'node:test';

import { createTelegramService } from '../lib/telegram-service.js';
import { createRedisTicketStore, createTicketHandler } from '../lib/telegram-tickets.js';

const OWNER = 8325088675;
const SECRET = 'test-webhook-secret';
const ID = '0123456789abcdef';
const NOW = Date.parse('2026-09-21T13:10:00Z');

/** The slice of @upstash/redis the ticket store uses. */
function fakeRedis() {
  const data = new Map();
  return {
    data,
    async get(key) { const v = data.get(key); try { return JSON.parse(v); } catch { return v ?? null; } },
    async set(key, value, { nx } = {}) { if (nx && data.has(key)) return null; data.set(key, value); return 'OK'; },
    async exists(key) { return data.has(key) ? 1 : 0; },
    async getdel(key) { const v = data.get(key) ?? null; data.delete(key); return v; },
  };
}

function ticket(overrides = {}) {
  return {
    id: ID, kind: 'draft', hash: 'abc123', chatId: String(OWNER), messageId: '55',
    expiresAt: Math.floor(NOW / 1000) + 3600, verbs: { a: 'Approved', s: 'Skipped', e: 'Edit' },
    editVerb: 'e', editPrompt: 'Send the new value.', ...overrides,
  };
}

function setup({ t = ticket(), dispatch = async () => true, now = NOW } = {}) {
  const redis = fakeRedis();
  if (t) redis.data.set(`lionhour:tickets:ticket:${ID}`, JSON.stringify(t));
  const dispatched = [];
  const tickets = createTicketHandler({
    store: createRedisTicketStore(redis), now: () => new Date(now),
    dispatch: async (info) => { dispatched.push(info); return dispatch(info); },
  });
  const service = createTelegramService({ webhookSecret: SECRET, ownerIds: String(OWNER), tickets });
  return { redis, service, dispatched };
}

let updateId = 100;
function tap(verb, { from = OWNER, chat = OWNER, messageId = 55, id = ID } = {}) {
  return { secretHeader: SECRET, update: {
    update_id: updateId++,
    callback_query: { id: 'cb', from: { id: from }, message: { message_id: messageId, chat: { id: chat, type: 'private' } }, data: `t:${verb}:${id}` },
  } };
}
function say(text, { from = OWNER } = {}) {
  return { secretHeader: SECRET, update: {
    update_id: updateId++,
    message: { message_id: 77, from: { id: from }, chat: { id: from, type: 'private' }, text },
  } };
}
const verdictOf = (redis) => JSON.parse(redis.data.get(`lionhour:tickets:verdict:${ID}`) ?? 'null');

test('a tap records a verdict bound to the ticket hash and stamps the card', async () => {
  const { redis, service } = setup();
  const result = await service.handle(tap('a'));
  assert.deepEqual(verdictOf(redis), { verb: 'a', hash: 'abc123', userId: String(OWNER), chatId: String(OWNER), at: Math.floor(NOW / 1000) });
  assert.equal(result.answerCallback.text, 'Approved.');
  assert.match(result.markups[0].replyMarkup.inline_keyboard[0][0].text, /^Approved · 9:10 AM ET$/);
});

test('the first verdict wins; a second or redelivered tap cannot change it', async () => {
  const { redis, service } = setup();
  await service.handle(tap('s'));
  const second = await service.handle(tap('a'));
  assert.equal(verdictOf(redis).verb, 's');
  assert.equal(second.answerCallback.text, 'Already skipped.');
});

test('taps from strangers, other chats, other messages, or without the secret record nothing', async () => {
  const { redis, service } = setup();
  assert.deepEqual(await service.handle(tap('a', { from: 999, chat: 999 })), { status: 200, replies: [] });
  assert.equal((await service.handle(tap('a', { messageId: 56 }))).answerCallback.text, 'Not yours.');
  assert.equal((await service.handle({ ...tap('a'), secretHeader: 'wrong' })).status, 401);
  assert.equal(verdictOf(redis), null);
});

test('an unbound ticket, an expired ticket, and an unknown verb record nothing', async () => {
  let world = setup({ t: ticket({ messageId: null }) });
  assert.match((await world.service.handle(tap('a'))).answerCallback.text, /Not ready/);
  assert.equal(verdictOf(world.redis), null);

  world = setup({ t: ticket({ expiresAt: Math.floor(NOW / 1000) - 1 }) });
  assert.equal((await world.service.handle(tap('a'))).answerCallback.text, 'That card expired.');
  assert.equal(verdictOf(world.redis), null);

  world = setup();
  assert.equal((await world.service.handle(tap('q'))).answerCallback.text, 'Nothing to do.');
  assert.equal(verdictOf(world.redis), null);

  world = setup({ t: null });
  assert.equal((await world.service.handle(tap('a'))).answerCallback.text, 'That card expired.');
});

test('edit voids the ticket even after approval, then captures one line of text and dispatches', async () => {
  const { redis, service, dispatched } = setup();
  await service.handle(tap('a'));
  const edit = await service.handle(tap('e'));
  assert.ok(redis.data.has(`lionhour:tickets:void:${ID}`));
  assert.equal(edit.replies[0].text, 'Send the new value.');

  const saved = await service.handle(say('  Maria  \nBcc: someone@example.com'));
  assert.equal(JSON.parse(redis.data.get(`lionhour:tickets:edit:${ID}`)).text, 'Maria');
  assert.match(saved.replies[0].text, /needs its own approval/);
  assert.deepEqual(dispatched, [{ ticketId: ID, kind: 'draft' }]);

  // the wait is consumed: the next plain message is ordinary chat again
  const next = await service.handle(say('hello'));
  assert.equal(next.replies[0].text, service.HELP);
});

test('a voided ticket cannot be approved', async () => {
  const { redis, service } = setup();
  await service.handle(tap('e'));
  const result = await service.handle(tap('a'));
  assert.equal(result.answerCallback.text, 'That version was replaced.');
  assert.equal(verdictOf(redis), null);
});

test('a failed dispatch is reported honestly and commands never count as edit text', async () => {
  const { redis, service } = setup({ dispatch: async () => false });
  await service.handle(tap('e'));
  const command = await service.handle(say('/help'));
  assert.equal(command.replies[0].text, service.HELP);
  assert.equal(redis.data.has(`lionhour:tickets:edit:${ID}`), false);
  const saved = await service.handle(say('Maria'));
  assert.match(saved.replies[0].text, /could not be started/);
});

test('without a ticket handler the service behaves exactly as before', async () => {
  const service = createTelegramService({ webhookSecret: SECRET, ownerIds: String(OWNER) });
  const result = await service.handle(tap('a'));
  assert.equal(result.answerCallback.text, 'Nothing to do.');
});
