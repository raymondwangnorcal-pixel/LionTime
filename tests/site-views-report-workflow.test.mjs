import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('site views report workflow has correct structure and safeguards', () => {
  const workflow = fs.readFileSync(
    new URL('../.github/workflows/report-site-views.yml', import.meta.url),
    'utf8'
  );

  // Runs every 6 hours and supports manual dispatch
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron:.*\*\/6/);
  assert.match(workflow, /workflow_dispatch/);

  // Minimal permissions
  assert.match(workflow, /permissions: \{\}/);

  // Uses correct secrets
  assert.match(workflow, /VERCEL_TOKEN/);
  assert.match(workflow, /VERCEL_PROJECT_ID/);
  assert.match(workflow, /LIONTIME_TELEGRAM_BOT_TOKEN/);
  assert.match(workflow, /LIONTIME_TELEGRAM_CHAT_ID/);

  // Queries Vercel Analytics count endpoint
  assert.match(workflow, /api\.vercel\.com.*web-analytics.*count/);

  // Sends via Telegram with safe curl options
  assert.match(workflow, /api\.telegram\.org/);
  assert.match(workflow, /--fail-with-body/);
  assert.match(workflow, /--retry 3/);
  assert.match(workflow, /--data-urlencode/);

  // Does not check out code or reference Hermes
  assert.doesNotMatch(workflow, /actions\/checkout/);
  assert.doesNotMatch(workflow, /hermes/i);
});
