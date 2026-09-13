import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('recreation publishing runs independently every four hours', async () => {
  const [workflow, libraryWorkflow, diningWorkflow] = await Promise.all([
    readFile('.github/workflows/update-recreation-hours.yml', 'utf8'),
    readFile('.github/workflows/update-library-hours.yml', 'utf8'),
    readFile('.github/workflows/update-dining-hours.yml', 'utf8'),
  ]);

  assert.match(workflow, /cron: ['"]27 \*\/4 \* \* \*['"]/);
  assert.notEqual(scheduledMinute(workflow), scheduledMinute(libraryWorkflow));
  assert.notEqual(scheduledMinute(workflow), scheduledMinute(diningWorkflow));
  assert.match(workflow, /xvfb-run --auto-servernum node scripts\/recreation-hours-scraper\.mjs/);
  assert.match(workflow, /vars\.RECREATION_HOURS_PUBLISH_ENABLED == 'true'/);
  assert.match(workflow, /vars\.RECREATION_HOURS_API_URL/);
  assert.match(workflow, /secrets\.LIBRARY_HOURS_UPDATE_SECRET/);
  assert.doesNotMatch(workflow, /DINING_HOURS_API_URL|LIBRARY_HOURS_API_URL/);
});

test('Recreation always notifies Telegram with its validated summary', async () => {
  const workflow = await readFile('.github/workflows/update-recreation-hours.yml', 'utf8');
  assert.match(workflow, /notification_summary:/);
  assert.match(workflow, /workflow-notification-summary\.mjs --kind recreation/);
  assert.match(workflow, /notify:\n    needs: scrape-and-publish\n    if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /source_label: Recreation/);
  assert.match(workflow, /secrets\.LIONTIME_TELEGRAM_BOT_TOKEN/);
});

function scheduledMinute(workflow) {
  return workflow.match(/cron: ['"](\d+) \*\/4 \* \* \*['"]/)?.[1];
}

test('Recreation refuses a publish that was not accepted, and checks the site afterwards', async () => {
  const workflow = await readFile('.github/workflows/update-recreation-hours.yml', 'utf8');

  // 2026-09-10: www.lionhour.com started 308-redirecting to the apex. curl does not
  // follow a redirect and --fail-with-body does not fail on one, so the PUT silently
  // stopped landing while the step stayed green for three days.
  const publishStep = workflow
    .slice(workflow.indexOf("- name: Publish validated snapshot"))
    .split(/\n      - name: /)[0];
  assert.doesNotMatch(publishStep, /--fail-with-body/);
  assert.match(publishStep, /-w '%\{http_code\}'/);
  assert.match(workflow, /3\?\?\) echo "::error::/);
  assert.match(workflow, /point RECREATION_HOURS_API_URL at the apex domain/);

  assert.match(workflow, /- name: Verify the site is serving this run's snapshot/);
  assert.match(workflow, /verify-published-snapshot\.mjs\n\s+--kind recreation/);
  assert.match(workflow, /--local "\$RUNNER_TEMP\/recreation-hours\.json"/);
});
