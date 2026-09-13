import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/update-student-services-hours.yml', import.meta.url), 'utf8');
const api = await readFile(new URL('../api/student-services-hours.js', import.meta.url), 'utf8');
const vercel = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));

test('Student Life workflow runs every four hours in one bounded headed browser job', () => {
  assert.match(workflow, /cron: '57 \*\/4 \* \* \*'/);
  assert.match(workflow, /timeout-minutes: 15/);
  assert.match(workflow, /runs-on: ubuntu-24\.04/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /group: update-student-services-hours/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.ok(workflow.indexOf('Test Student Life pipeline') < workflow.indexOf('Scrape validated Student Life hours'));
  assert.match(workflow, /xvfb-run --auto-servernum node scripts\/student-services-hours-scraper\.mjs/);
  assert.match(workflow, /vars\.STUDENT_SERVICES_HOURS_PUBLISH_ENABLED == 'true'/);
  assert.match(workflow, /vars\.STUDENT_SERVICES_HOURS_API_URL/);
  assert.match(workflow, /secrets\.LIBRARY_HOURS_UPDATE_SECRET/);
  assert.match(workflow, /--retry 3 --retry-all-errors/);
  assert.match(workflow, /-X PUT/);
  assert.doesNotMatch(workflow, /STUDENT_SERVICES_HOURS_UPDATE_SECRET/);
  assert.doesNotMatch(workflow, /continue-on-error/);
});

test('Student Life always notifies Telegram with its validated summary', () => {
  assert.match(workflow, /notification_summary:/);
  assert.match(workflow, /workflow-notification-summary\.mjs --kind student-life/);
  assert.match(workflow, /notify:\n    needs: scrape-and-publish\n    if: \$\{\{ always\(\) \}\}/);
  assert.match(workflow, /source_label: Student Life/);
  assert.match(workflow, /secrets\.LIONTIME_TELEGRAM_BOT_TOKEN/);
});

test('Vercel exposes the isolated Student Life service with shared write authentication', () => {
  assert.deepEqual(vercel.functions['api/student-services-hours.js'], { maxDuration: 10 });
  assert.match(api, /createStudentServicesHoursService/);
  assert.match(api, /createStudentServicesHoursStore/);
  assert.match(api, /process\.env\.LIBRARY_HOURS_UPDATE_SECRET/);
});

test('Student Life refuses a publish that was not accepted, and checks the site afterwards', () => {
  // 2026-09-10: www.lionhour.com started 308-redirecting to the apex. curl does not
  // follow a redirect and --fail-with-body does not fail on one, so the PUT silently
  // stopped landing while the step stayed green for three days.
  const publishStep = workflow
    .slice(workflow.indexOf("- name: Publish validated attempt batch"))
    .split(/\n      - name: /)[0];
  assert.doesNotMatch(publishStep, /--fail-with-body/);
  assert.match(publishStep, /-w '%\{http_code\}'/);
  assert.match(workflow, /3\?\?\) echo "::error::/);
  assert.match(workflow, /point STUDENT_SERVICES_HOURS_API_URL at the apex domain/);

  assert.match(workflow, /- name: Verify the site is serving this run's snapshot/);
  assert.match(workflow, /verify-published-snapshot\.mjs\n\s+--kind student-life/);
  assert.match(workflow, /--local "\$RUNNER_TEMP\/student-services-hours\.json"/);
});
