import { rename, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { createScrapeManifest } from '../lib/scrape-manifest.js';
import { STUDENT_SERVICES_SOURCE_IDS, STUDENT_SERVICES_SOURCE_URLS } from '../lib/student-services-hours-catalog.js';
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

/** The raw body a parser was given, in the shape the manifest stores it. */
function payloadEvidence(payload) {
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.html === 'string') return { body: payload.html, extension: 'html' };
  if (typeof payload.calendarHtml === 'string') return { body: payload.calendarHtml, extension: 'html' };
  if (typeof payload.calendarText === 'string') return { body: payload.calendarText, extension: 'txt' };
  if (typeof payload.homeHtml === 'string') return { body: payload.homeHtml, extension: 'html' };
  if (typeof payload.text === 'string') return { body: payload.text, extension: 'txt' };
  if (payload.data !== undefined) return { body: JSON.stringify(payload.data, null, 2), extension: 'json' };
  return null;
}

function recordAcquisitionFailures(manifest, sources, detailFallback) {
  const byId = new Map((sources || []).map(source => [source.sourceId, source]));
  for (const sourceId of STUDENT_SERVICES_SOURCE_IDS) {
    const source = byId.get(sourceId);
    manifest.record({
      sourceId,
      sourceUrl: source?.sourceUrl || STUDENT_SERVICES_SOURCE_URLS[sourceId],
      result: 'failure',
      failureCode: source?.failureCode || 'navigation',
      detail: source?.failureDetail || detailFallback,
    }, source?.evidence || null);
  }
}

export async function scrapeStudentServicesHours({
  acquireImpl = acquireStudentServicesSources,
  now = new Date(),
  outputPath = null,
  logger = console,
  manifest = createScrapeManifest({ category: 'student-services' }),
} = {}) {
  let acquired;
  try {
    acquired = await acquireImpl({ now });
  } catch (error) {
    // Total acquisition failure still produces a manifest (R14), then fails the run.
    recordAcquisitionFailures(manifest, error?.sources, error?.message);
    await writeManifestQuietly(manifest, logger);
    throw error;
  }
  const generated = acquired.generated instanceof Date ? acquired.generated : new Date(acquired.generated);
  if (Number.isNaN(generated.getTime())) throw new Error('Student Life acquisition timestamp is invalid');

  const byId = new Map(acquired.sources.map(source => [source.sourceId, source]));
  const attempts = STUDENT_SERVICES_SOURCE_IDS.map(sourceId => {
    const source = byId.get(sourceId);
    if (!source || source.result !== 'success') {
      const failureCode = source?.failureCode || 'unexpected';
      manifest.record({
        sourceId, sourceUrl: source?.sourceUrl || STUDENT_SERVICES_SOURCE_URLS[sourceId], result: 'failure',
        failureCode, detail: source?.failureDetail || `${sourceId} was not acquired`,
      }, source?.evidence || null);
      return failureAttempt(source || {
        sourceId,
        sourceUrl: null,
        failureCode: 'unexpected',
      }, generated, failureCode);
    }
    try {
      const evidence = PARSERS[sourceId](source.payload);
      const attempt = buildStudentServicesAttempt({
        sourceId,
        sourceUrl: source.sourceUrl,
        generated,
        evidence,
      });
      manifest.record({ sourceId, sourceUrl: source.sourceUrl, result: 'success' });
      return attempt;
    } catch (error) {
      logger.warn?.(`Student Life ${sourceId} parse failed: ${error?.message || 'unknown parse error'}`);
      const failureCode = parseFailureCode(error);
      manifest.record({
        sourceId, sourceUrl: source.sourceUrl, result: 'failure', failureCode,
        detail: `${sourceId} parse failed: ${error?.message || 'unknown parse error'}`,
      }, payloadEvidence(source.payload));
      return failureAttempt(source, generated, failureCode);
    }
  });
  // Written before any exit decision below (R14): the old order threw first and wrote nothing.
  await writeManifestQuietly(manifest, logger);

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

async function writeManifestQuietly(manifest, logger) {
  try {
    await manifest.write();
  } catch (error) {
    logger.warn?.(`Student Life scrape manifest could not be written: ${error?.message || 'unknown error'}`);
  }
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
