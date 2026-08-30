import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
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

  // Queries Vercel Analytics count endpoint with time windows
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

test('adds authenticated QR totals without suppressing the site report on QR failure', () => {
  const workflow = fs.readFileSync(
    new URL('../.github/workflows/report-site-views.yml', import.meta.url),
    'utf8'
  );

  assert.match(workflow, /QR_STATS_SECRET:\s*\$\{\{ secrets\.QR_STATS_SECRET \}\}/);
  assert.match(workflow, /https:\/\/www\.lionhour\.com\/api\/qr-stats/);
  assert.doesNotMatch(workflow, /qr_stats_api="https:\/\/lionhour\.com/);
  assert.match(workflow, /Authorization: Bearer \$QR_STATS_SECRET/);
  assert.match(workflow, /QR Poster Scans/);
  assert.match(workflow, /allTime.*today/s);
  assert.match(workflow, /QR scan report unavailable/);
  assert.match(workflow, /if qr_stats=.*curl/s);
});

test('QR report validation accepts all seven approved poster rows', () => {
  const workflow = fs.readFileSync(
    new URL('../.github/workflows/report-site-views.yml', import.meta.url),
    'utf8'
  );
  const match = workflow.match(/if qr_lines=\$\(jq -er '\n([\s\S]*?)\n\s*' <<< "\$qr_stats"\); then/);
  assert.ok(match, 'QR report jq program should be extractable from the workflow');

  const input = {
    posters: [
      { id: 'dodge', label: 'Dodge', allTime: 2, today: 1 },
      { id: 'butler', label: 'Butler', allTime: 1, today: 0 },
      { id: 'dining', label: 'General Dining', allTime: 1, today: 0 },
      { id: 'ferris', label: 'Ferris', allTime: 0, today: 0 },
      { id: 'hewitt', label: 'Hewitt', allTime: 0, today: 0 },
      { id: 'plug', label: 'Plug', allTime: 0, today: 0 },
      { id: 'feedback', label: 'Feedback', allTime: 0, today: 0 },
    ],
  };
  const result = spawnSync('jq', ['-er', match[1]], {
    input: JSON.stringify(input),
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Plug: 0 total · 0 today/);
  assert.match(result.stdout, /Feedback: 0 total · 0 today/);
});
