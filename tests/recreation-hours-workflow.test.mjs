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
