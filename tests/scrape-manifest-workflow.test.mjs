import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const WORKFLOWS = {
  dining: 'update-dining-hours.yml',
  library: 'update-library-hours.yml',
  recreation: 'update-recreation-hours.yml',
  'student-services': 'update-student-services-hours.yml',
};

for (const [category, file] of Object.entries(WORKFLOWS)) {
  test(`${category} workflow points the scraper at an evidence directory and uploads it on every outcome`, async () => {
    const workflow = await readFile(`.github/workflows/${file}`, 'utf8');

    // The scrape step is addressable and tells the scraper where evidence goes.
    const scrapeStep = workflow.match(/      - name: [^\n]+\n        id: scrape\n        env:\n          SCRAPE_EVIDENCE_DIR: \$\{\{ runner\.temp \}\}\/scrape\/([a-z-]+)\n        run: ([^\n]+)\n/);
    assert.ok(scrapeStep, 'scrape step with id and SCRAPE_EVIDENCE_DIR');
    assert.equal(scrapeStep[1], category);
    assert.match(scrapeStep[2], /scrape\.py|-scraper\.mjs/);

    // Upload runs even when the scrape failed (that is the point), for exactly 14 days.
    const upload = workflow.match(/      - name: Upload scrape manifest and evidence\n        if: \$\{\{ always\(\) && steps\.scrape\.outcome != 'skipped' \}\}\n        uses: actions\/upload-artifact@v4\n        with:\n          name: scrape-manifest-([a-z-]+)\n          path: \$\{\{ runner\.temp \}\}\/scrape\/([a-z-]+)\n          retention-days: 14\n/);
    assert.ok(upload, 'upload-artifact step for the evidence directory');
    assert.equal(upload[1], category);
    assert.equal(upload[2], category);

    // Upload comes after the scrape and before the notification summary.
    assert.ok(workflow.indexOf('id: scrape') < workflow.indexOf('Upload scrape manifest and evidence'));
    assert.ok(workflow.indexOf('Upload scrape manifest and evidence') < workflow.indexOf('Format notification summary'));

    // Evidence is never committed: no checkout with write, no git push.
    assert.doesNotMatch(workflow, /git (commit|push)/);
  });
}
