import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';

const indexPath = new URL('../index.html', import.meta.url);

test('requests Vercel Web Analytics when the site loads', async (t) => {
  const requestedPaths = [];
  const server = createServer(async (request, response) => {
    requestedPaths.push(request.url);
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(await readFile(indexPath));
      return;
    }
    if (request.url === '/_vercel/insights/script.js') {
      response.writeHead(200, { 'content-type': 'application/javascript' });
      response.end('');
      return;
    }
    response.writeHead(404);
    response.end();
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { port } = server.address();

  const browser = await chromium.launch();
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });

  assert.ok(requestedPaths.includes('/_vercel/insights/script.js'));
});
