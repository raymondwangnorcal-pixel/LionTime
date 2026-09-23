import assert from 'node:assert/strict';
import test from 'node:test';

import { createDispatchHandler, JOBS } from '../api/dispatch.js';
import { dispatchWorkflow } from '../lib/github-dispatch.js';

const SECRET = 'dispatch-secret-0123456789';
const ENV = { OUTREACH_DISPATCH_SECRET: SECRET, TICKET_DISPATCH_REPO: 'o/r', TICKET_DISPATCH_TOKEN: 'tok' };

function fakeRes() {
  const res = { headers: {}, statusCode: null, body: null };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

const GOOD = `Bearer ${SECRET}`;

async function call({ method = 'POST', authorization = GOOD, query = { job: 'draft' }, body, env = ENV, queued = true } = {}) {
  const calls = [];
  const handler = createDispatchHandler({ env, dispatch: async (workflow) => { calls.push(workflow); return queued; } });
  const res = fakeRes();
  await handler({ method, headers: authorization === null ? {} : { authorization }, query, body }, res);
  return { res, calls };
}

test('a correct secret starts exactly the named workflow', async () => {
  const { res, calls } = await call();
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, job: 'draft' });
  assert.deepEqual(calls, ['draft.yml']);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});

test('every allowlisted job maps to its workflow file and nothing else is accepted', async () => {
  for (const [job, workflow] of Object.entries(JOBS)) {
    const { res, calls } = await call({ query: { job } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(calls, [workflow]);
  }
  for (const job of ['tests', '../x', '', undefined, 'draft.yml']) {
    const { res, calls } = await call({ query: { job } });
    assert.equal(res.statusCode, 400);
    assert.deepEqual(calls, []);
  }
});

test('the job may also come in the body, for schedulers that cannot set a query string', async () => {
  const { res, calls } = await call({ query: {}, body: { job: 'send' } });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(calls, ['send.yml']);
});

test('a wrong, missing or malformed secret never dispatches', async () => {
  for (const authorization of [null, '', 'Bearer', 'Bearer nope', `Bearer ${SECRET}x`, `Bearer ${SECRET.slice(0, -1)}`, SECRET]) {
    const { res, calls } = await call({ authorization });
    assert.equal(res.statusCode, 401, `auth ${JSON.stringify(authorization)}`);
    assert.deepEqual(calls, []);
    assert.equal(res.body.ok, false);
  }
});

test('an unconfigured secret disables the endpoint instead of accepting everything', async () => {
  const { res, calls } = await call({ env: { ...ENV, OUTREACH_DISPATCH_SECRET: '' }, authorization: 'Bearer ' });
  assert.equal(res.statusCode, 503);
  assert.deepEqual(calls, []);
});

test('only POST is allowed', async () => {
  const { res, calls } = await call({ method: 'GET' });
  assert.equal(res.statusCode, 405);
  assert.deepEqual(calls, []);
});

test('a dispatch GitHub did not queue answers 502 so a retrying scheduler tries again', async () => {
  const { res } = await call({ queued: false });
  assert.equal(res.statusCode, 502);
  assert.deepEqual(res.body, { ok: false, job: 'draft' });
});

test('dispatchWorkflow calls the workflow_dispatch API and is true only on 204', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => { seen.push({ url, init }); return { status: 204 }; };
  assert.equal(await dispatchWorkflow('send.yml', { env: ENV, fetchImpl }), true);
  assert.equal(seen[0].url, 'https://api.github.com/repos/o/r/actions/workflows/send.yml/dispatches');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer tok');
  assert.deepEqual(JSON.parse(seen[0].init.body), { ref: 'main' });
  assert.equal(await dispatchWorkflow('send.yml', { env: ENV, fetchImpl: async () => ({ status: 422 }) }), false);
  assert.equal(await dispatchWorkflow('send.yml', { env: ENV, fetchImpl: async () => { throw new Error('net'); } }), false);
  assert.equal(await dispatchWorkflow('send.yml', { env: { ...ENV, TICKET_DISPATCH_TOKEN: '' }, fetchImpl }), false);
  assert.equal(await dispatchWorkflow('', { env: ENV, fetchImpl }), false);
});
