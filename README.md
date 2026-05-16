# SiteTrace

SiteTrace is a lightweight website monitoring and SEO health check product. It started as a basic SEO analyzer and now focuses on a stronger promise:

> UptimeRobot tells you when a site is down. SiteTrace tells you when it is down, slow, insecure, or missing important SEO basics.

## What It Checks

- HTTP status and response time
- Keyword presence checks for monitored sites
- HTTPS usage and SSL certificate expiration
- Domain registration expiration through RDAP
- Title and meta description health
- H1 structure
- Image ALT coverage
- Canonical tags
- Mobile viewport
- HTML language attribute
- Open Graph sharing metadata
- Robots noindex detection
- Security headers: HSTS, CSP, and frame protection

## Product Direction

Suggested paid tiers:

- Free: public one-time audits with visual SEO, uptime, SSL, domain expiry, content, and security recommendations
- Starter: `$19/month`, 5 monitored sites, 5-minute scheduled checks, email alerts, status pages, client-ready reports, 30-day history
- Agency: `$79/month`, 50 monitored sites, 1-minute scheduled checks, 90-day history, client reports, status pages, webhooks, API access

## Dashboard, Login, And Billing

The app includes dedicated landing, pricing, sign-in, dashboard, and public status pages.

It supports:

- Supabase email/password auth
- Saved monitored sites
- Manual checks from the dashboard
- Check history
- Public status pages
- Keyword monitoring
- Maintenance windows
- Stripe Checkout buttons for Starter and Agency
- Cron endpoint for scheduled checks
- Incident lifecycle records and optional alerts through Resend, Slack, or Microsoft Teams webhooks

For the full activation sequence, see `SETUP.md`.
For production deploy checks, see `RELEASE_CHECKLIST.md`.

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

### Agency API Keys

Agency users can generate API keys from the dashboard API Access panel. Keys are shown once and stored only as SHA-256 hashes in Supabase.

Available API endpoints:

```bash
GET  /api/v1/monitors
GET  /api/v1/monitors/:id/checks
GET  /api/v1/incidents
POST /api/v1/analyze
Authorization: Bearer st_your_api_key
```

### Optional Alerts

Add these if you want SiteTrace to send alerts when a monitored site changes into `down` or `warning`, and again when it resolves:

```bash
RESEND_API_KEY=...
ALERT_FROM_EMAIL=SiteTrace <alerts@sitetrace.it.com>
SLACK_WEBHOOK_URL=...
TEAMS_WEBHOOK_URL=...
```

For `sitetrace.it.com`, keep Resend SPF/DKIM records and remove the custom `_dmarc.sitetrace.it.com` TXT record if it conflicts with the parent `it.com` DMARC policy. Resend indicated Gmail rejections are likely caused by that DMARC conflict.

## Local Development

```bash
npm install
npm run check
npm start
```

Then open `http://localhost:3000`.
