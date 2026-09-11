import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createScrapeManifest, sha256, FIXABLE_FAILURE_CODES } from '../lib/scrape-manifest.js';

const now = () => new Date('2026-09-11T12:00:00.000Z');

test('records every source, keeps evidence only for failures, and writes manifest.json before anything exits', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'lionhour-manifest-'));
  const manifest = createScrapeManifest({
    category: 'student-services',
    dir,
    now,
    env: { GITHUB_SHA: 'abc123', GITHUB_RUN_ID: '42', GITHUB_RUN_ATTEMPT: '2' },
  });
  manifest.record({ sourceId: 'bookstore', sourceUrl: 'https://columbia.bncollege.com/', result: 'success' }, { body: '<main>ignored</main>' });
  manifest.record(
    { sourceId: 'health', sourceUrl: 'https://www.health.columbia.edu/content/hours-and-locations', result: 'failure', failureCode: 'parse', detail: 'Fall 2026 Operating Hours\nheading missing' },
    { body: '<main>Fall 2026</main>' },
  );
  manifest.record({ sourceId: 'mail', sourceUrl: null, result: 'failure', failureCode: 'navigation', detail: 'ECONNRESET' });
  manifest.record({ sourceId: 'lerner', result: 'failure', failureCode: 'missing-content' }, { body: '{"events":[]}', extension: 'json' });

  const written = await manifest.write();
  const onDisk = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'));
  assert.deepEqual(onDisk, written);
  assert.equal(onDisk.schemaVersion, 1);
  assert.equal(onDisk.category, 'student-services');
  assert.equal(onDisk.commit, 'abc123');
  assert.equal(onDisk.runId, '42');
  assert.equal(onDisk.runAttempt, 2);
  assert.deepEqual(onDisk.summary, { total: 4, succeeded: 1, failed: 3, fixable: ['health', 'lerner'] });

  const byId = Object.fromEntries(onDisk.sources.map(item => [item.sourceId, item]));
  assert.equal(byId.bookstore.evidencePath, null, 'successful sources carry no evidence');
  assert.equal(byId.bookstore.failureCode, null);
  assert.equal(byId.health.evidencePath, 'health.html');
  assert.equal(byId.health.evidenceSha256, createHash('sha256').update('<main>Fall 2026</main>').digest('hex'));
  assert.equal(byId.health.evidenceBytes, 22);
  assert.equal(byId.health.detail, 'Fall 2026 Operating Hours heading missing', 'detail is one bounded line');
  assert.equal(byId.mail.evidencePath, null, 'a navigation failure has no page to keep');
  assert.equal(byId.mail.failureCode, 'navigation');
  assert.equal(byId.lerner.evidencePath, 'lerner.json');

  const files = (await readdir(dir)).sort();
  assert.deepEqual(files, ['health.html', 'lerner.json', 'manifest.json']);
  assert.equal(await readFile(path.join(dir, 'health.html'), 'utf8'), '<main>Fall 2026</main>');
});

test('without a directory the manifest is in-memory only, and write() is harmless', async () => {
  const manifest = createScrapeManifest({ category: 'dining', dir: null, now, env: {} });
  manifest.record({ sourceId: 'cafe-east', result: 'failure', failureCode: 'parse' }, { body: 'x' });
  const written = await manifest.write();
  assert.equal(written.commit, null);
  assert.equal(written.sources[0].evidencePath, 'cafe-east.html');
  assert.equal(manifest.written, written);
});

test('a missing failure code is recorded as unexpected, and only parse/missing-content are fixable', () => {
  const manifest = createScrapeManifest({ category: 'library', dir: null, now, env: {} });
  manifest.record({ sourceId: 'butler', result: 'failure' });
  manifest.record({ sourceId: 'avery', result: 'failure', failureCode: 'challenge' });
  manifest.record({ sourceId: 'lehman', result: 'failure', failureCode: 'timeout' });
  assert.equal(manifest.sources[0].failureCode, 'unexpected');
  assert.deepEqual(manifest.toJSON().summary.fixable, []);
  assert.deepEqual(FIXABLE_FAILURE_CODES, ['parse', 'missing-content']);
});

test('evidence file names are derived safely from the source id', () => {
  const manifest = createScrapeManifest({ category: 'dining', dir: null, now, env: {} });
  const item = manifest.record({ sourceId: '../evil/../id with spaces', result: 'failure', failureCode: 'parse' }, { body: '<p>' });
  assert.equal(item.evidencePath, 'evil-id-with-spaces.html');
  assert.equal(sha256('<p>'), createHash('sha256').update('<p>').digest('hex'));
});
