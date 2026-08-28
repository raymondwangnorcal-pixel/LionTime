import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const indexUrl = new URL('../index.html', import.meta.url);
const previewUrl = new URL('../assets/lionhour-social-hero-v7.png', import.meta.url);

function metaContent(html, attribute, value) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = html.match(new RegExp(`<meta\\s+${attribute}="${escaped}"\\s+content="([^"]+)"`));
  return match?.[1];
}

test('publishes the V7 social hero with its real dimensions', async () => {
  const [html, image] = await Promise.all([
    readFile(indexUrl, 'utf8'),
    readFile(previewUrl),
  ]);

  assert.equal(
    metaContent(html, 'property', 'og:image'),
    'https://lionhour.com/assets/lionhour-social-hero-v7.png',
  );
  assert.equal(
    metaContent(html, 'name', 'twitter:image'),
    'https://lionhour.com/assets/lionhour-social-hero-v7.png',
  );
  assert.equal(metaContent(html, 'property', 'og:image:width'), '1730');
  assert.equal(metaContent(html, 'property', 'og:image:height'), '909');
  assert.equal(image.readUInt32BE(16), 1730);
  assert.equal(image.readUInt32BE(20), 909);
});
