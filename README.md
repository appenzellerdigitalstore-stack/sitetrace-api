# SiteTrace

SiteTrace is a lightweight website monitoring and SEO health check product. It started as a basic SEO analyzer and now focuses on a stronger promise:

> UptimeRobot tells you when a site is down. SiteTrace tells you when it is down, slow, insecure, or missing important SEO basics.

## What It Checks

- HTTP status and response time
- Keyword presence checks for monitored sites
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

## Product Direction

Suggested paid tiers:

- Free: manual checks, limited hourly usage
- Starter: `$19/month`, 5 monitored sites, 5-minute checks, email alerts, 30-day history
- Agency: `$79/month`, 50 monitored sites, client reports, status pages, webhooks, API access

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

### Optional Alerts

Add these if you want SiteTrace to send alerts when a monitored site changes into `down` or `warning`, and again when it resolves:

```bash
RESEND_API_KEY=...
ALERT_FROM_EMAIL=SiteTrace <alerts@sitetrace.it.com>
SLACK_WEBHOOK_URL=...
TEAMS_WEBHOOK_URL=...
```

## Local Development

```bash
npm install
npm run check
npm start
```

Then open `http://localhost:3000`.
