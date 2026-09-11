#!/usr/bin/env node
/**
 * Triage job entry point (docs/automated-fix.md §3). Reads a scrape manifest,
 * asks GitHub which autofix branches already exist (read-only), applies the
 * dedupe / cooldown / ceiling rules in lib/autofix-triage.js, and writes:
 *
 *   <out>/triage.json          full result for the later jobs and for humans
 *   $GITHUB_OUTPUT             count, selected (JSON, for a matrix), message
 *
 * No secrets beyond the read-only GITHUB_TOKEN; no model.
 *
 *   node scripts/autofix-triage.mjs --manifest evidence/manifest.json --evidence-dir evidence \
 *        --out triage [--force] [--enabled true|false] [--run-url URL]
 */

import { existsSync, readFileSync } from 'node:fs';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { describeTriage, shouldNotify, triageManifest } from '../lib/autofix-triage.js';

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}
const flag = name => process.argv.includes(name);

async function github(pathname, token) {
  const response = await fetch(`https://api.github.com${pathname}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`GitHub ${pathname} → HTTP ${response.status}`);
  return response.json();
}

/** Existing autofix/* branches with their tip commit time (the "created" time for our rules). */
export async function listAutofixBranches({ repo, token, fetchJson = github }) {
  const refs = await fetchJson(`/repos/${repo}/git/matching-refs/heads/autofix/`, token);
  const branches = [];
  for (const ref of (Array.isArray(refs) ? refs : []).slice(0, 60)) {
    const name = String(ref.ref || '').replace(/^refs\/heads\//, '');
    let createdAt = null;
    try {
      const commit = await fetchJson(`/repos/${repo}/commits/${ref.object?.sha}`, token);
      createdAt = commit?.commit?.committer?.date || commit?.commit?.author?.date || null;
    } catch { /* an unreadable commit counts as a branch with unknown age */ }
    branches.push({ name, createdAt });
  }
  return branches;
}

async function main() {
  const manifestPath = arg('--manifest');
  const evidenceDir = arg('--evidence-dir', manifestPath ? path.dirname(manifestPath) : null);
  const outDir = arg('--out', 'triage');
  if (!manifestPath) throw new Error('--manifest is required');

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const repo = process.env.GITHUB_REPOSITORY || 'raymondwangnorcal-pixel/LionTime';
  const token = process.env.GITHUB_TOKEN || null;
  const autofixBranches = flag('--no-github') ? [] : await listAutofixBranches({ repo, token });

  const evidenceCache = new Map();
  const readEvidence = (sourceId, evidencePath) => {
    if (!evidenceCache.has(evidencePath)) {
      try {
        evidenceCache.set(evidencePath, readFileSync(path.join(evidenceDir, path.basename(evidencePath)), 'utf8'));
      } catch { evidenceCache.set(evidencePath, null); }
    }
    return evidenceCache.get(evidencePath);
  };

  const fixtureExists = name => existsSync(path.join('tests/fixtures', name));
  const result = triageManifest({ manifest, readEvidence, autofixBranches, force: flag('--force'), fixtureExists });
  const enabled = arg('--enabled', 'false') === 'true';
  const message = describeTriage({ category: manifest.category, ...result, enabled, runUrl: arg('--run-url') });

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'triage.json'), `${JSON.stringify({ category: manifest.category, commit: manifest.commit, runId: manifest.runId, enabled, ...result, message }, null, 2)}\n`);
  process.stdout.write(`${message}\n`);
  for (const item of result.skipped) process.stdout.write(`skip ${item.sourceId ?? '-'}: ${item.reason}\n`);

  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `EOF_${Date.now()}`;
    await appendFile(process.env.GITHUB_OUTPUT, [
      `count=${result.selected.length}`,
      `selected=${JSON.stringify(result.selected)}`,
      `notify=${shouldNotify(result)}`,
      `message<<${delimiter}`, message, delimiter, '',
    ].join('\n'));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`autofix triage failed: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
