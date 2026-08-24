import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const workflow = fs.readFileSync(new URL('../.github/workflows/update-dining-hours.yml', import.meta.url), 'utf8');
const vercel = JSON.parse(fs.readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const api = fs.readFileSync(new URL('../api/dining-hours.js', import.meta.url), 'utf8');

test('dining publisher runs independently every four hours with least privilege', () => {
  assert.match(workflow, /cron: ['"]47 \*\/4 \* \* \*['"]/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /contents: read/);
  assert.doesNotMatch(workflow, /contents: write/);
  assert.match(workflow, /concurrency:\s*[\s\S]*group: update-dining-hours/);
  assert.match(workflow, /timeout-minutes: 15/);
});

test('workflow installs Chromium, tests, scrapes, and publishes behind configuration', () => {
  assert.match(workflow, /runs-on: macos-15/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npx playwright install chromium/);
  assert.doesNotMatch(workflow, /--with-deps/);
  assert.match(workflow, /node --test tests\/dining-hours-/);
  assert.match(workflow, /run: node scripts\/dining-hours-scraper\.mjs --json-out/);
  assert.doesNotMatch(workflow, /xvfb-run/);
  assert.match(workflow, /Publish validated source attempts/);
  assert.match(workflow, /vars\.DINING_HOURS_PUBLISH_ENABLED == 'true'/);
  assert.match(workflow, /vars\.DINING_HOURS_API_URL/);
  assert.match(workflow, /secrets\.LIBRARY_HOURS_UPDATE_SECRET/);
  assert.match(workflow, /--retry-all-errors/);
  assert.match(workflow, /Verify live Barnard Dining publication/);
  assert.match(workflow, /node scripts\/verify-live-barnard-dining\.mjs/);
  assert.match(workflow, /DINING_HOURS_API_URL/);
});

test('Vercel exposes a bounded dining API backed by the dining service', () => {
  assert.deepEqual(vercel.functions['api/dining-hours.js'], { maxDuration: 10 });
  assert.match(api, /createDiningHoursService/);
  assert.match(api, /createDiningHoursStore/);
  assert.match(api, /LIBRARY_HOURS_UPDATE_SECRET/);
});
