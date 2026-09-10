/**
 * The one place that knows how to read the VENUES catalog out of index.html.
 *
 * index.html is the single source of truth for venues (DEC-0069). Every
 * generated artefact — SEO pages, sitemap, the venue catalog module, the
 * seed-vote schedules — derives from what this returns, so adding a venue is
 * one edit in index.html followed by `npm run build`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const START_MARKER = 'const D = (mon, tue, wed, thu, fri, sat, sun)';

/** @returns {Array<object>} the VENUES array exactly as the page evaluates it */
export function loadVenues(root) {
  const html = readFileSync(join(root, 'index.html'), 'utf8');
  const start = html.indexOf(START_MARKER);
  if (start === -1) throw new Error('Could not find the venue-data block in index.html');
  const decl = html.indexOf('const VENUES', start);
  if (decl === -1) throw new Error('Could not find `const VENUES` in index.html');
  const end = html.indexOf('\n];', decl);
  if (end === -1) throw new Error('Could not find the end of the VENUES array');
  const src = html.slice(start, end + 3);
  const venues = new Function('window', `${src}\nreturn VENUES;`)({});
  if (!Array.isArray(venues) || !venues.length) throw new Error('VENUES evaluated to nothing');
  const ids = new Set();
  for (const v of venues) {
    if (!v.id || !v.name || !v.cat) throw new Error(`venue missing id/name/cat: ${JSON.stringify(v)}`);
    if (ids.has(v.id)) throw new Error(`duplicate venue id: ${v.id}`);
    ids.add(v.id);
  }
  return venues;
}

/** True when the venue carries a fixed weekly schedule (as opposed to live-only). */
export function hasWeeklyHours(venue) {
  return Array.from({ length: 7 }, (_, d) => venue.hours?.[d]).some(r => Array.isArray(r) && r.length);
}
