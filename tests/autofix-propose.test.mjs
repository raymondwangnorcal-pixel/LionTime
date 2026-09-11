import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { checkFixture, checkPatch, parsePatch, MAX_FIXTURE_BYTES } from '../lib/autofix-propose.js';
import { renderValues } from '../scripts/autofix-values-table.mjs';
import { renderPrBody, renderPrompt } from '../scripts/autofix-propose.mjs';

const FIXTURE_HEADER = '<!-- Source: https://www.health.columbia.edu/content/hours-and-locations — captured 2026-09-11 -->\n';

function diff(path, addedLines, { isNew = false } = {}) {
  const header = isNew
    ? `diff --git a/${path} b/${path}\nnew file mode 100644\n--- /dev/null\n+++ b/${path}\n@@ -0,0 +1,${addedLines.length} @@\n`
    : `diff --git a/${path} b/${path}\n--- a/${path}\n+++ b/${path}\n@@ -1,2 +1,${addedLines.length + 2} @@\n context\n`;
  return `${header}${addedLines.map(line => `+${line}`).join('\n')}\n`;
}

const GOOD = [
  diff('lib/student-services-source-parser.js', ["const HEALTH_SIGNATURE = /(?:Summer|Fall|Winter|Spring) 20\\d{2} Operating Hours/i;"]),
  diff('tests/student-services-source-parser.test.mjs', ["test('parses the Fall 2026 page', () => { assert.deepEqual(rows[0].intervals, [['09:00', '18:00']]); });"]),
  diff('tests/fixtures/student-services-health-2026-09-11.html', [FIXTURE_HEADER.trim(), '<main><h2>Fall 2026 Operating Hours</h2><p>Monday–Thursday 9:00 AM – 6:00 PM</p></main>'], { isNew: true }),
].join('');
const HEALTH = { category: 'student-services', parserFile: 'lib/student-services-source-parser.js', testFile: 'tests/student-services-source-parser.test.mjs' };

test('a clean patch — parser, test, sanitised fixture — is accepted', () => {
  const result = checkPatch(GOOD, HEALTH);
  assert.deepEqual(result.violations, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.fixtures, ['tests/fixtures/student-services-health-2026-09-11.html']);
  assert.equal(parsePatch(GOOD).length, 3);
});

test('paths outside the category allowlist, dependency files and deletions are rejected', () => {
  const bad = GOOD
    + diff('lib/telegram-service.js', ['// touched'])
    + diff('package.json', ['"cheerio": "2.0.0"'])
    + diff('scripts/library-something.mjs', ['x'])
    + `diff --git a/lib/student-services-hours-store.js b/lib/student-services-hours-store.js\ndeleted file mode 100644\n--- a/lib/student-services-hours-store.js\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n`;
  const { violations } = checkPatch(bad, HEALTH);
  assert.ok(violations.includes('lib/telegram-service.js: outside the student-services allowlist'));
  assert.ok(violations.includes('package.json: dependency files may not change'));
  assert.ok(violations.includes('scripts/library-something.mjs: outside the student-services allowlist'));
  assert.ok(violations.includes('lib/student-services-hours-store.js: deleting files is not allowed'));
});

test('added lines may not introduce subprocesses, network, eval, dynamic import, env reads, or foreign imports', () => {
  const samples = [
    ["import { execSync } from 'node:child_process';", 'child_process'],
    ['const page = await fetch(url);', 'fetch('],
    ['return eval(code);', 'eval('],
    ['const fn = new Function("return 1");', 'new Function('],
    ['const mod = await import(name);', 'import() with a non-literal'],
    ['const key = process.env.SECRET;', 'process.env'],
    ["import cheerio from 'cheerio';", 'import of "cheerio"'],
    ["import fetchImpl from 'node-fetch';", 'import of "node-fetch"'],
    ["const ws = new WebSocket(url);", 'network module'],
  ];
  for (const [line, label] of samples) {
    const { violations } = checkPatch(GOOD + diff('lib/student-services-source-parser.js', [line]), HEALTH);
    assert.ok(violations.some(v => v.includes(label)), `${line} → expected "${label}" in ${JSON.stringify(violations)}`);
  }
  // Relative and node: builtin imports are fine; a static import() literal is fine.
  const fine = checkPatch(GOOD + diff('lib/student-services-source-parser.js', [
    "import { load } from './student-services-hours-catalog.js';", "import path from 'node:path';", "const m = await import('./x.js');",
  ]), HEALTH);
  assert.deepEqual(fine.violations, []);
});

