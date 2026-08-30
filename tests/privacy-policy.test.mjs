import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const privacyUrl = new URL('../privacy.html', import.meta.url);

test('links to the privacy policy from the site footer', () => {
  const footer = indexHtml.match(/<footer class="footer">([\s\S]*?)<\/footer>/)?.[1] || '';

  assert.match(footer, /href="\/privacy\.html">Privacy Policy<\/a>/);
});

test('identifies Gapless Labs as LionHour’s operator', () => {
  assert.ok(existsSync(privacyUrl), 'expected a standalone privacy policy page');
  const privacyHtml = readFileSync(privacyUrl, 'utf8');

  assert.match(privacyHtml, /operated by Gapless Labs/i);
});

test('states current LionHour data uses', () => {
  const privacyHtml = readFileSync(privacyUrl, 'utf8');

  assert.match(privacyHtml, /website views/i);
  assert.match(privacyHtml, /QR code tracking/i);
  assert.match(privacyHtml, /feedback form/i);
  assert.match(privacyHtml, /improve site performance/i);
  assert.match(privacyHtml, /Google Sheets/i);
});
