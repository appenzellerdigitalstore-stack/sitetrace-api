# SiteTrace Release Checklist

Use this checklist before every production deploy.

## 1. Local Verification

- [ ] Pull latest `main`.
- [ ] Run `npm install` if `package-lock.json` changed.
- [ ] Run `npm run check`.
- [ ] Run `node --check assets/app.js`.
- [ ] Run `npm test`.
- [ ] Run `npm audit --omit=dev`.

## 2. Supabase

- [ ] Run `supabase-schema.sql` in the Supabase SQL editor after schema changes.
- [ ] Confirm `profiles`, `sites`, `checks`, `incidents`, `alerts`, and `api_keys` exist.
- [ ] Confirm RLS is enabled on user-owned tables.
- [ ] Confirm your test account has the expected plan in `profiles`.
- [ ] For API testing, confirm the account is `agency` and `subscription_status` is `active`.

## 3. Render Environment

Required:

- [ ] `APP_URL`
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `CRON_SECRET`
- [ ] `HEALTH_SECRET`

Billing:

- [ ] `STRIPE_SECRET_KEY`
- [ ] `STRIPE_WEBHOOK_SECRET`
- [ ] `STRIPE_STARTER_PRICE_ID`
- [ ] `STRIPE_AGENCY_PRICE_ID`

API limits:

- [ ] `API_KEY_READ_LIMIT` defaults to `600`
- [ ] `API_KEY_ANALYZE_LIMIT` defaults to `60`
- [ ] `API_KEY_RATE_LIMIT_WINDOW_MS` defaults to `3600000`

Optional alerts:

- [ ] `RESEND_API_KEY`
- [ ] `ALERT_FROM_EMAIL`
- [ ] `ALERT_REPLY_TO_EMAIL`
- [ ] `SLACK_WEBHOOK_URL`
- [ ] `TEAMS_WEBHOOK_URL`

## 4. Deploy

- [ ] Deploy latest `main` commit in Render.
- [ ] Confirm the deployed commit hash matches GitHub.
- [ ] Open Render logs and watch for boot errors.
- [ ] Visit `/health`.
- [ ] Visit `/health/deep` with `Authorization: Bearer HEALTH_SECRET`.

Expected:

- `/health` returns `status: ok`.
- `/health/deep` returns `status: ok` when critical config and Supabase are healthy.
- `/health/deep` may include warnings for optional integrations that are intentionally disabled.
- `/health/deep` returns `401` without the health secret when `HEALTH_SECRET` is configured.

## 5. Smoke Tests

Public analyzer:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "https://sitetrace-api.onrender.com/analyze" `
  -ContentType "application/json" `
  -Body '{"url":"https://example.com","locale":"en"}'
```

Private URL protection:

```powershell
Invoke-WebRequest `
  -Method Post `
  -Uri "https://sitetrace-api.onrender.com/analyze" `
  -ContentType "application/json" `
  -Body '{"url":"http://127.0.0.1","locale":"en"}'
```

Expected: HTTP `400`.

API key flow:

- [ ] Log in as an Agency user.
- [ ] Open Dashboard > API Access.
- [ ] Create a key with label `Production smoke test`.
- [ ] Copy the key.
- [ ] Call `/api/v1/monitors`.
- [ ] Confirm `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` headers exist.
- [ ] Revoke the key.
- [ ] Call `/api/v1/monitors` again.

Expected after revoke: HTTP `401`.

```powershell
$API_KEY="st_your_key_here"

Invoke-RestMethod `
  -Uri "https://sitetrace-api.onrender.com/api/v1/monitors" `
  -Headers @{ Authorization = "Bearer $API_KEY" }
```

## 6. Scheduled Checks

- [ ] Trigger the cron endpoint with `CRON_SECRET`.
- [ ] Confirm response contains `status: success`.
- [ ] Confirm Render logs include `cron_checks_completed`.

```powershell
$CRON_SECRET="your_secret"

Invoke-RestMethod `
  -Method Post `
  -Uri "https://sitetrace-api.onrender.com/jobs/run-checks" `
  -Headers @{ Authorization = "Bearer $CRON_SECRET" }
```

## 7. Logs To Watch

Structured events:

- `api_key_created`
- `api_key_revoked`
- `api_key_rate_limited`
- `cron_checks_completed`

Error patterns:

- `Supabase server credentials are not configured`
- `Stripe is not configured`
- `Billing webhook is not configured`
- `Analyze error`

## 8. Rollback

- [ ] In Render, use previous successful deploy if the release fails.
- [ ] Re-run `/health` and `/health/deep`.
- [ ] Re-test dashboard login and `/analyze`.
