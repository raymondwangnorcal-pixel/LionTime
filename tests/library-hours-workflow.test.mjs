import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(new URL('../.github/workflows/update-library-hours.yml', import.meta.url), 'utf8');

test('publisher runs every four hours with least privilege and a deployment gate', () => {
  assert.match(workflow, /cron: ['"]17 \*\/4 \* \* \*['"]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.match(workflow, /vars\.LIBRARY_HOURS_PUBLISH_ENABLED == 'true'/);
  assert.match(workflow, /vars\.LIBRARY_HOURS_API_URL/);
  assert.match(workflow, /secrets\.LIBRARY_HOURS_UPDATE_SECRET/);
});

test('Library always notifies Telegram with the validated summary', () => {
  assert.match(workflow, /notification_summary:/);
  assert.match(workflow, /workflow-notification-summary\.mjs --kind library/);
  assert.match(workflow, /notify:\n    needs: scrape-and-publish\n    if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /uses: \.\/\.github\/workflows\/send-telegram-update\.yml/);
  assert.match(workflow, /source_label: Library/);
  assert.match(workflow, /needs\.scrape-and-publish\.outputs\.notification_summary/);
  assert.match(workflow, /secrets\.LIONTIME_TELEGRAM_BOT_TOKEN/);
  assert.match(workflow, /secrets\.LIONTIME_TELEGRAM_CHAT_ID/);
});

test('Library refuses a publish that was not accepted, and checks the site afterwards', () => {
  // 2026-09-10: www.lionhour.com started 308-redirecting to the apex. curl does not
  // follow a redirect and --fail-with-body does not fail on one, so the PUT silently
  // stopped landing while the step stayed green for three days.
  const publishStep = workflow
    .slice(workflow.indexOf("- name: Publish validated snapshot"))
    .split(/\n      - name: /)[0];
  assert.doesNotMatch(publishStep, /--fail-with-body/);
  assert.match(publishStep, /-w '%\{http_code\}'/);
  assert.match(workflow, /3\?\?\) echo "::error::/);
  assert.match(workflow, /point LIBRARY_HOURS_API_URL at the apex domain/);

  assert.match(workflow, /- name: Verify the site is serving this run's snapshot/);
  assert.match(workflow, /verify-published-snapshot\.mjs\n\s+--kind library/);
  assert.match(workflow, /--local "\$RUNNER_TEMP\/library-hours\.json"/);
});
