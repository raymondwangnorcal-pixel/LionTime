#!/usr/bin/env node
/**
 * build.mjs — regenerates everything derived from the VENUES array in
 * index.html (DEC-0069):
 *
 *   lib/venue-catalog.generated.mjs   scripts/generate-venue-catalog.mjs
 *   hours/*.html, sitemap.xml, robots.txt   scripts/generate-seo.mjs
 *
 * Usage:
 *   npm run build            regenerate in place
 *   npm run build -- --check regenerate to a temp dir and fail if anything
 *                            tracked differs — used by the test suite and CI
 *                            so a VENUES edit cannot ship without its outputs
 *
 * Vercel runs `npm run build` on deploy; the outputs are also committed so
 * GitHub Actions jobs can read the catalog without building.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const GENERATORS = [
  'scripts/generate-venue-catalog.mjs',
  'scripts/generate-seo.mjs',
];

/** Files and directories the generators own. */
const OUTPUTS = ['lib/venue-catalog.generated.mjs', 'hours', 'sitemap.xml', 'robots.txt'];

function snapshot() {
  const files = new Map();
  const walk = (p) => {
    const abs = join(ROOT, p);
    let st;
    try { st = statSync(abs); } catch { return; }
    if (st.isDirectory()) {
      for (const name of readdirSync(abs)) walk(join(p, name));
    } else {
      files.set(p, readFileSync(abs, 'utf8'));
    }
  };
  for (const p of OUTPUTS) walk(p);
  return files;
}

function run(script) {
  const result = spawnSync(process.execPath, [join(ROOT, script)], { cwd: ROOT, stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`✗ ${script} exited ${result.status}`);
    process.exit(result.status || 1);
  }
}

const before = CHECK ? snapshot() : null;
for (const g of GENERATORS) run(g);

if (CHECK) {
  const after = snapshot();
  const changed = [];
  for (const [p, content] of after) if (before.get(p) !== content) changed.push(p);
  for (const p of before.keys()) if (!after.has(p)) changed.push(p);
  // --check must not leave the tree modified: restore what was there.
  const { writeFileSync, rmSync, mkdirSync } = await import('node:fs');
  for (const p of after.keys()) if (!before.has(p)) rmSync(join(ROOT, p), { force: true });
  for (const [p, content] of before) { mkdirSync(dirname(join(ROOT, p)), { recursive: true }); writeFileSync(join(ROOT, p), content); }
  if (changed.length) {
    // sitemap lastmod is the only expected drift; ignore a change confined to it
    const real = changed.filter(p => {
      if (p !== 'sitemap.xml') return true;
      const strip = s => s.replace(/<lastmod>[^<]+<\/lastmod>/g, '');
      return strip(before.get(p) || '') !== strip(after.get(p) || '');
    });
    if (real.length) {
      console.error(`\n✗ Generated outputs are out of date. Run \`npm run build\` and commit:\n  ${real.join('\n  ')}`);
      process.exit(1);
    }
  }
  console.log('✓ generated outputs match VENUES');
}
