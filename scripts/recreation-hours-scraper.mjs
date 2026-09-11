import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { validateRecreationHoursSnapshot } from '../lib/recreation-hours-schema.js';
import { resolveRecreationSnapshot } from '../lib/recreation-hours-resolver.js';
import { RECREATION_MANUAL_OVERRIDES } from '../lib/recreation-hours-manual-overrides.js';
import {
  parseBarnardHours,
  parseActivityCalendar,
  parseColumbiaHours,
  parseColumbiaModifications,
  isSafeEmptyColumbiaModificationsPage,
} from '../lib/recreation-source-parser.js';
import { RECREATION_FACILITIES, RECREATION_SOURCE_URLS } from '../lib/recreation-hours-catalog.js';
import { createScrapeManifest } from '../lib/scrape-manifest.js';
import { acquireRecreationSources } from './recreation-hours-acquire.mjs';

const PARSER_SOURCES = Object.freeze([
  ['columbiaHours', 'parseColumbiaHours'],
  ['columbiaModifications', 'parseColumbiaModifications'],
  ['barnardFitness', 'parseBarnardHours'],
]);
const REQUIRED_FACILITIES = new Set(['dodge', 'uris-pool', 'barnard-fitness']);
const SOURCE_PRIMARY_FACILITIES = Object.freeze({
  columbiaHours: ['dodge', 'uris-pool'],
  barnardFitness: ['barnard-fitness'],
});
const MAX_ERROR_LENGTH = 400;

export async function runRecreationScraper({
  acquire = acquireRecreationSources,
  parsers = { parseColumbiaHours, parseColumbiaModifications, parseBarnardHours, parseActivityCalendar },
  resolve = resolveRecreationSnapshot,
  validate = validateRecreationHoursSnapshot,
  writeJson = writeFormattedJson,
  outputPath,
  manualOverrides = RECREATION_MANUAL_OVERRIDES,
  manifest = createScrapeManifest({ category: 'recreation' }),
} = {}) {
  if (typeof outputPath !== 'string' || !outputPath) throw new Error('missing --json-out path');

  let acquired;
  try {
    acquired = await acquire();
  } catch (error) {
    // Nothing came back at all (browser launch, no network). Every source is a
    // navigation failure as far as the manifest is concerned; write it, then fail.
    const text = `${error?.name || ''} ${error?.message || ''}`;
    for (const [sourceId] of PARSER_SOURCES) {
      manifest.record({
        sourceId, sourceUrl: RECREATION_SOURCE_URLS[sourceId], result: 'failure',
        failureCode: /timeout/i.test(text) ? 'timeout' : 'navigation', detail: error?.message,
      });
    }
    await writeManifestQuietly(manifest);
    throw error;
  }

  try {
    const { evidence: parsedEvidence, deniedSourceIds } = parseAllSources(acquired, parsers, manifest);
    const evidence = [...parsedEvidence, ...manualOverrides];
    const deniedFacilities = new Set(deniedSourceIds.flatMap(id => SOURCE_PRIMARY_FACILITIES[id] || []));
    if (!hasRequiredFacilities(evidence, deniedFacilities)) throw invalidSnapshotError('missing required facility evidence');

    const snapshot = resolve({ evidence, generated: acquired.generated });
    if (deniedFacilities.size > 0) {
      snapshot.accessDenied = [...deniedFacilities].map(id => ({
        id,
        name: RECREATION_FACILITIES[id].name,
      }));
    }
    const validation = validate(snapshot);
    if (!validation.ok) throw invalidSnapshotError(validation.errors?.[0]);

    await writeJson(outputPath, validation.value);
    return validation.value;
  } finally {
    // The manifest is written before the exit decision is visible to anyone (R14).
    await writeManifestQuietly(manifest);
  }
}

async function writeManifestQuietly(manifest) {
  try {
    await manifest.write();
  } catch (error) {
    console.error(`Recreation scrape manifest could not be written: ${boundedText(error?.message)}`);
  }
}

/**
 * Parses every source and records each outcome in the manifest before throwing
 * the first error, so one broken page does not hide the state of the others.
 */
