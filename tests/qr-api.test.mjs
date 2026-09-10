import assert from 'node:assert/strict';
import test from 'node:test';

process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.invalid';
process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';

const { default: handler } = await import('../api/qr.js');

function createResponse() {
  return {
    headers: {},
    statusCode: null,
    transport: null,
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(value) {
      this.statusCode = value;
      return this;
    },
    end() {
      this.transport = 'end';
      return this;
    },
    json(value) {
      this.transport = 'json';
      this.body = value;
      return this;
    },
    send(value) {
      this.transport = 'send';
      this.body = value;
      return this;
    },
  };
}

test('sends the QR preview landing as an HTML response', async () => {
  const response = createResponse();

  await handler({ method: 'GET', query: { poster: 'dodge' } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(response.transport, 'send');
  assert.match(response.body, /<meta property="og:image" content="https:\/\/lionhour\.com\/assets\/lionhour-social-hero-v7\.png">/);
});
