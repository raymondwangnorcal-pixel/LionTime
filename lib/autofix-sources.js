/**
 * Registry of scrape sources the autofix workflow may act on
 * (docs/automated-fix.md §3, §4). One entry per manifest sourceId:
 *
 *   category    which scrape workflow produced it
 *   parserFile  the file the fixer is told to change
 *   parserExport / parserKind   how scripts/autofix-values-table.mjs runs the patched parser
 *   testFile    where the new fixture test goes
 *   fixture     fixture file name prefix under tests/fixtures/
 *   needles     words that must appear in a `missing-content` evidence page for it to
 *               count as a parser problem rather than a source outage (R15)
 *
 * The category allowlists say which paths a generated patch may touch. They are
 * enforced by the trusted propose job whatever the model did (R1).
 */

export const AUTOFIX_ALLOWLISTS = Object.freeze({
  dining: [
    /^lib\/dining-[a-z-]+\.js$/, /^lib\/cafe-east-parser\.js$/, /^lib\/barnard-dining-[a-z-]+\.js$/,
    /^scripts\/dining-hours-scraper\.mjs$/,
    /^tests\/dining-[a-z-]+\.test\.mjs$/, /^tests\/cafe-east-parser\.test\.mjs$/, /^tests\/barnard-dining-[a-z-]+\.test\.mjs$/,
    /^tests\/fixtures\/(dining|cafe-east|barnard-dining)-[A-Za-z0-9.-]+$/,
  ],
  library: [
    /^scrape\.py$/, /^tests\/test_scrape\.py$/,
    /^tests\/fixtures\/(library|butler|barnard-library)-[A-Za-z0-9.-]+\.html$/,
  ],
  recreation: [
    /^lib\/recreation-[a-z-]+\.js$/, /^scripts\/recreation-hours-[a-z-]+\.mjs$/,
    /^tests\/recreation-[a-z-]+\.test\.mjs$/, /^tests\/fixtures\/recreation-[A-Za-z0-9.-]+$/,
  ],
  'student-services': [
    /^lib\/student-services-[a-z-]+\.js$/, /^scripts\/student-services-hours-[a-z-]+\.mjs$/,
    /^tests\/student-services-[a-z-]+\.test\.mjs$/, /^tests\/fixtures\/student-services-[A-Za-z0-9.-]+$/,
  ],
});

const dining = (id, extra) => [id, {
  category: 'dining', parserFile: 'lib/dining-article-parser.js', testFile: 'tests/dining-article-parser.test.mjs',
  fixture: `dining-${id}`, parserKind: 'html', ...extra,
}];

export const AUTOFIX_SOURCES = Object.freeze(Object.fromEntries([
  // ---- dining (scripts/dining-hours-scraper.mjs)
  ['locations-feed', {
    category: 'dining', parserFile: 'scripts/dining-hours-scraper.mjs', parserExport: 'parseDiningNodes', parserKind: 'json-string',
    testFile: 'tests/dining-hours-scraper.test.mjs', fixture: 'dining-locations-feed', extension: 'json',
    needles: ['John Jay', 'Ferris', 'JJ'],
  }],
  dining('nsop-2026', { parserExport: 'parseNsopArticle', needles: ['NSOP', 'Orientation'] }),
  dining('labor-day-2026', { parserExport: 'parseLaborDayArticle', needles: ['Labor Day'] }),
  dining('fall-2026', { parserExport: 'parseFallArticle', needles: ['Fall', 'Ferris'] }),
  ['cafe-east', {
    category: 'dining', parserFile: 'lib/cafe-east-parser.js', parserExport: 'parseCafeEastPage', parserKind: 'text',
    testFile: 'tests/cafe-east-parser.test.mjs', fixture: 'cafe-east', extension: 'txt', needles: ['Café East', 'Cafe East'],
  }],
  ['barnard-hours', {
    category: 'dining', parserFile: 'lib/barnard-dining-hours-parser.js', parserExport: 'parseBarnardRenderedWeek', parserKind: 'html',
    testFile: 'tests/barnard-dining-hours-parser.test.mjs', fixture: 'barnard-dining-hours-week', needles: ['Hewitt', 'Diana'],
  }],
  // ---- recreation (scripts/recreation-hours-scraper.mjs)
  ['columbiaHours', {
    category: 'recreation', parserFile: 'lib/recreation-source-parser.js', parserExport: 'parseColumbiaHours', parserKind: 'html',
    testFile: 'tests/recreation-source-parser.test.mjs', fixture: 'recreation-columbia-hours', needles: ['Dodge', 'Uris'],
  }],
  ['columbiaModifications', {
    category: 'recreation', parserFile: 'lib/recreation-source-parser.js', parserExport: 'parseColumbiaModifications', parserKind: 'html',
    testFile: 'tests/recreation-source-parser.test.mjs', fixture: 'recreation-columbia-modifications', needles: ['Dodge', 'Modified'],
  }],
  ['barnardFitness', {
    category: 'recreation', parserFile: 'lib/recreation-source-parser.js', parserExport: 'parseBarnardHours', parserKind: 'html',
    testFile: 'tests/recreation-source-parser.test.mjs', fixture: 'recreation-barnard-hours', needles: ['Fitness', 'LeFrak'],
  }],
  // ---- student services (scripts/student-services-hours-scraper.mjs)
  ['bookstore', {
    category: 'student-services', parserFile: 'lib/student-services-source-parser.js', parserExport: 'parseBookstoreSource', parserKind: 'json-or-text',
    testFile: 'tests/student-services-source-parser.test.mjs', fixture: 'student-services-bookstore', needles: ['Bookstore'],
  }],
  ['health', {
    category: 'student-services', parserFile: 'lib/student-services-source-parser.js', parserExport: 'parseHealthSource', parserKind: 'html',
    testFile: 'tests/student-services-source-parser.test.mjs', fixture: 'student-services-health', needles: ['Alice', 'Columbia Health', 'Medical Services'],
  }],
  ['lerner', {
    category: 'student-services', parserFile: 'lib/student-services-source-parser.js', parserExport: 'parseLernerSource', parserKind: 'lerner',
    testFile: 'tests/student-services-source-parser.test.mjs', fixture: 'student-services-lerner', needles: ['Lerner'],
  }],
  ['mail', {
    category: 'student-services', parserFile: 'lib/student-services-source-parser.js', parserExport: 'parseMailSource', parserKind: 'html',
    testFile: 'tests/student-services-source-parser.test.mjs', fixture: 'student-services-mail', needles: ['Mail', 'Package'],
  }],
  // ---- library (scrape.py) — Python, so the values table falls back to the JSON snapshot
  ...['butler_24', 'science_engineering', 'lehman', 'business', 'avery', 'math', 'barnard'].map(id => [id, {
    category: 'library', parserFile: 'scrape.py', parserKind: 'python', testFile: 'tests/test_scrape.py',
    fixture: `library-${id.replace(/_/g, '-')}`, needles: ['Library', 'Hours'],
  }]),
  ['barnard-holiday', {
    category: 'library', parserFile: 'scrape.py', parserKind: 'python', testFile: 'tests/test_scrape.py',
    fixture: 'barnard-library-holidays', needles: ['Barnard', 'Holiday'],
  }],
]));

export function autofixSource(sourceId) {
  return AUTOFIX_SOURCES[sourceId] || null;
}

export function isPathAllowed(category, filePath) {
  const rules = AUTOFIX_ALLOWLISTS[category];
  return Boolean(rules) && rules.some(rule => rule.test(filePath));
}