function parseAllSources(acquired, parsers, manifest) {
  if (!acquired || !(acquired.generated instanceof Date) || !acquired.pages || typeof acquired.pages !== 'object') {
    throw invalidSnapshotError('acquisition returned incomplete data');
  }

  const deniedSourceIds = [];
  let firstError = null;
  const evidence = PARSER_SOURCES.flatMap(([sourceId, parserName]) => {
    const page = acquired.pages[sourceId];
    const sourceUrl = page?.url || RECREATION_SOURCE_URLS[sourceId];
    if (page?.accessDenied) {
      deniedSourceIds.push(sourceId);
      manifest.record(
        { sourceId, sourceUrl, result: 'failure', failureCode: page.failureCode || 'challenge', detail: page.failureDetail || 'access denied' },
        typeof page.evidenceHtml === 'string' ? { body: page.evidenceHtml } : null,
      );
      return [];
    }
    const html = page?.html;
    const parser = parsers?.[parserName];
    if (typeof html !== 'string' || typeof parser !== 'function') {
      const detail = `missing ${sourceId} source or parser`;
      manifest.record({ sourceId, sourceUrl, result: 'failure', failureCode: 'missing-content', detail });
      firstError ||= invalidSnapshotError(detail);
      return [];
    }
    let parsed;
    try {
      parsed = parser(html, { generated: acquired.generated });
    } catch (error) {
      const detail = `${sourceId} parser threw: ${error?.message || 'error'}`;
      manifest.record({ sourceId, sourceUrl, result: 'failure', failureCode: 'parse', detail }, { body: html });
      firstError ||= invalidSnapshotError(detail);
      return [];
    }
    const recognizedEmptyModifications = sourceId === 'columbiaModifications'
      && Array.isArray(parsed)
      && parsed.length === 0
      && isSafeEmptyColumbiaModificationsPage(html);
    if (!Array.isArray(parsed) || (parsed.length === 0 && !recognizedEmptyModifications)) {
      const detail = `no usable ${sourceId} evidence`;
      manifest.record({ sourceId, sourceUrl, result: 'failure', failureCode: 'parse', detail }, { body: html });
      firstError ||= invalidSnapshotError(detail);
      return [];
    }
    manifest.record({ sourceId, sourceUrl, result: 'success' });
    return parsed;
  });
  if (firstError) throw firstError;

  const calendars = acquired.pages.columbiaHours?.activityCalendars;
  const calendarParser = parsers?.parseActivityCalendar;
  if (calendars && typeof calendars === 'object' && typeof calendarParser === 'function') {
    for (const calendar of Object.values(calendars)) {
      if (calendar?.result !== 'success') continue;
      try {
        const parsedCalendar = calendarParser(calendar, { generated: acquired.generated });
        if (Array.isArray(parsedCalendar)) evidence.push(...parsedCalendar);
      } catch {
        // Each embedded activity calendar is optional and fails independently.
      }
    }
  }
  return { evidence, deniedSourceIds };
}

function hasRequiredFacilities(evidence, deniedFacilities = new Set()) {
  return evidence.every(item => item && typeof item === 'object')
    && [...REQUIRED_FACILITIES].every(targetId =>
      deniedFacilities.has(targetId) || evidence.some(item => item.targetId === targetId));
}

function invalidSnapshotError(detail = '') {
  return new Error(`invalid recreation snapshot${detail ? `: ${boundedText(detail)}` : ''}`);
}

async function writeFormattedJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

function outputPathFromArgs(args) {
  if (args.length !== 2 || args[0] !== '--json-out' || !args[1]) {
    throw new Error('usage: node scripts/recreation-hours-scraper.mjs --json-out <path>');
  }
  return args[1];
}

function boundedText(value) {
  return String(value || 'unknown error').replace(/[\r\n\t]+/g, ' ').slice(0, MAX_ERROR_LENGTH);
}

async function main() {
  try {
    const snapshot = await runRecreationScraper({ outputPath: outputPathFromArgs(process.argv.slice(2)) });
    const finalDate = snapshot.facilities.find(facility => facility.id === 'dodge')?.days.at(-1)?.date;
    console.log(`Validated ${snapshot.facilities.length} recreation facilities through ${finalDate}`);
  } catch (error) {
    console.error(`Recreation hours scraper failed: ${boundedText(error?.message)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
