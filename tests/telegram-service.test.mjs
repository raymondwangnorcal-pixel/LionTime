import assert from 'node:assert/strict';
import test from 'node:test';

import { createTelegramService } from '../lib/telegram-service.js';

const OWNER = 8325088675;
const SECRET = 'test-webhook-secret';

function update(overrides = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 10,
      from: { id: OWNER, is_bot: false, first_name: 'Raymond' },
      chat: { id: OWNER, type: 'private' },
      text: '/help',
      ...overrides.message,
    },
    ...overrides.top,
  };
}

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body };
}

function service(extra = {}) {
  return createTelegramService({ webhookSecret: SECRET, ownerIds: String(OWNER), ...extra });
}

test('rejects a request without the webhook secret', async () => {
  const s = service();
  assert.deepEqual(await s.handle({ secretHeader: undefined, update: update() }), { status: 401, replies: [] });
  assert.deepEqual(await s.handle({ secretHeader: 'wrong', update: update() }), { status: 401, replies: [] });
});

test('drops messages from anyone not on the allowlist, and from groups, with HTTP 200', async () => {
  const s = service();
  const stranger = update({ message: { from: { id: 999 }, chat: { id: 999, type: 'private' } } });
  assert.deepEqual(await s.handle({ secretHeader: SECRET, update: stranger }), { status: 200, replies: [] });
  const group = update({ message: { chat: { id: -100123, type: 'supergroup' } } });
  assert.deepEqual(await s.handle({ secretHeader: SECRET, update: group }), { status: 200, replies: [] });
});

test('accepts any id on a comma-separated allowlist', async () => {
  const s = createTelegramService({ webhookSecret: SECRET, ownerIds: ' 111 , 8325088675 ' });
  const result = await s.handle({ secretHeader: SECRET, update: update() });
  assert.equal(result.replies.length, 1);
});

test('drops a redelivered update_id', async () => {
  const seen = new Set();
  const s = service({ dedupe: async (id) => (seen.has(id) ? false : (seen.add(id), true)) });
  const first = await s.handle({ secretHeader: SECRET, update: update() });
  const again = await s.handle({ secretHeader: SECRET, update: update() });
  assert.equal(first.replies.length, 1);
  assert.equal(again.replies.length, 0);
});

test('/help and unknown text both reply with the command list', async () => {
  const s = service();
  const help = await s.handle({ secretHeader: SECRET, update: update() });
  assert.match(help.replies[0].text, /\/status/);
  const free = await s.handle({ secretHeader: SECRET, update: update({ message: { text: 'butler is closed' } }) });
  assert.equal(free.replies[0].text, s.HELP);
  const suffixed = await s.handle({ secretHeader: SECRET, update: update({ message: { text: '/help@LionHourBot' } }) });
  assert.equal(suffixed.replies[0].text, s.HELP);
});

test('/status labels each feed live, stale, out of date, or unavailable', async () => {
  const nowMs = Date.parse('2026-09-10T20:00:00Z');
  const generated = {
    'library-hours': '2026-09-10T19:30:00Z',       // 30 min → live
    'dining-hours': '2026-09-10T08:00:00Z',        // 12 h → stale
    'recreation-hours': '2026-09-08T12:00:00Z',    // >1 day → out of date
  };
  const fetchImpl = async (url) => {
    const path = url.split('/api/')[1];
    if (path === 'student-services-hours') throw Object.assign(new Error('boom'), { name: 'TypeError' });
    return jsonResponse({ generated: generated[path] });
  };
  const s = service({ fetchImpl, now: () => new Date(nowMs) });
  const { replies } = await s.handle({ secretHeader: SECRET, update: update({ message: { text: '/status' } }) });
  const text = replies[0].text;
  assert.match(text, /✓ Library: live/);
  assert.match(text, /~ Dining: stale/);
  assert.match(text, /✗ Recreation: out of date/);
  assert.match(text, /✗ Student Life: unavailable/);
  assert.match(text, /3:30 PM ET/);
});

test('/prs lists open pull requests with check state, and reports GitHub outages honestly', async () => {
  const fetchImpl = async (url) => {
    if (url.includes('/pulls?')) {
      return jsonResponse([
        { number: 14, title: 'Fix Health parser', html_url: 'https://github.com/x/y/pull/14', head: { sha: 'abcdef1234567' } },
        { number: 15, title: 'Add bot', html_url: 'https://github.com/x/y/pull/15', head: { sha: '1234567abcdef' } },
      ]);
    }
    if (url.includes('/commits/abcdef1234567/')) {
      return jsonResponse({ check_runs: [{ name: 'test', status: 'completed', conclusion: 'success' }] });
    }
    return jsonResponse({ check_runs: [{ name: 'test', status: 'completed', conclusion: 'failure' }] });
  };
  const s = service({ fetchImpl });
  const { replies } = await s.handle({ secretHeader: SECRET, update: update({ message: { text: '/prs' } }) });
  assert.match(replies[0].text, /#14 Fix Health parser\n   abcdef1 · checks: passing/);
  assert.match(replies[0].text, /#15 Add bot\n   1234567 · checks: failing \(test\)/);

  const down = service({ fetchImpl: async () => jsonResponse({}, 503) });
  const outage = await down.handle({ secretHeader: SECRET, update: update({ message: { text: '/prs' } }) });
  assert.match(outage.replies[0].text, /GitHub didn't answer \(HTTP 503\)/);
});

test('a slow dependency is cut off at the deadline instead of hanging the handler', async () => {
  const fetchImpl = (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
  });
  const s = service({ fetchImpl, timeoutMs: 20 });
  const started = Date.now();
  const { replies } = await s.handle({ secretHeader: SECRET, update: update({ message: { text: '/status' } }) });
  assert.ok(Date.now() - started < 1_000);
  assert.match(replies[0].text, /unavailable \(timeout\)/);
});

test('a button tap is acknowledged but does nothing in v1', async () => {
  const s = service();
  const result = await s.handle({ secretHeader: SECRET, update: {
    update_id: 2,
    callback_query: { id: 'cb1', from: { id: OWNER }, message: { chat: { id: OWNER, type: 'private' } }, data: 'confirm:xyz' },
  } });
  assert.deepEqual(result.replies, []);
  assert.equal(result.answerCallback.id, 'cb1');
});
