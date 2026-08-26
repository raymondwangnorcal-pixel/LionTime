import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const viewSource = await readFile(new URL('../assets/student-services-hours-view.js', import.meta.url), 'utf8');

test('renders exactly the ten approved static-first Student Life cards', () => {
  const section = html.slice(html.indexOf('/* ── STUDENT LIFE & SERVICES'), html.indexOf('/* ══', html.indexOf('/* ── STUDENT LIFE & SERVICES')));
  const ids = [...section.matchAll(/\{ id:'([^']+)'/g)].map(match => match[1]);
  assert.deepEqual(ids, [
    'lerner', 'bookstore', 'mail-center', 'alice-health', 'medical', 'caps',
    'disability', 'svr', 'student-insurance', 'immunization',
  ]);
  assert.doesNotMatch(section, /id:'package'/);
  assert.ok(ids.every(id => section.includes(`id:'${id}'`) && section.includes("cat:'student'")));
});

test('hides the access badge on Lerner without changing its live-hours type', () => {
  const lerner = html.slice(html.indexOf("{ id:'lerner'"), html.indexOf("{ id:'bookstore'"));
  assert.match(lerner, /hideAccessBadge:true/);
  assert.match(viewSource, /if \(venue\?\.hideAccessBadge\) return null/);
});

test('places access context to the left of the temporal badge on both responsive layouts', () => {
  assert.match(html, /<span class="status-badges">[\s\S]*access-badge[\s\S]*<span class="badge/);
  assert.match(html, /\.row \.status-badges \{ grid-area: 1 \/ 3 \/ 2 \/ 4; \}/);
  assert.match(html, /minmax\(210px,auto\)/);
  assert.match(html, /minmax\(180px,auto\)/);
});

test('loads the view before rendering and reports source-based freshness in the footer', () => {
  assert.ok(html.indexOf('assets/student-services-hours-view.js') < html.indexOf('const VENUES ='));
  assert.match(html, /id="student-services-hours-status"[^>]*aria-live="polite"/);
  assert.match(html, /0 of 4 sources live/);
  assert.match(html, /status\.liveSourceCount/);
  assert.match(html, /LionHourStudentServicesHours\.hydrate/);
});
