import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { scrapeStudentServicesHours } from '../scripts/student-services-hours-scraper.mjs';
import { readFileSync } from 'node:fs';

const fixture = name => readFileSync(new URL(`fixtures/${name}`, import.meta.url), 'utf8');
const generated = new Date('2026-08-23T16:00:00.000Z');

function acquisition({ failed = [] } = {}) {
  const payloads = {
    bookstore: { data: JSON.parse(fixture('student-services-bookstore.json')) },
    health: { html: fixture('student-services-health.html') },
    lerner: {
      homeHtml: fixture('student-services-lerner-home.html'),
      calendarHtml: fixture('student-services-lerner-calendar.html'),
      calendarUrl: 'https://lernerhall.columbia.edu/events',
    },
    mail: { html: fixture('student-services-mail.html') },
  };
  return {
    generated,
    sources: Object.keys(payloads).sort().map(sourceId => failed.includes(sourceId)
      ? { sourceId, sourceUrl: sourceUrl(sourceId), result: 'failure', failureCode: 'challenge' }
      : { sourceId, sourceUrl: sourceUrl(sourceId), result: 'success', payload: payloads[sourceId] }),
  };
}

function sourceUrl(sourceId) {
  return ({
    bookstore: 'https://columbia.bncollege.com/',
    health: 'https://www.health.columbia.edu/content/hours-and-locations',
    lerner: 'https://lernerhall.columbia.edu/',
    mail: 'https://mailservices.columbia.edu/content/locations-hours',
  })[sourceId];
}

test('writes a validated atomic batch while retaining isolated source failures', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'lionhour-student-'));
  const outputPath = path.join(directory, 'batch.json');
  const batch = await scrapeStudentServicesHours({
    now: generated,
    outputPath,
    logger: { warn() {} },
    acquireImpl: async () => acquisition({ failed: ['bookstore'] }),
  });
  assert.equal(batch.attempts.find(item => item.sourceId === 'bookstore').failureCode, 'challenge');
  assert.equal(batch.attempts.filter(item => item.result === 'success').length, 3);
  assert.deepEqual(JSON.parse(await readFile(outputPath, 'utf8')), batch);
});

test('converts a changed source shape into only that source parse failure', async () => {
  const acquired = acquisition();
  acquired.sources.find(item => item.sourceId === 'mail').payload.html = '<main>changed</main>';
  const batch = await scrapeStudentServicesHours({ acquireImpl: async () => acquired, logger: { warn() {} } });
  assert.equal(batch.attempts.find(item => item.sourceId === 'mail').failureCode, 'parse');
  assert.equal(batch.attempts.find(item => item.sourceId === 'health').result, 'success');
});

test('does not publish a batch when every source fails', async () => {
  await assert.rejects(() => scrapeStudentServicesHours({
    logger: { warn() {} },
    acquireImpl: async () => acquisition({ failed: ['bookstore', 'health', 'lerner', 'mail'] }),
  }), /all Student Life sources failed/);
});
