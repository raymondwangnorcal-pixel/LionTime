/**
 * Autofix triage (docs/automated-fix.md §3, §3.3): decide, from a scrape manifest,
 * which failed sources get a generate job — with no secrets and no model.
 *
 * Pure: the caller supplies what it learned from GitHub. The rules, in order:
 *   1. only `parse` and `missing-content` failures are routable (§2)
 *   2. a `missing-content` page must contain the source's own name, else it is an
 *      outage, not a parser bug (R15)
 *   3. there must be evidence — no page, nothing to fix against
 *   4. the source must be in the registry (lib/autofix-sources.js)
 *   5. same page → same hash → same branch name → skip if that branch exists,
 *      whether or not the first attempt produced a PR (deleting the branch rearms)
 *   6. one attempt per source per 24 h (cooldown), measured on autofix branches for
 *      that source created in the window
 *   7. hard ceiling: three autofix branches per UTC day across all sources
 */

import { AUTOFIX_SOURCES } from './autofix-sources.js';

export const FIXABLE_CODES = Object.freeze(['parse', 'missing-content']);
export const DAILY_CEILING = 3;
export const COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const BRANCH_PREFIX = 'autofix/';

export function autofixBranchName(sourceId, evidenceSha256) {
  return `${BRANCH_PREFIX}${sourceId}/${String(evidenceSha256).slice(0, 12)}`;
}

/** Parse `autofix/<source>/<hash>` back into its parts; null for anything else. */
export function parseAutofixBranch(name) {
  const match = /^autofix\/([^/]+)\/([a-f0-9]{12})$/.exec(String(name || ''));
  return match ? { sourceId: match[1], hash: match[2] } : null;
}

function containsNeedle(text, needles) {
  const haystack = String(text || '').toLowerCase();
  return (needles || []).some(needle => haystack.includes(String(needle).toLowerCase()));
}

/**
 * @param {object} input
 * @param {object} input.manifest            parsed manifest.json
 * @param {(sourceId: string) => string|null} [input.readEvidence]   returns the evidence body for needle checks
 * @param {Array<{ name: string, createdAt?: string }>} [input.autofixBranches]  existing autofix/* branches with tip commit time
 * @param {Date} [input.now]
 * @param {boolean} [input.force]            bypass dedupe/cooldown/ceiling (dry runs); never bypasses rules 1–4
 * @param {(name: string) => boolean} [input.fixtureExists]  true when tests/fixtures/<name> is already committed
 * @param {object} [input.registry]
 */
export function triageManifest({
  manifest,
  readEvidence = () => null,
  autofixBranches = [],
  now = new Date(),
  force = false,
  fixtureExists = () => false,
  registry = AUTOFIX_SOURCES,
} = {}) {
  const selected = [];
  const skipped = [];
  const skip = (source, reason) => skipped.push({ sourceId: source.sourceId, failureCode: source.failureCode ?? null, reason });

  if (!manifest || !Array.isArray(manifest.sources)) {
    return { selected, skipped: [{ sourceId: null, failureCode: null, reason: 'manifest missing or malformed' }], ceilingReached: false };
  }

  const nowMs = now.getTime();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const branchNames = new Set(autofixBranches.map(branch => branch.name));
  const parsedBranches = autofixBranches
    .map(branch => ({ ...branch, parsed: parseAutofixBranch(branch.name), createdMs: Date.parse(branch.createdAt || '') }))
    .filter(branch => branch.parsed);
  let createdToday = parsedBranches.filter(branch => branch.createdMs >= dayStart && branch.createdMs <= nowMs).length;
  let ceilingReached = false;

  for (const source of manifest.sources) {
    if (source.result !== 'failure') continue;
    if (!FIXABLE_CODES.includes(source.failureCode)) { skip(source, `${source.failureCode || 'unknown'} is not fixable by code`); continue; }
    const entry = registry[source.sourceId];
    if (!entry) { skip(source, 'not in the autofix registry'); continue; }
    if (entry.category !== manifest.category) { skip(source, `registered under ${entry.category}, manifest is ${manifest.category}`); continue; }
    if (!source.evidencePath || !source.evidenceSha256) { skip(source, 'no evidence captured'); continue; }
    if (source.failureCode === 'missing-content') {
      const body = readEvidence(source.sourceId, source.evidencePath);
      if (!containsNeedle(body, entry.needles)) { skip(source, 'page does not mention the source; treated as an outage (R15)'); continue; }
    }
    const branch = autofixBranchName(source.sourceId, source.evidenceSha256);
    if (!force) {
      if (branchNames.has(branch)) { skip(source, `already attempted on the same page (${branch})`); continue; }
      const recent = parsedBranches.find(b => b.parsed.sourceId === source.sourceId && nowMs - b.createdMs < COOLDOWN_MS && b.createdMs <= nowMs);
      if (recent) { skip(source, `cooldown: ${recent.name} was created less than 24 h ago`); continue; }
      if (createdToday >= DAILY_CEILING) { ceilingReached = true; skip(source, `daily ceiling of ${DAILY_CEILING} autofix attempts reached`); continue; }
    }
    createdToday += 1;
    // A second attempt on the same day must not overwrite the fixture an earlier PR
    // committed (existing fixtures may not be modified), so suffix it with the page hash.
    const extension = entry.extension || source.evidencePath.split('.').pop() || 'html';
    const day = now.toISOString().slice(0, 10);
    let fixtureName = `${entry.fixture}-${day}.${extension}`;
    if (fixtureExists(fixtureName)) fixtureName = `${entry.fixture}-${day}-${String(source.evidenceSha256).slice(0, 6)}.${extension}`;
    selected.push({
      sourceId: source.sourceId,
      category: manifest.category,
      failureCode: source.failureCode,
      detail: source.detail ?? null,
      sourceUrl: source.sourceUrl ?? null,
      evidencePath: source.evidencePath,
      evidenceSha256: source.evidenceSha256,
      branch,
      parserFile: entry.parserFile,
      testFile: entry.testFile,
      fixtureName,
    });
  }
  return { selected, skipped, ceilingReached };
}

/** Telegram hears about a run only when there was something fixable to decide on. */
export function shouldNotify({ selected, skipped }) {
  return selected.length > 0 || skipped.some(item => item.failureCode && FIXABLE_CODES.includes(item.failureCode));
}

/** One-paragraph Telegram-friendly summary of a triage result. */
export function describeTriage({ category, selected, skipped, ceilingReached, enabled, runUrl }) {
  const lines = [];
  if (!selected.length) {
    lines.push(`Autofix (${category}): nothing to do.`);
  } else {
    lines.push(`Autofix (${category}): ${enabled ? 'starting' : 'would start'} ${selected.length} fix attempt${selected.length === 1 ? '' : 's'}${enabled ? '' : ' (AUTOFIX_ENABLED is off)'}:`);
    for (const item of selected) lines.push(`• ${item.sourceId} — ${item.failureCode}${item.detail ? `: ${item.detail}` : ''}`);
  }
  const interesting = skipped.filter(item => item.failureCode && FIXABLE_CODES.includes(item.failureCode));
  for (const item of interesting) lines.push(`• ${item.sourceId} — skipped: ${item.reason}`);
  if (ceilingReached) lines.push('Daily ceiling reached; remaining sources wait for tomorrow.');
  if (runUrl) lines.push(runUrl);
  return lines.join('\n');
}
