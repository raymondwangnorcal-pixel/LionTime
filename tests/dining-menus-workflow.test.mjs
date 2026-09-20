import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(new URL('../.github/workflows/update-dining-menus.yml', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../assets/dining-menus.js', import.meta.url), 'utf8');

test('menus publish to the API and never push to main', () => {
  // 2026-09-18: a ruleset requiring pull requests rejected the commit (GH013) every two
  // hours while the scrape stayed green, and the site served stale menus for two days.
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.doesNotMatch(workflow, /git push/);
  assert.doesNotMatch(workflow, /git commit/);
  assert.match(workflow, /cron: ['"]17 \*\/2 \* \* \*['"]/);
  assert.match(workflow, /vars\.DINING_MENUS_PUBLISH_ENABLED == 'true'/);
  assert.match(workflow, /vars\.DINING_MENUS_API_URL/);
  assert.match(workflow, /secrets\.LIBRARY_HOURS_UPDATE_SECRET/);
});

test('refuses a publish that was not accepted, and checks the site afterwards', () => {
  const publishStep = workflow
    .slice(workflow.indexOf('- name: Publish validated menus'))
    .split(/\n      - name: /)[0];
  assert.doesNotMatch(publishStep, /--fail-with-body/);
  assert.match(publishStep, /-w '%\{http_code\}'/);
  assert.match(publishStep, /3\?\?\) echo "::error::/);
  assert.match(publishStep, /point DINING_MENUS_API_URL at the apex domain/);

  assert.match(workflow, /- name: Verify the site is serving this run's menus/);
  assert.match(workflow, /verify-published-snapshot\.mjs\n\s+--kind dining-menus/);
  assert.match(workflow, /--local "\$RUNNER_TEMP\/dining-menus\.json"/);
});

test('a failed scrape publishes nothing and still notifies', () => {
  assert.match(workflow, /steps\.scrape\.outcome == 'success' && vars\.DINING_MENUS_PUBLISH_ENABLED/);
  assert.match(workflow, /Nothing was published, so the site is serving the last good menus/);
  assert.match(workflow, /needs\.scrape-and-publish\.result != 'success'/);
  assert.match(workflow, /source_label: Dining Menus/);
});

test('the client reads the API and keeps the committed copy as a fallback', () => {
  assert.match(client, /var MENU_API_URL\s*=\s*'\/api\/dining-menus'/);
  assert.match(client, /var MENU_DATA_URL\s*=\s*'data\/menus\.json'/);
  const hydrate = client.slice(client.indexOf('function hydrate()')).split('/* ──')[0];
  assert.match(hydrate, /fetchMenus\(MENU_API_URL\)/);
  assert.match(hydrate, /fetchMenus\(MENU_DATA_URL\)/);
  assert.ok(hydrate.indexOf('MENU_API_URL') < hydrate.indexOf('MENU_DATA_URL'), 'the API must be tried first');
});
