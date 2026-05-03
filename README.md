# SiteTrace

SiteTrace is a lightweight website monitoring and SEO health check product. It started as a basic SEO analyzer and now focuses on a stronger promise:

> UptimeRobot tells you when a site is down. SiteTrace tells you when it is down, slow, insecure, or missing important SEO basics.

## What It Checks

- HTTP status and response time
- HTTPS usage and SSL certificate expiration
- Title and meta description health
- H1 structure
- Image ALT coverage
- Canonical tags
- Mobile viewport
- HTML language attribute
- Open Graph sharing metadata
- Robots noindex detection
- Security headers: HSTS, CSP, and frame protection

## API

### `POST /analyze`

Request:

```json
{
  "url": "https://example.com",
  "locale": "en"
}
```

`locale` can be `en` or `es`.

Response:

```json
{
  "status": "success",
  "score": 82,
  "response_time": "243ms",
  "status_code": 200,
  "checks": [
    {
      "category": "seo",
      "id": "title",
      "level": "pass",
      "title": "Title tag is healthy",
      "recommendation": "Keep titles specific and close to 30-60 characters."
    }
  ]
}
```

### `GET /health`

Returns API health:

```json
{
  "status": "ok",
  "service": "sitetrace-api"
}
```

## Product Direction

Suggested paid tiers:

- Free: manual checks, limited hourly usage
- Starter: monitored sites, 5-minute checks, email alerts, 30-day history
- Agency: more sites, client reports, webhooks, API access

## Dashboard, Login, And Billing

The app now includes a lightweight dashboard on the same `index.html` page.

It supports:

- Supabase email/password auth
- Saved monitored sites
- Manual checks from the dashboard
- Check history
- Stripe Checkout buttons for Starter and Agency
- Cron endpoint for scheduled checks

### Required Supabase Setup

1. Create a Supabase project.
2. Open the SQL editor.
3. Run `supabase-schema.sql`.
4. Add these environment variables in Render:

```bash
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
APP_URL=https://www.sitetrace.it.com
```

The anon key is safe for the browser. The service role key must stay private in Render.

### Required Stripe Setup

Create two recurring Stripe prices, then add:

```bash
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
STRIPE_STARTER_PRICE_ID=...
STRIPE_AGENCY_PRICE_ID=...
```

Stripe webhook endpoint:

```txt
https://sitetrace-api.onrender.com/billing/webhook
```

Recommended events:

- `checkout.session.completed`
- `customer.subscription.deleted`

### Cron Setup

Add:

```bash
CRON_SECRET=long-random-secret
```

Then create a Render Cron Job or external cron that sends:

```bash
POST https://sitetrace-api.onrender.com/jobs/run-checks
Authorization: Bearer long-random-secret
```

## Local Development

```bash
npm install
npm run check
npm start
```

Then open `http://localhost:3000`.
