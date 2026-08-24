import { rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { STUDENT_SERVICES_SOURCE_IDS } from '../lib/student-services-hours-catalog.js';
import { buildStudentServicesAttempt } from '../lib/student-services-hours-resolver.js';
import { validateStudentServicesAttemptBatch } from '../lib/student-services-hours-schema.js';
import {
  parseBookstoreSource,
  parseHealthSource,
  parseLernerSource,
  parseMailSource,
} from '../lib/student-services-source-parser.js';
import { acquireStudentServicesSources } from './student-services-hours-acquire.mjs';

const PARSERS = Object.freeze({
  bookstore: payload => parseBookstoreSource(payload.data || payload.text),
  health: payload => parseHealthSource(payload.html),
  lerner: payload => parseLernerSource(payload),
  mail: payload => parseMailSource(payload.html),
});

function easternDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function failureAttempt(source, generated, failureCode = source.failureCode) {
  return {
    sourceId: source.sourceId,
    sourceUrl: source.sourceUrl,
    attemptedAt: generated.toISOString(),
    result: 'failure',
    failureCode,
    venues: [],
  };
}

function parseFailureCode(error) {
  return /ambiguous/i.test(error?.message || '') ? 'ambiguous' : 'parse';
}

export async function scrapeStudentServicesHours({
  acquireImpl = acquireStudentServicesSources,
  now = new Date(),
  outputPath = null,
  logger = console,
} = {}) {
  const acquired = await acquireImpl({ now });
  const generated = acquired.generated instanceof Date ? acquired.generated : new Date(acquired.generated);
  if (Number.isNaN(generated.getTime())) throw new Error('Student Life acquisition timestamp is invalid');

  const byId = new Map(acquired.sources.map(source => [source.sourceId, source]));
  const attempts = STUDENT_SERVICES_SOURCE_IDS.map(sourceId => {
    const source = byId.get(sourceId);
    if (!source || source.result !== 'success') {
      return failureAttempt(source || {
        sourceId,
        sourceUrl: null,
        failureCode: 'unexpected',
      }, generated, source?.failureCode || 'unexpected');
    }
    try {
      const evidence = PARSERS[sourceId](source.payload);
      return buildStudentServicesAttempt({
        sourceId,
        sourceUrl: source.sourceUrl,
        generated,
        evidence,
      });
    } catch (error) {
      logger.warn?.(`Student Life ${sourceId} parse failed: ${error?.message || 'unknown parse error'}`);
      return failureAttempt(source, generated, parseFailureCode(error));
    }
  });

  const windowStart = easternDate(generated);
  const batch = {
    schemaVersion: 1,
    generated: generated.toISOString(),
    windowStart,
    windowEnd: addDays(windowStart, 13),
    attempts,
  };
  const validation = validateStudentServicesAttemptBatch(batch);
  if (!validation.ok) throw new Error(`invalid Student Life attempt batch: ${validation.errors.join('; ')}`);
  if (attempts.every(attempt => attempt.result === 'failure')) {
    throw new Error('all Student Life sources failed parsing or acquisition');
  }
  if (outputPath) {
    const temporaryPath = `${outputPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify(batch)}\n`, { mode: 0o600 });
    await rename(temporaryPath, outputPath);
  }
  return batch;
}

function optionValue(argumentsList, option) {
  const index = argumentsList.indexOf(option);
  return index === -1 ? null : argumentsList[index + 1];
}

async function main() {
  const outputPath = optionValue(process.argv.slice(2), '--json-out');
  if (!outputPath) throw new Error('usage: student-services-hours-scraper.mjs --json-out PATH');
  const batch = await scrapeStudentServicesHours({ outputPath });
  const successes = batch.attempts.filter(attempt => attempt.result === 'success').length;
  process.stdout.write(`Student Life sources: ${successes}/${batch.attempts.length} succeeded\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
