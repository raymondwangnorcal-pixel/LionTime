#!/usr/bin/env node
/**
 * Fail a scrape run whose publish did not reach the site.
 *
 * Usage:
 *   node scripts/verify-published-snapshot.mjs --kind library \
 *     --local "$RUNNER_TEMP/library-hours.json" --api-url "$API_URL"
 *
 * Reads the `generated` stamp of the batch the run just PUT, fetches the endpoint,
 * and requires the two to match. See lib/publish-verification.js for why.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import {
  fetchPublishedSnapshot,
  readGenerated,
  verifyPublishedSnapshot,
} from '../lib/publish-verification.js';

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith('--')) continue;
    args[flag.slice(2)] = argv[index + 1];
    index += 1;
  }
  for (const required of ['kind', 'local', 'api-url']) {
    if (!args[required]) throw new Error(`--${required} is required`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const batch = JSON.parse(readFileSync(args.local, 'utf8'));
  const expectedGenerated = readGenerated(batch, `the ${args.kind} batch this run published`);
  const snapshot = await fetchPublishedSnapshot(args['api-url'], {
    attempts: Number(args.attempts) || 3,
  });
  verifyPublishedSnapshot({ expectedGenerated, snapshot });
  process.stdout.write(
    `Verified: lionhour.com is serving this run's ${args.kind} snapshot (generated ${expectedGenerated}).\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Publish verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
