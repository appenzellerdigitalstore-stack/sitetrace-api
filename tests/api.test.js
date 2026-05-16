const assert = require('node:assert/strict');
const test = require('node:test');
const { app } = require('../index');

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function withServer(fn) {
  const { server, baseUrl } = await startServer();
  try {
    await fn(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('health endpoint returns ok', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });
});

test('public analyzer rejects local network URLs', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: baseUrl, locale: 'en' })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, 'invalid_url');
  });
});

test('API v1 endpoints require an API key before doing protected work', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/monitors`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.message, 'Missing API key');
    assert.equal(response.headers.get('x-ratelimit-limit'), null);
  });
});

test('public report API is not swallowed by the catch-all route', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/public/report/test-slug`);
    const contentType = response.headers.get('content-type') || '';
    assert.equal(response.status, 503);
    assert.match(contentType, /application\/json/);
  });
});
