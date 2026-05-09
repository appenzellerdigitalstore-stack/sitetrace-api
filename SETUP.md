# SiteTrace Setup Checklist

This is the activation checklist for login, dashboard, billing, scheduled checks, and alerts.

## 1. Supabase

1. Create a Supabase project.
2. Go to SQL Editor.
3. Run `supabase-schema.sql`. Re-run it after product updates; it uses safe `if not exists` migrations for new columns.
4. Go to Project Settings > API.
5. Copy:
   - Project URL
   - anon public key
   - service role key

Add these to Render:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=https://www.sitetrace.it.com
```

## 2. Stripe

1. Create a product named `SiteTrace Starter`.
2. Add a recurring monthly price for `$19`.
3. Create a product named `SiteTrace Agency`.
4. Add a recurring monthly price for `$79`.
5. Copy both price IDs.
6. Add a webhook endpoint:

```txt
https://sitetrace-api.onrender.com/billing/webhook
```

Webhook events:

- `checkout.session.completed`
- `customer.subscription.deleted`

Add these to Render:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_AGENCY_PRICE_ID=
```

## 3. Scheduled Checks

Add this to Render:

```bash
CRON_SECRET=
```

Create a Render Cron Job that calls:

```txt
POST https://sitetrace-api.onrender.com/jobs/run-checks
Authorization: Bearer YOUR_CRON_SECRET
```

Recommended interval:

- MVP: every 5 minutes
- Later: plan-aware scheduling

## 4. Alerts

Create a Resend account and verify your sending domain.

Add these to Render:

```bash
RESEND_API_KEY=
ALERT_FROM_EMAIL=SiteTrace <alerts@sitetrace.it.com>
```

For Slack and Microsoft Teams, create incoming webhook URLs and add either or both:

```bash
SLACK_WEBHOOK_URL=
TEAMS_WEBHOOK_URL=
```

If no alert provider is configured, SiteTrace still records incidents but skips external delivery.

Alerts are intentionally conservative:

- a down or warning incident opens only after two matching checks
- domain registration expiry warnings use the same incident flow when the domain is near expiry
- resolved alerts are sent when a monitor returns to online
- maintenance windows skip incident creation

## 5. Public Status Pages

Public status pages use the site's generated slug:

```txt
https://www.sitetrace.it.com/status/PUBLIC_SLUG
```

Enable the status page from the dashboard monitor settings.

## 6. Render

Render should use:

```bash
npm install
npm start
```

The project requires Node 20 or newer through `package.json` engines.