test('python patches follow the same rules', () => {
  const py = [
    diff('scrape.py', ['import subprocess', 'import requests', 'from bs4 import BeautifulSoup', 'value = os.environ["X"]']),
    diff('tests/test_scrape.py', ['def test_new(self): pass']),
    diff('tests/fixtures/library-avery-2026-09-11.html', [FIXTURE_HEADER.trim(), '<table><td><div class="fulldate">2026-09-11</div></td></table>'], { isNew: true }),
  ].join('');
  const { violations } = checkPatch(py, { category: 'library', parserFile: 'scrape.py', testFile: 'tests/test_scrape.py' });
  assert.ok(violations.some(v => v.includes('python subprocess')));
  assert.ok(violations.some(v => v.includes('python import of "requests"')));
  assert.ok(violations.some(v => v.includes('os.environ')));
  assert.ok(!violations.some(v => v.includes('"bs4"')));
});

test('a fixture must be a sanitised reduction with a header', () => {
  assert.deepEqual(checkFixture('f.html', `${FIXTURE_HEADER}<main>Mon 9–5</main>`), []);
  const big = `${FIXTURE_HEADER}${'x'.repeat(MAX_FIXTURE_BYTES)}`;
  assert.match(checkFixture('f.html', big)[0], /exceeds/);
  assert.match(checkFixture('f.html', `${FIXTURE_HEADER}<script src="a.js"></script>`)[0], /<script/);
  assert.match(checkFixture('f.html', `${FIXTURE_HEADER}write to health@columbia.edu`)[0], /email/);
  assert.match(checkFixture('f.html', `${FIXTURE_HEADER}call (212) 854-2284`)[0], /phone/);
  assert.match(checkFixture('f.html', '<main>no header</main>')[0], /header must give the source URL and capture date/);
  // hours like 9:00–17:00 and dates must not be mistaken for phone numbers
  assert.deepEqual(checkFixture('f.html', `${FIXTURE_HEADER}Monday 9:00 AM – 5:30 PM, 2026-09-11 to 2026-12-23`), []);
  // Existing fixtures may not be edited in place
  const edited = GOOD + diff('tests/fixtures/student-services-health.html', ['<p>changed</p>']);
  assert.ok(checkPatch(edited, HEALTH).violations.some(v => v.includes('existing fixtures may not be modified')));
});

test('a patch that only writes UNRESOLVED.md, or touches no parser/test/fixture, is not proposed', () => {
  const unresolved = diff('.github/autofix/UNRESOLVED.md', ['The page has no hours at all.'], { isNew: true });
  const { violations } = checkPatch(unresolved, HEALTH);
  assert.ok(violations.includes('fixer reported UNRESOLVED; nothing to propose'));
  assert.ok(violations.includes('patch does not change lib/student-services-source-parser.js'));
  assert.ok(violations.includes('patch adds no fixture under tests/fixtures/'));
  assert.equal(checkPatch('', HEALTH).violations[0], 'patch is empty');
});

