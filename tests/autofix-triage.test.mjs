import assert from 'node:assert/strict';
import test from 'node:test';

import { autofixBranchName, describeTriage, parseAutofixBranch, shouldNotify, triageManifest, DAILY_CEILING } from '../lib/autofix-triage.js';
import { AUTOFIX_SOURCES, isPathAllowed } from '../lib/autofix-sources.js';

const NOW = new Date('2026-09-11T14:00:00Z');
const HASH = 'a'.repeat(64);

function manifest(sources, category = 'student-services') {
  return { schemaVersion: 1, category, commit: 'abc', sources };
}
const failed = (sourceId, failureCode, extra = {}) => ({
  sourceId, result: 'failure', failureCode, detail: `${sourceId} broke`, evidencePath: `${sourceId}.html`, evidenceSha256: HASH, ...extra,
});

test('a same-day retry gets a fixture name that does not collide with a committed one', () => {
  const result = triageManifest({
    now: NOW,
    manifest: manifest([failed('health', 'parse')]),
    fixtureExists: name => name === 'student-services-health-2026-09-11.html',
  });
  assert.equal(result.selected[0].fixtureName, 'student-services-health-2026-09-11-aaaaaa.html');
});

test('routes parse and missing-content failures only, and only with evidence', () => {
  const result = triageManifest({
    now: NOW,
    readEvidence: (sourceId) => `<main>${sourceId === 'lerner' ? 'Lerner Hall Operating Hours' : 'Alice! Health Promotion'}</main>`,
    manifest: manifest([
      { sourceId: 'bookstore', result: 'success' },
      failed('health', 'parse'),
      failed('lerner', 'missing-content'),
      failed('mail', 'navigation'),
      failed('bookstore', 'parse', { evidencePath: null, evidenceSha256: null }),
    ]),
  });
  assert.deepEqual(result.selected.map(item => item.sourceId), ['health', 'lerner']);
  assert.deepEqual(result.skipped.map(item => [item.sourceId, item.reason]), [
    ['mail', 'navigation is not fixable by code'],
    ['bookstore', 'no evidence captured'],
  ]);
  const health = result.selected[0];
  assert.equal(health.branch, `autofix/health/${'a'.repeat(12)}`);
  assert.equal(health.parserFile, 'lib/student-services-source-parser.js');
  assert.equal(health.testFile, 'tests/student-services-source-parser.test.mjs');
  assert.equal(health.fixtureName, 'student-services-health-2026-09-11.html');
  assert.equal(health.category, 'student-services');
});

test('a missing-content page that never mentions the source is an outage, not a parser bug (R15)', () => {
  const result = triageManifest({
    now: NOW,
    readEvidence: () => '<html><body>503 Service Unavailable</body></html>',
    manifest: manifest([failed('health', 'missing-content')]),
  });
  assert.equal(result.selected.length, 0);
  assert.match(result.skipped[0].reason, /treated as an outage/);
});

test('same page → same branch → no second attempt; deleting the branch rearms', () => {
  const branches = [{ name: autofixBranchName('health', HASH), createdAt: '2026-09-01T00:00:00Z' }];
  const again = triageManifest({ now: NOW, manifest: manifest([failed('health', 'parse')]), autofixBranches: branches });
  assert.equal(again.selected.length, 0);
  assert.match(again.skipped[0].reason, /already attempted on the same page/);
  const rearmed = triageManifest({ now: NOW, manifest: manifest([failed('health', 'parse')]), autofixBranches: [] });
  assert.equal(rearmed.selected.length, 1);
});

test('one attempt per source per 24 hours, even for a different page', () => {
  const recent = [{ name: `autofix/health/${'b'.repeat(12)}`, createdAt: '2026-09-11T02:00:00Z' }];
  const blocked = triageManifest({ now: NOW, manifest: manifest([failed('health', 'parse')]), autofixBranches: recent });
  assert.match(blocked.skipped[0].reason, /cooldown/);
  const old = [{ name: `autofix/health/${'b'.repeat(12)}`, createdAt: '2026-09-10T02:00:00Z' }];
  const allowed = triageManifest({ now: NOW, manifest: manifest([failed('health', 'parse')]), autofixBranches: old });
  assert.equal(allowed.selected.length, 1);
  // another source is unaffected by health's cooldown
  const other = triageManifest({ now: NOW, manifest: manifest([failed('mail', 'parse')]), autofixBranches: recent });
  assert.equal(other.selected.length, 1);
});

