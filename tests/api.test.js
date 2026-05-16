const assert = require('node:assert/strict');
const test = require('node:test');

process.env.API_KEY_READ_LIMIT = '2';

const { app } = require('../index');

function startServer() {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

function createMockSupabase({ apiKey = null, plan = 'agency', sites = [] } = {}) {
  return {
    from(table) {
      const state = { table };
      const builder = {
        select() { return builder; },
        eq(column, value) {
          state[column] = value;
          return builder;
        },
        is() { return builder; },
        update() { return builder; },
        order() {
          if (table === 'sites') return Promise.resolve({ data: sites, error: null });
          if (table === 'incidents') return Promise.resolve({ data: [], error: null });
          return Promise.resolve({ data: [], error: null });
        },
        limit() {
          return Promise.resolve({ data: [], error: null });
        },
        maybeSingle() {
          if (table === 'api_keys') return Promise.resolve({ data: apiKey, error: null });
          if (table === 'profiles') {
            return Promise.resolve({ data: { plan, subscription_status: 'active' }, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        }
      };
      return builder;
    }
  };
}

async function withServer(fn, supabaseMock = null) {
  if (supabaseMock) app.locals.supabaseAdmin = supabaseMock;
  const { server, baseUrl } = await startServer();
  try {
    await fn(baseUrl);
  } finally {
    delete app.locals.supabaseAdmin;
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

test('API v1 endpoints reject invalid API keys', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/monitors`, {
      headers: { Authorization: 'Bearer st_invalid' }
    });
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.message, 'Invalid API key');
  }, createMockSupabase({ apiKey: null }));
});

test('API v1 endpoints reject non-agency API keys', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/monitors`, {
      headers: { Authorization: 'Bearer st_valid_but_not_agency' }
    });
    const body = await response.json();
    assert.equal(response.status, 402);
    assert.equal(body.code, 'agency_required');
  }, createMockSupabase({ apiKey: { id: 'key-starter', user_id: 'user-starter', name: 'Starter key' }, plan: 'starter' }));
});

test('API v1 endpoints allow agency API keys and expose rate limit headers', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/monitors`, {
      headers: { Authorization: 'Bearer st_valid_agency_key' }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'success');
    assert.equal(response.headers.get('x-ratelimit-limit'), '2');
    assert.equal(response.headers.get('x-ratelimit-remaining'), '1');
  }, createMockSupabase({ apiKey: { id: 'key-agency-ok', user_id: 'user-agency', name: 'Agency key' }, sites: [{ id: 'site-1', name: 'Site' }] }));
});

test('API v1 endpoints rate limit agency API keys', async () => {
  await withServer(async (baseUrl) => {
    const headers = { Authorization: 'Bearer st_valid_rate_limited_key' };
    await fetch(`${baseUrl}/api/v1/monitors`, { headers });
    await fetch(`${baseUrl}/api/v1/monitors`, { headers });
    const response = await fetch(`${baseUrl}/api/v1/monitors`, { headers });
    const body = await response.json();
    assert.equal(response.status, 429);
    assert.equal(body.code, 'rate_limited');
    assert.equal(response.headers.get('x-ratelimit-limit'), '2');
    assert.equal(response.headers.get('x-ratelimit-remaining'), '0');
  }, createMockSupabase({ apiKey: { id: 'key-rate-limit', user_id: 'user-agency', name: 'Agency key' } }));
});

test('public report API is not swallowed by the catch-all route', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/public/report/test-slug`);
    const contentType = response.headers.get('content-type') || '';
    assert.equal(response.status, 503);
    assert.match(contentType, /application\/json/);
  });
});