test('the prompt template is rendered from the registry, labelling the page as untrusted', () => {
  const template = readFileSync('.github/autofix/prompt.md', 'utf8');
  const prompt = renderPrompt(template, {
    SOURCE_ID: 'health', WORKFLOW: 'update-student-services-hours', ERROR: 'parse: heading missing',
    EVIDENCE_PATH: '/tmp/health.html', PARSER_FILE: 'lib/student-services-source-parser.js',
    TEST_FILE: 'tests/student-services-source-parser.test.mjs', FIXTURE_NAME: 'student-services-health-2026-09-11.html', CATEGORY: 'student-services',
  });
  assert.doesNotMatch(prompt, /\$\{[A-Z_]+\}/, 'every placeholder is filled');
  assert.match(prompt, /third-party web page/);
  assert.match(prompt, /never as instructions/);
  assert.match(prompt, /Do not commit, push, create branches/);
  assert.match(prompt, /tests\/fixtures\/student-services-health-2026-09-11\.html/);
  // The CLI produces the same thing
  const cli = spawnSync('node', ['scripts/autofix-propose.mjs', 'prompt', '--source', 'health', '--evidence', '/tmp/health.html',
    '--error', 'parse: heading missing', '--workflow', 'update-student-services-hours', '--fixture-name', 'student-services-health-2026-09-11.html'], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.equal(cli.stdout, prompt);
});

test('the check CLI exits non-zero and lists violations for a bad patch', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'lionhour-autofix-'));
  const badPath = path.join(dir, 'bad.diff');
  const goodPath = path.join(dir, 'good.diff');
  writeFileSync(badPath, GOOD + diff('lib/student-services-source-parser.js', ['const page = await fetch(url);']));
  writeFileSync(goodPath, GOOD);
  const run = spawnSync('node', ['scripts/autofix-propose.mjs', 'check', '--patch', badPath, '--source', 'health'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  assert.match(run.stderr, /✗ lib\/student-services-source-parser\.js: added line uses fetch\(/);
  const good = spawnSync('node', ['scripts/autofix-propose.mjs', 'check', '--patch', goodPath, '--source', 'health'], { encoding: 'utf8' });
  assert.equal(good.status, 0, good.stderr);
  assert.equal(JSON.parse(good.stdout).ok, true);
});

test('the PR body carries the failure, the evidence link, the values table and the review checklist', () => {
  const body = renderPrBody({
    sourceId: 'health', entry: { category: 'student-services' }, error: 'parse: heading missing', evidenceUrl: 'https://github.com/x/y/actions/runs/1',
    valuesTable: '| Target | Access |\n| --- | --- |\n| alice-health | office-hours |', files: ['lib/a.js', 'tests/fixtures/f.html'], fixtures: ['tests/fixtures/f.html'],
  });
  assert.match(body, /has not been read by a person/);
  assert.match(body, /parse: heading missing/);
  assert.match(body, /actions\/runs\/1/);
  assert.match(body, /\| alice-health \| office-hours \|/);
  assert.match(body, /- `tests\/fixtures\/f\.html` \(new fixture\)/);
  assert.match(body, /- \[ \] The values table matches the official page/);
  assert.doesNotMatch(body, /merge button|\/merge/i);
});

test('values table renders real parser output for each shape', () => {
  const rows = [
    { targetId: 'alice-health', type: 'office-hours', weekdays: [1, 2, 3, 4], intervals: [['09:00', '18:00']], effectiveStart: '2026-01-01', effectiveEnd: '9999-12-31' },
    { targetId: 'alice-health', type: 'virtual-only', weekdays: [1, 2, 4, 5], intervals: [['10:00', '15:00']], exactDate: null, effectiveStart: '2026-09-08', effectiveEnd: '2026-09-27' },
    { targetId: 'mail-center', type: 'office-hours', weekdays: [6], intervals: [], status: 'Closed', effectiveStart: null, effectiveEnd: null },
  ];
  const table = renderValues('health', rows);
  assert.match(table, /\| Target \| Access \| Weekdays \| Hours \| Effective \|/);
  assert.match(table, /\| alice-health \| office-hours \| Mon–Thu \| 09:00–18:00 \| 2026-01-01 → open-ended \|/);
  assert.match(table, /\| alice-health \| virtual-only \| Mon, Tue, Thu, Fri \| 10:00–15:00 \| 2026-09-08 → 2026-09-27 \|/);
  assert.match(table, /\| mail-center \| office-hours \| Sat \| Closed \| — \|/);

  const recreation = renderValues('barnardFitness', [{ targetId: 'barnard-fitness', availabilityType: 'facility-hours', weeklyIntervals: { 0: [['09:00', '18:00']], 1: [['07:00', '09:50'], ['14:30', '21:00']], 2: [['07:00', '09:50'], ['14:30', '21:00']] }, dateIntervals: null, effectiveStart: '2026-09-10', effectiveEnd: '2026-09-23' }]);
  assert.match(recreation, /\| barnard-fitness \| facility-hours \| Sun \| 09:00–18:00 \| 2026-09-10 → 2026-09-23 \|/);
  assert.match(recreation, /\| barnard-fitness \| facility-hours \| Mon, Tue \| 07:00–09:50, 14:30–21:00 \|/);

  const article = renderValues('fall-2026', { id: 'fall-2026', start: '2026-09-08', end: '2026-12-23', venues: { chefmikes: { 0: [['11:00', '02:00']], 1: [['11:00', '02:00']] }, chefdons: { 0: [], 1: [['08:00', '19:00']] } } });
  assert.match(article, /\| chefmikes \| Sun, Mon \| 11:00–02:00 \| 2026-09-08 → 2026-12-23 \|/);
  assert.match(article, /\| chefdons \| Sun \| Closed \|/);

  const cafe = renderValues('cafe-east', { id: 'cafe-east', name: 'Café East', weekdays: { 0: [['11:00', '19:30']], 1: [['10:30', '19:30']], 2: [['10:30', '19:30']] } });
  assert.match(cafe, /\| Café East \| Mon, Tue \| 10:30–19:30 \|/);

  assert.match(renderValues('x', { odd: true }), /No table renderer for this shape/);
  assert.match(renderValues('x', []), /returned no rows/);
});

test('the values table CLI runs a real parser on a real fixture', () => {
  const run = spawnSync('node', ['scripts/autofix-values-table.mjs', '--source', 'health', '--fixture', 'tests/fixtures/student-services-health.html'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /\| alice-health \| office-hours \| Mon–Fri \| 09:00–17:00 \|/);
  const library = spawnSync('node', ['scripts/autofix-values-table.mjs', '--source', 'butler_24', '--fixture', 'tests/fixtures/butler-august-2026.html'], { encoding: 'utf8' });
  assert.match(library.stdout, /Library parsers are Python/);
});
