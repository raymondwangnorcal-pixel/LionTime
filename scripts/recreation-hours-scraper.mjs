import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { validateRecreationHoursSnapshot } from '../lib/recreation-hours-schema.js';
import { resolveRecreationSnapshot } from '../lib/recreation-hours-resolver.js';
import {
  parseBarnardHours,
  parseColumbiaHours,
  parseColumbiaModifications,
} from '../lib/recreation-source-parser.js';
import { acquireRecreationSources } from './recreation-hours-acquire.mjs';

const PARSER_SOURCES = Object.freeze([
  ['columbiaHours', 'parseColumbiaHours'],
  ['columbiaModifications', 'parseColumbiaModifications'],
  ['barnardFitness', 'parseBarnardHours'],
]);
const REQUIRED_FACILITIES = new Set(['dodge', 'uris-pool', 'barnard-fitness']);
const MAX_ERROR_LENGTH = 400;

export async function runRecreationScraper({
  acquire = acquireRecreationSources,
  parsers = { parseColumbiaHours, parseColumbiaModifications, parseBarnardHours },
  resolve = resolveRecreationSnapshot,
  validate = validateRecreationHoursSnapshot,
  writeJson = writeFormattedJson,
  outputPath,
} = {}) {
  if (typeof outputPath !== 'string' || !outputPath) throw new Error('missing --json-out path');

  const acquired = await acquire();
  const evidence = parseAllSources(acquired, parsers);
  if (!hasRequiredFacilities(evidence)) throw invalidSnapshotError('missing required facility evidence');

  const snapshot = resolve({ evidence, generated: acquired.generated });
  const validation = validate(snapshot);
  if (!validation.ok) throw invalidSnapshotError(validation.errors?.[0]);

  await writeJson(outputPath, validation.value);
  return validation.value;
}

function parseAllSources(acquired, parsers) {
  if (!acquired || !(acquired.generated instanceof Date) || !acquired.pages || typeof acquired.pages !== 'object') {
    throw invalidSnapshotError('acquisition returned incomplete data');
  }

  return PARSER_SOURCES.flatMap(([sourceId, parserName]) => {
    const html = acquired.pages[sourceId]?.html;
    const parser = parsers?.[parserName];
    if (typeof html !== 'string' || typeof parser !== 'function') {
      throw invalidSnapshotError(`missing ${sourceId} source or parser`);
    }
    const parsed = parser(html);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw invalidSnapshotError(`no usable ${sourceId} evidence`);
    }
    return parsed;
  });
}

function hasRequiredFacilities(evidence) {
  return evidence.every(item => item && typeof item === 'object')
    && [...REQUIRED_FACILITIES].every(targetId => evidence.some(item => item.targetId === targetId));
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
