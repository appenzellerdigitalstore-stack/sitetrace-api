const assert = require('node:assert/strict');
const test = require('node:test');

process.env.API_KEY_READ_LIMIT = '2';
process.env.HEALTH_SECRET = 'test-health-secret';

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
  const usage = [];
  return {
    __usage: usage,
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
        insert(values) {
          if (table === 'api_key_usage') {
            usage.push(values);
            return Promise.resolve({ data: null, error: null });
          }
          return builder;
        },
        order() {
          // Return a thenable that also supports further chaining
          const result = { data: table === 'sites' ? sites : [], error: null };
          const chainable = {
            limit() { return Promise.resolve(result); },
            then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); }
          };
          return chainable;
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

test('deep health reports degraded when required config is missing', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/deep`, {
      headers: { Authorization: 'Bearer test-health-secret' }
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.status, 'degraded');
    assert.equal(body.checks.supabase_configured, false);
    assert.equal(body.checks.supabase_reachable, false);
  });
});

test('deep health requires HEALTH_SECRET when configured', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health/deep`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.message, 'Unauthorized');
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
  const supabase = createMockSupabase({
    apiKey: { id: 'key-agency-ok', user_id: 'user-agency', name: 'Agency key' },
    sites: [{ id: 'site-1', name: 'Site' }]
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/monitors`, {
      headers: { Authorization: 'Bearer st_valid_agency_key' }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'success');
    assert.equal(response.headers.get('x-ratelimit-limit'), '2');
    assert.equal(response.headers.get('x-ratelimit-remaining'), '1');
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(supabase.__usage.length, 1);
    assert.equal(supabase.__usage[0].endpoint, '/api/v1/monitors');
    assert.equal(supabase.__usage[0].status_code, 200);
    assert.equal(supabase.__usage[0].rate_limited, false);
  }, supabase);
});

test('API v1 endpoints rate limit agency API keys', async () => {
  const supabase = createMockSupabase({ apiKey: { id: 'key-rate-limit', user_id: 'user-agency', name: 'Agency key' } });
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
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(supabase.__usage.length, 3);
    assert.equal(supabase.__usage[2].status_code, 429);
    assert.equal(supabase.__usage[2].rate_limited, true);
  }, supabase);
});

test('public report API is not swallowed by the catch-all route', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/public/report/test-slug`);
    const contentType = response.headers.get('content-type') || '';
    assert.equal(response.status, 503);
    assert.match(contentType, /application\/json/);
  });
});

test('CORS header is present for allowed origins', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://www.sitetrace.it.com' }
    });
    assert.equal(response.status, 200);
    // CORS header should be present for allowed origin
    const corsHeader = response.headers.get('access-control-allow-origin');
    assert.ok(corsHeader !== null, 'CORS header should be set for allowed origin');
  });
});

test('CORS header is absent for disallowed origins', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`, {
      headers: { Origin: 'https://evil.example.com' }
    });
    // CORS middleware blocks disallowed origins (returns error or 200 without reflecting origin)
    const corsHeader = response.headers.get('access-control-allow-origin');
    assert.ok(corsHeader !== 'https://evil.example.com', 'CORS header should not reflect disallowed origin');
  });
});

test('analyze endpoint rejects missing URL', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locale: 'en' })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, 'invalid_url');
  });
});

test('analyze endpoint rejects javascript: URL', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'javascript:alert(1)', locale: 'en' })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, 'invalid_url');
  });
});

test('analyze endpoint rejects file: URL', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/passwd', locale: 'en' })
    });
    // file:// URLs are rejected — either as invalid_url (400) or network error (502)
    assert.ok(response.status === 400 || response.status === 502, `Expected 400 or 502, got ${response.status}`);
  });
});

test('analyze endpoint rejects private IP range (10.x.x.x)', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://10.0.0.1', locale: 'en' })
    });
    const body = await response.json();
    assert.equal(response.status, 400);
    assert.equal(body.code, 'invalid_url');
  });
});

test('public status endpoint returns 503 json when Supabase not configured', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/public/status/test-slug-xyz`);
    const contentType = response.headers.get('content-type') || '';
    // Without supabase, it should return json error, not HTML
    assert.match(contentType, /application\/json/);
    assert.ok(response.status >= 400, 'Should return error status without Supabase');
  });
});

test('health dashboard page is served as HTML', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health-dashboard`);
    const contentType = response.headers.get('content-type') || '';
    assert.equal(response.status, 200);
    assert.match(contentType, /text\/html/);
  });
});

test('API v1 incidents endpoint requires API key', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/incidents`);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.message, 'Missing API key');
  });
});

test('API v1 incidents endpoint returns data for agency key', async () => {
  const supabase = createMockSupabase({
    apiKey: { id: 'key-agency-inc', user_id: 'user-agency', name: 'Agency key' }
  });
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/incidents`, {
      headers: { Authorization: 'Bearer st_valid_agency_key' }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.status, 'success');
    assert.ok(Array.isArray(body.incidents), 'incidents should be an array');
  }, supabase);
});

test('security headers are present on all responses', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
    assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });
});

test('cron endpoint requires CRON_SECRET', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/jobs/run-checks`, {
      method: 'POST'
    });
    // Without CRON_SECRET configured, should return 401 or 503
    assert.ok(response.status === 401 || response.status === 503, `Expected 401 or 503, got ${response.status}`);
  });
});

test('API v1 analyze endpoint requires agency key', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/v1/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    assert.equal(response.status, 401);
  });
});

test('response body size limit rejects oversized requests', async () => {
  await withServer(async (baseUrl) => {
    const largePayload = JSON.stringify({ url: 'https://example.com', extra: 'x'.repeat(3_000_000) });
    const response = await fetch(`${baseUrl}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: largePayload
    });
    // Should reject with 413 or 400
    assert.ok(response.status === 413 || response.status === 400, `Expected 413 or 400 for oversized payload, got ${response.status}`);
  });
});
