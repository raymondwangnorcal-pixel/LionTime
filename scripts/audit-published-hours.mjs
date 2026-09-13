#!/usr/bin/env node
/**
 * Read every published hours endpoint and report what a green scrape run cannot:
 * a snapshot the site never received, or a venue the pipeline can no longer see.
 *
 * Usage:  node scripts/audit-published-hours.mjs --base-url https://lionhour.com
 *         node scripts/audit-published-hours.mjs --base-url … --json   # machine-readable
 *
 * Exits non-zero when there is anything to report, so a workflow fails loudly.
 */
import { pathToFileURL } from 'node:url';

import { MAX_SNAPSHOT_AGE_MS, auditAll, describeAudit } from '../lib/hours-audit.js';

export const AUDITED_PATHS = Object.freeze({
  library: '/api/library-hours',
  dining: '/api/dining-hours',
  'barnard-dining': '/api/barnard-dining-hours',
  recreation: '/api/recreation-hours',
  'student-services': '/api/student-services-hours',
});

export function parseArgs(argv) {
  const args = { 'base-url': 'https://lionhour.com' };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag.startsWith('--')) continue;
    if (flag === '--json') { args.json = true; continue; }
    args[flag.slice(2)] = argv[index + 1];
    index += 1;
  }
  return args;
}

/** Cache-busted so the audit sees the store, not an edge copy inside stale-while-revalidate. */
export async function fetchSnapshots(baseUrl, { fetchImpl = globalThis.fetch } = {}) {
  const snapshots = {};
  for (const [category, path] of Object.entries(AUDITED_PATHS)) {
    const url = new URL(path, baseUrl);
    url.searchParams.set('audit', String(Date.now()));
    try {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' } });
      snapshots[category] = response.ok ? await response.json() : null;
    } catch {
      snapshots[category] = null;
    }
  }
  return snapshots;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const maxAgeMs = args['max-age-hours'] ? Number(args['max-age-hours']) * 3_600_000 : MAX_SNAPSHOT_AGE_MS;
  const snapshots = await fetchSnapshots(args['base-url']);
  const audit = auditAll({ snapshots, maxAgeMs });

  process.stdout.write(args.json ? `${JSON.stringify(audit, null, 2)}\n` : `${describeAudit(audit)}\n`);
  if (!audit.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`Hours audit could not run: ${error.message}\n`);
    process.exitCode = 1;
  });
}
