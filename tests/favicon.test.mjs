import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium } from 'playwright';

const indexPath = new URL('../index.html', import.meta.url);
const faviconPath = new URL('../assets/lionhour-favicon.png', import.meta.url);

test('loads the Columbia favicon from the project assets', async (t) => {
  const server = createServer(async (request, response) => {
    if (request.url === '/') {
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end(await readFile(indexPath));
      return;
    }
    if (request.url === '/assets/lionhour-favicon.png') {
      response.writeHead(200, { 'content-type': 'image/png' });
      response.end(await readFile(faviconPath));
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
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });

  const iconHref = await page.evaluate(() => document.querySelector('link[rel="icon"]')?.getAttribute('href'));
  assert.equal(iconHref, 'assets/lionhour-favicon.png');

  const faviconResponse = await page.request.get(`http://127.0.0.1:${port}/${iconHref}`);
  assert.equal(faviconResponse.status(), 200);
  assert.equal(faviconResponse.headers()['content-type'], 'image/png');
});
