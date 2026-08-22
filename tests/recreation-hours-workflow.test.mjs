import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('recreation publishing runs independently every four hours', async () => {
  const workflow = await readFile('.github/workflows/update-recreation-hours.yml', 'utf8');

  assert.match(workflow, /cron: ['"](?:7|17|27|37|57) \*\/4 \* \* \*['"]/);
  assert.match(workflow, /xvfb-run --auto-servernum node scripts\/recreation-hours-scraper\.mjs/);
  assert.match(workflow, /vars\.RECREATION_HOURS_PUBLISH_ENABLED == 'true'/);
  assert.match(workflow, /vars\.RECREATION_HOURS_API_URL/);
  assert.match(workflow, /secrets\.LIBRARY_HOURS_UPDATE_SECRET/);
  assert.doesNotMatch(workflow, /DINING_HOURS_API_URL|LIBRARY_HOURS_API_URL/);
});
