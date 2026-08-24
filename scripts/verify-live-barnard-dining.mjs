import { pathToFileURL } from 'node:url';

import { validateBarnardDiningHoursSnapshot } from '../lib/barnard-dining-hours-schema.js';

export const REQUIRED_BARNARD_DINING_IDS = Object.freeze([
  'hewitt',
  'diana-center-cafe',
  'barnard-bubble-tea-sushi',
  'lizs-place',
]);

export function verifyBarnardDiningSnapshot(snapshot) {
  const validation = validateBarnardDiningHoursSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error(`invalid Barnard Dining snapshot: ${validation.errors.join('; ')}`);
  }
  const venueIds = new Set(snapshot.venues.map(({ id }) => id));
  const missing = REQUIRED_BARNARD_DINING_IDS.filter(id => !venueIds.has(id));
  if (missing.length) throw new Error(`missing live Barnard Dining locations: ${missing.join(', ')}`);
  return snapshot;
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

export async function fetchVerifiedBarnardDining(apiUrl, {
  attempts = 3,
  fetchImpl = globalThis.fetch,
  sleep = delay,
} = {}) {
  if (!Number.isInteger(attempts) || attempts < 1 || attempts > 5) {
    throw new Error('verification attempts must be an integer from one through five');
  }
  const endpoint = new URL(apiUrl);
  if (endpoint.protocol !== 'https:') throw new Error('Dining verification URL must use HTTPS');
  endpoint.pathname = '/api/barnard-dining-hours';
  endpoint.search = '';

  let lastError = new Error('Dining verification did not run');
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const requestUrl = new URL(endpoint);
      requestUrl.searchParams.set('verify', `${Date.now()}-${attempt}`);
      const response = await fetchImpl(requestUrl, {
        headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) throw new Error(`Dining API returned HTTP ${response.status}`);
      return verifyBarnardDiningSnapshot(await response.json());
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Dining verification failed');
      if (attempt < attempts) await sleep(5_000);
    }
  }
  throw lastError;
}

async function main() {
  const apiUrl = process.env.DINING_HOURS_API_URL;
  if (!apiUrl) throw new Error('DINING_HOURS_API_URL is required');
  const snapshot = await fetchVerifiedBarnardDining(apiUrl);
  process.stdout.write(
    `Verified ${REQUIRED_BARNARD_DINING_IDS.length} live Barnard Dining locations in independent schema v${snapshot.schemaVersion}.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Barnard Dining publication verification failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