test('hard ceiling of three attempts per UTC day across all sources, counting this run', () => {
  const today = ['c', 'd'].map(ch => ({ name: `autofix/bookstore/${ch.repeat(12)}`, createdAt: '2026-09-11T01:00:00Z' }));
  const result = triageManifest({
    now: NOW, autofixBranches: today,
    manifest: manifest([failed('health', 'parse'), failed('mail', 'parse'), failed('lerner', 'parse')]),
  });
  assert.equal(DAILY_CEILING, 3);
  assert.deepEqual(result.selected.map(item => item.sourceId), ['health']);
  assert.equal(result.ceilingReached, true);
  assert.ok(result.skipped.every(item => /daily ceiling/.test(item.reason)));
});

test('force bypasses dedupe, cooldown and ceiling but never the fixability rules', () => {
  const branches = [{ name: autofixBranchName('health', HASH), createdAt: '2026-09-11T02:00:00Z' }];
  const result = triageManifest({
    now: NOW, force: true, autofixBranches: branches,
    manifest: manifest([failed('health', 'parse'), failed('mail', 'navigation')]),
  });
  assert.deepEqual(result.selected.map(item => item.sourceId), ['health']);
  assert.equal(result.skipped[0].sourceId, 'mail');
});

test('a source registered under another category, or not at all, is skipped', () => {
  const result = triageManifest({ now: NOW, manifest: manifest([failed('columbiaHours', 'parse'), failed('mystery', 'parse')]) });
  assert.deepEqual(result.skipped.map(item => item.reason), ['registered under recreation, manifest is student-services', 'not in the autofix registry']);
});

test('branch names round-trip and the registry covers every manifest source with an allowlisted parser', () => {
  assert.deepEqual(parseAutofixBranch('autofix/barnard-hours/0123456789ab'), { sourceId: 'barnard-hours', hash: '0123456789ab' });
  assert.equal(parseAutofixBranch('main'), null);
  for (const [sourceId, entry] of Object.entries(AUTOFIX_SOURCES)) {
    assert.ok(isPathAllowed(entry.category, entry.parserFile), `${sourceId}: ${entry.parserFile} must be allowlisted`);
    assert.ok(isPathAllowed(entry.category, entry.testFile), `${sourceId}: ${entry.testFile} must be allowlisted`);
    assert.ok(entry.needles?.length, `${sourceId}: needles`);
  }
  assert.equal(isPathAllowed('dining', 'lib/telegram-service.js'), false);
  assert.equal(isPathAllowed('dining', 'package.json'), false);
  assert.equal(isPathAllowed('library', 'scrape.py'), true);
  assert.equal(isPathAllowed('library', 'lib/library-hours-service.js'), false);
});

test('Telegram is told only when something fixable came up, in one readable message', () => {
  const quiet = triageManifest({ now: NOW, manifest: manifest([{ sourceId: 'health', result: 'success' }, failed('mail', 'navigation')]) });
  assert.equal(shouldNotify(quiet), false);
  const loud = triageManifest({ now: NOW, manifest: manifest([failed('health', 'parse')]) });
  assert.equal(shouldNotify(loud), true);
  const text = describeTriage({ category: 'student-services', ...loud, enabled: false, runUrl: 'https://example/run' });
  assert.match(text, /^Autofix \(student-services\): would start 1 fix attempt \(AUTOFIX_ENABLED is off\):/);
  assert.match(text, /• health — parse: health broke/);
  assert.match(text, /https:\/\/example\/run$/);
  const armed = describeTriage({ category: 'dining', ...loud, enabled: true });
  assert.match(armed, /starting 1 fix attempt:/);
});
