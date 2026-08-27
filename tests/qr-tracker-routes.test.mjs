import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vercelConfigUrl = new URL('../vercel.json', import.meta.url);

test('routes permanent poster URLs through the QR scan endpoint', async () => {
  const config = JSON.parse(await readFile(vercelConfigUrl, 'utf8'));

  assert.ok(config.rewrites.some((rewrite) => (
    rewrite.source === '/qr/:poster'
      && rewrite.destination === '/api/qr?poster=:poster'
  )));
});
