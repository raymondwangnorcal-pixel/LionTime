/**
 * Trusted-side checks for a generated patch (docs/automated-fix.md §3 "propose",
 * §3.1, §4). Runs without the model and without trusting it:
 *
 *   - every touched path must match the category allowlist
 *   - no dependency changes (package.json, lockfiles, requirements.txt)
 *   - added lines may not introduce subprocesses, network, eval, dynamic import
 *     with a non-literal, environment reads, or non-relative/non-node imports
 *   - a new fixture must be a sanitised reduction: ≤ 32 KB, no <script, no email
 *     address, no phone number, and a header naming the URL and capture date
 *   - the patch must touch the parser and add a test; a patch that only adds a
 *     fixture, or writes UNRESOLVED.md, is not proposed
 */

import { load } from 'cheerio';

import { isPathAllowed } from './autofix-sources.js';

export const MAX_FIXTURE_BYTES = 32 * 1024;

const DEPENDENCY_FILES = /^(package(-lock)?\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|requirements[^/]*\.txt|pyproject\.toml|Pipfile(\.lock)?)$/;
const FORBIDDEN_ADDED = [
  [/\bchild_process\b/, 'child_process'],
  [/\bworker_threads\b/, 'worker_threads'],
  [/\bnode:vm\b|\brequire\(\s*['"]vm['"]\s*\)/, 'vm'],
  [/\bfetch\s*\(/, 'fetch('],
  [/\beval\s*\(/, 'eval('],
  [/\bnew\s+Function\s*\(/, 'new Function('],
  [/\bimport\s*\(\s*(?!['"])/, 'import() with a non-literal'],
  [/\bprocess\.env\b/, 'process.env'],
  [/\bXMLHttpRequest\b|\bWebSocket\b|\bnode:(?:http|https|net|dns|tls|dgram)\b/, 'network module'],
  [/\bsubprocess\b|\bos\.system\b|\bos\.popen\b|\b__import__\s*\(/, 'python subprocess / dynamic import'],
  [/\bexec\s*\(/, 'exec('],
  [/\bos\.environ\b/, 'os.environ'],
  [/\b(?:urllib|socket|http\.client)\b/, 'python network module'],
];
const IMPORT_SPECIFIER = /^\+\s*(?:import\b[^'"]*from\s*|import\s*|export\b[^'"]*from\s*|const\s+[^=]+=\s*require\(\s*)['"]([^'"]+)['"]/;
const PY_IMPORT = /^\+\s*(?:from\s+([A-Za-z_][\w.]*)\s+import\b|import\s+([A-Za-z_][\w.]*))/;
const PY_STDLIB_ALLOWED = new Set(['re', 'json', 'datetime', 'typing', 'pathlib', 'zoneinfo', 'collections', 'itertools', 'functools', 'dataclasses', 'unittest', 'tempfile', 'hashlib', 'html', 'string', 'math', 'decimal', 'enum', 'bs4', 'unittest.mock', 'os.path']);
const NODE_BUILTIN_ALLOWED = /^node:(assert|assert\/strict|test|fs|fs\/promises|path|url|crypto|util|os|buffer|stream|string_decoder)$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?1[\s.-]?)?\(?\b[2-9]\d{2}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

/** Split a unified diff into per-file sections. */
export function parsePatch(patchText) {
  const files = [];
  const text = String(patchText || '');
  const sections = text.split(/^diff --git /m).slice(1);
  for (const section of sections) {
    const header = section.split('\n')[0];
    const match = /^a\/(.+?) b\/(.+)$/.exec(header);
    if (!match) continue;
    const oldPath = match[1];
    const newPath = match[2];
    const body = section.slice(header.length + 1);
    const isNew = /^new file mode/m.test(body) || /^--- \/dev\/null/m.test(body);
    const isDeleted = /^deleted file mode/m.test(body) || /^\+\+\+ \/dev\/null/m.test(body);
    const addedLines = [];
    let inHunk = false;
    for (const line of body.split('\n')) {
      if (line.startsWith('@@')) { inHunk = true; continue; }
      if (!inHunk) continue;
      if (line.startsWith('+') && !line.startsWith('+++')) addedLines.push(line);
    }
    files.push({ path: newPath, oldPath, isNew, isDeleted, renamed: oldPath !== newPath, addedLines });
  }
  return files;
}

export function checkFixture(name, content) {
  const violations = [];
  const bytes = Buffer.byteLength(String(content), 'utf8');
  if (bytes > MAX_FIXTURE_BYTES) violations.push(`${name}: ${bytes} bytes exceeds the ${MAX_FIXTURE_BYTES}-byte fixture limit (not sanitised)`);
  if (/<script\b/i.test(content)) violations.push(`${name}: contains <script`);
  if (EMAIL.test(content)) violations.push(`${name}: contains an email address`);
  if (PHONE.test(content)) violations.push(`${name}: contains a phone number`);
  // JSON payloads cannot carry a comment header; their URL and date live in the PR body.
  if (!/\.json$/i.test(name)) {
    const head = String(content).slice(0, 1200);
    if (!/https?:\/\/\S+/.test(head) || !/\b\d{4}-\d{2}-\d{2}\b/.test(head)) {
      violations.push(`${name}: header must give the source URL and capture date (YYYY-MM-DD) in the first lines`);
    }
  }
  return violations;
}

const STRIP_ELEMENTS = 'script, style, noscript, template, nav, header, footer, aside, iframe, img, picture, svg, video, audio, canvas, form, input, button, select, textarea, link, meta, object, embed';
const KEEP_ATTRIBUTES = /^(id|class|data-[a-z0-9-]+|href|datetime|colspan|rowspan|scope|role|aria-label|title|lang)$/i;
// Layout / framework class tokens that no parser selects on (Bootstrap, Angular, Drupal chrome).
const NOISE_CLASS = /^(col(-[a-z]+)?(-\d+)?|row|container(-fluid)?|visible-.*|hidden(-.*)?|d-.*|btn.*|text-.*|[mp][tbxylr]?-\d+|wrapper|clearfix|js-.*|views-.*|region.*|layout.*|block.*|node.*|w-\d+|h-\d+|flex.*|justify-.*|align-.*|border.*|bg-.*|rounded.*|shadow.*|position-.*|overflow-.*|font-.*|fw-.*|lh-.*|gap-.*|order-.*|offset-.*|g[xy]?-\d+|img-.*|float-.*|sr-only.*|highlighted|column|columns|panel.*|card.*|well|lead|small|large|main-content|page-.*|site-.*|has-.*|is-.*|no-.*|ng-.*|table-(responsive|hover|striped|bordered|condensed|sm)|responsive-enabled|anchored|even|odd|external|internal|active|inactive|collapsed|expanded|first|last|odd|even)$/i;
// Substrings that mark a class as something a LionHour parser may select on; kept in the last resort pass.
const PARSER_CLASS_HINT = /paragraph|hours|table|event|field|day|date|location|tab|unified|schedule|calendar|slice|fulldate/i;

/**
 * Reduce a captured page to the block the parsers read, so the fixture is small
 * and free of anything personal (docs/automated-fix.md §3.1). Done by the trusted
 * job, not the model — which also means the model never has to read the whole page.
 *
 * Reduction is staged and stops as soon as the result fits the 32 KB limit:
 *   1. main content block only; chrome elements removed; unknown attributes dropped
 *   2. framework/layout class tokens dropped
 *   3. every class dropped except ones that look parser-relevant
 *
 * @returns {{ html: string, bytes: number, ok: boolean, root: string, stage: number }}
 */
export function sanitiseEvidence({ html, sourceUrl, capturedAt }) {
  const $ = load(String(html || ''));
  const rootSelector = ['#main-article', 'main', 'article', '[role="main"]', 'body'].find(selector => $(selector).length) || 'body';
  const root = $(rootSelector).first();
  root.find(STRIP_ELEMENTS).remove();
  root.find('*').each((_, element) => {
    for (const name of Object.keys(element.attribs || {})) {
      if (!KEEP_ATTRIBUTES.test(name)) $(element).removeAttr(name);
      else if (name === 'href' && /^(mailto|tel):/i.test(element.attribs[name])) $(element).removeAttr(name);
    }
  });

  const pruneClasses = (keep) => {
    root.find('[class]').each((_, element) => {
      const kept = String(element.attribs.class || '').split(/\s+/).filter(Boolean).filter(keep);
      if (kept.length) $(element).attr('class', kept.join(' '));
      else $(element).removeAttr('class');
    });
  };
  const render = () => {
    const body = $.html(root)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/>\s+</g, '>\n<')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .trim()
      .replace(EMAIL_GLOBAL, '[email removed]')
      .replace(PHONE_GLOBAL, '[phone removed]');
    return body;
  };

  let stage = 1;
  let body = render();
  const header = () => `<!-- Source: ${sourceUrl || 'unknown'} — captured ${capturedAt} — reduced to ${rootSelector} (stage ${stage}) by autofix-parser -->\n`;
  const fits = () => Buffer.byteLength(header() + body + '\n', 'utf8') <= MAX_FIXTURE_BYTES;
  if (!fits()) { stage = 2; pruneClasses(token => !NOISE_CLASS.test(token)); body = render(); }
  if (!fits()) { stage = 3; pruneClasses(token => PARSER_CLASS_HINT.test(token)); body = render(); }
  const result = `${header()}${body}\n`;
  const bytes = Buffer.byteLength(result, 'utf8');
  return { html: result, bytes, ok: bytes <= MAX_FIXTURE_BYTES, root: rootSelector, stage };
}

const EMAIL_GLOBAL = new RegExp(EMAIL.source, 'g');
const PHONE_GLOBAL = new RegExp(PHONE.source, 'g');

/** Text evidence gets a one-line header; JSON is kept verbatim (see checkFixture). */
export function sanitiseTextEvidence({ body, extension, sourceUrl, capturedAt }) {
  const cleaned = String(body || '').replace(EMAIL_GLOBAL, '[email removed]').replace(PHONE_GLOBAL, '[phone removed]');
  const result = extension === 'json' ? cleaned : `Source: ${sourceUrl || 'unknown'} — captured ${capturedAt} — kept verbatim by autofix-parser\n${cleaned}`;
  const bytes = Buffer.byteLength(result, 'utf8');
  return { html: result, bytes, ok: bytes <= MAX_FIXTURE_BYTES, root: extension };
}

/**
 * @param {string} patchText   unified diff (git diff / git format-patch body)
 * @param {{ category: string, parserFile?: string, testFile?: string }} options
 * @returns {{ ok: boolean, violations: string[], files: string[], fixtures: string[] }}
 */
export function checkPatch(patchText, { category, parserFile = null, testFile = null } = {}) {
  const violations = [];
  const files = parsePatch(patchText);
  if (!files.length) violations.push('patch is empty');

  const fixtures = [];
  for (const file of files) {
    const touched = [file.path, file.renamed ? file.oldPath : null].filter(Boolean);
    for (const p of touched) {
      if (DEPENDENCY_FILES.test(p)) violations.push(`${p}: dependency files may not change`);
      else if (!isPathAllowed(category, p)) violations.push(`${p}: outside the ${category} allowlist`);
    }
    if (file.isDeleted) violations.push(`${file.path}: deleting files is not allowed`);
    if (/^\.github\/autofix\/UNRESOLVED\.md$/.test(file.path)) violations.push('fixer reported UNRESOLVED; nothing to propose');

    for (const line of file.addedLines) {
      for (const [pattern, label] of FORBIDDEN_ADDED) {
        if (pattern.test(line)) violations.push(`${file.path}: added line uses ${label}: ${line.slice(1).trim().slice(0, 120)}`);
      }
      const spec = IMPORT_SPECIFIER.exec(line);
      if (spec && !spec[1].startsWith('.') && !NODE_BUILTIN_ALLOWED.test(spec[1])) {
        violations.push(`${file.path}: import of "${spec[1]}" is not relative or an allowed node: builtin`);
      }
      if (file.path.endsWith('.py')) {
        const py = PY_IMPORT.exec(line);
        const mod = py?.[1] || py?.[2];
        if (mod && !PY_STDLIB_ALLOWED.has(mod) && !PY_STDLIB_ALLOWED.has(mod.split('.')[0]) && mod !== 'scrape') {
          violations.push(`${file.path}: python import of "${mod}" is not allowed`);
        }
      }
    }

    if (file.path.startsWith('tests/fixtures/')) {
      if (!file.isNew) violations.push(`${file.path}: existing fixtures may not be modified`);
      const content = file.addedLines.map(line => line.slice(1)).join('\n');
      fixtures.push(file.path);
      violations.push(...checkFixture(file.path, content));
    }
  }

  const paths = new Set(files.map(file => file.path));
  if (parserFile && !paths.has(parserFile)) violations.push(`patch does not change ${parserFile}`);
  if (testFile && !paths.has(testFile)) violations.push(`patch does not add a test to ${testFile}`);
  if (!fixtures.length) violations.push('patch adds no fixture under tests/fixtures/');

  return { ok: violations.length === 0, violations: [...new Set(violations)], files: [...paths], fixtures };
}
