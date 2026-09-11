/**
 * Scrape evidence manifest (docs/automated-fix.md §3, §3.1, §3.2).
 *
 * Every scrape run — success or not — records one entry per source and writes
 * `manifest.json` into an evidence directory. For a failed source the raw page
 * the scraper received is written next to it and its SHA-256 goes into the
 * manifest, so the next fix (by hand or by the autofix workflow) starts from the
 * actual failing page rather than a browser session. The manifest is written
 * BEFORE the scraper decides whether to exit non-zero (R14): job status is not
 * the signal, the per-source result is.
 *
 * The directory comes from SCRAPE_EVIDENCE_DIR (the workflows set it to
 * $RUNNER_TEMP/scrape/<category> and upload it with a 14-day retention). When
 * it is unset — local runs, tests — nothing is written unless a `dir` is passed.
 *
 * Failure codes are the ones the plan routes on: `parse`, `missing-content`,
 * `navigation`, `timeout`, `challenge`, plus `ambiguous`/`unexpected`/`schema`
 * for completeness. Anything else is kept verbatim so a new code is visible.
 */

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const MANIFEST_SCHEMA_VERSION = 1;
export const MANIFEST_FILENAME = 'manifest.json';
export const FIXABLE_FAILURE_CODES = Object.freeze(['parse', 'missing-content']);
const MAX_DETAIL_LENGTH = 400;
const MAX_EVIDENCE_BYTES = 8 * 1024 * 1024;

export function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function boundedDetail(value) {
  if (value == null) return null;
  return String(value).replace(/[\r\n\t]+/g, ' ').trim().slice(0, MAX_DETAIL_LENGTH) || null;
}

function safeFileStem(sourceId) {
  return String(sourceId).replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '') || 'source';
}

/**
 * @param {object} options
 * @param {string} options.category      library | dining | recreation | student-services
 * @param {string} [options.dir]         evidence directory; defaults to SCRAPE_EVIDENCE_DIR; null → in-memory only
 * @param {() => Date} [options.now]
 * @param {object} [options.env]         process.env substitute (GITHUB_SHA, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT)
 */
export function createScrapeManifest({
  category,
  dir = process.env.SCRAPE_EVIDENCE_DIR ? path.join(process.env.SCRAPE_EVIDENCE_DIR) : null,
  now = () => new Date(),
  env = process.env,
} = {}) {
  if (!category) throw new Error('manifest category is required');
  const sources = [];
  const pendingWrites = [];
  let written = null;

  /**
   * Record one source outcome. `evidence` is the raw body the scraper received
   * (HTML, JSON text, or visible text) and is only persisted for failures.
   *
   * @param {object} entry
   * @param {string} entry.sourceId
   * @param {string|null} [entry.sourceUrl]
   * @param {'success'|'failure'} entry.result
   * @param {string|null} [entry.failureCode]
   * @param {string|null} [entry.detail]         one-line reason, bounded
   * @param {{ body: string, extension?: string }|null} [evidence]
   */
  function record(entry, evidence = null) {
    const result = entry.result === 'success' ? 'success' : 'failure';
    const item = {
      sourceId: String(entry.sourceId),
      sourceUrl: entry.sourceUrl ?? null,
      result,
      failureCode: result === 'failure' ? (entry.failureCode || 'unexpected') : null,
      detail: boundedDetail(entry.detail),
      attemptedAt: (entry.attemptedAt instanceof Date ? entry.attemptedAt : now()).toISOString(),
      evidencePath: null,
      evidenceSha256: null,
      evidenceBytes: null,
    };
    const body = typeof evidence?.body === 'string' ? evidence.body : null;
    if (result === 'failure' && body !== null && body.length > 0) {
      const buffer = Buffer.from(body, 'utf8');
      item.evidenceSha256 = sha256(buffer);
      item.evidenceBytes = buffer.length;
      if (buffer.length <= MAX_EVIDENCE_BYTES) {
        const extension = String(evidence.extension || 'html').replace(/^\./, '');
        const filename = `${safeFileStem(item.sourceId)}.${extension}`;
        item.evidencePath = filename;
        if (dir) pendingWrites.push({ filename, buffer });
      } else {
        item.detail = boundedDetail(`${item.detail || ''} (evidence ${buffer.length} bytes exceeds capture limit; hash only)`);
      }
    }
    sources.push(item);
    return item;
  }

  function toJSON() {
    const failed = sources.filter(item => item.result === 'failure');
    return {
      schemaVersion: MANIFEST_SCHEMA_VERSION,
      category,
      generated: now().toISOString(),
      commit: env.GITHUB_SHA || null,
      runId: env.GITHUB_RUN_ID || null,
      runAttempt: env.GITHUB_RUN_ATTEMPT ? Number(env.GITHUB_RUN_ATTEMPT) : null,
      summary: {
        total: sources.length,
        succeeded: sources.length - failed.length,
        failed: failed.length,
        fixable: failed.filter(item => FIXABLE_FAILURE_CODES.includes(item.failureCode)).map(item => item.sourceId),
      },
      sources: sources.map(item => ({ ...item })),
    };
  }

  /** Write manifest.json and the evidence files. Idempotent; safe to call from a finally. */
  async function write() {
    const manifest = toJSON();
    if (!dir) { written = manifest; return manifest; }
    await mkdir(dir, { recursive: true });
    for (const { filename, buffer } of pendingWrites.splice(0)) {
      await writeFile(path.join(dir, filename), buffer);
    }
    await writeFile(path.join(dir, MANIFEST_FILENAME), `${JSON.stringify(manifest, null, 2)}\n`);
    written = manifest;
    return manifest;
  }

  return {
    category,
    dir,
    record,
    write,
    toJSON,
    get sources() { return sources.map(item => ({ ...item })); },
    get written() { return written; },
  };
}

/** A recorder that accepts calls and remembers nothing on disk — for callers that pass none. */
export function nullScrapeManifest(category = 'unknown') {
  return createScrapeManifest({ category, dir: null });
}
