# SiteTrace - Continuation Summary

Use this document to continue the SiteTrace work in a new chat.

## Project

Repository:

```txt
https://github.com/appenzellerdigitalstore-stack/sitetrace-api
```

Public site:

```txt
https://www.sitetrace.it.com/
```

Render API:

```txt
https://sitetrace-api.onrender.com
```

Stack:

- Node.js + Express
- Vanilla HTML/CSS/JS frontend
- Axios + Cheerio analyzer
- Supabase auth/database
- Stripe scaffold for billing
- Resend email alerts
- Optional Slack and Microsoft Teams webhook alerts
- Render deployment

## Current Product Shape

SiteTrace is now a small website monitoring product, not just an SEO scanner.

Pages:

- `/` landing page with free scanner
- `/pricing`
- `/api` now renamed in navigation as "How it works"; it explains product behavior, not public API docs
- `/signin`
- `/dashboard`
- `/status/:slug` public status pages

Dashboard layout:

- Sites list on the left
- Selected monitor detail on the right
- Metrics, latest recommendations, recent checks, uptime bars, monitor settings

## Major Implemented Features

### Analyzer

The analyzer checks:

- HTTP status
- response time
- HTTPS
- SSL certificate health
- title/meta/H1
- image ALT coverage
- canonical
- viewport
- HTML lang
- Open Graph
- robots noindex
- HSTS/CSP/frame protection
- keyword presence for monitored sites

It is context-aware for platforms like YouTube, Steam, GitHub, etc. It no longer treats some platform-specific SEO quirks as critical problems.

Important fixes:

- Missing H1 on platforms is not critical.
- Short title on platforms is acceptable.
- Missing viewport/Open Graph on platforms is treated as platform-managed/informational.
- `down` now means real availability/monitoring failure, not generic SEO failure.

### Dashboard

Implemented:

- Supabase email/password auth
- saved monitored sites
- manual checks
- check history
- selected monitor panel
- uptime sample
- average response time
- recent incidents count
- time since last check
- time since last down
- visual uptime bars
- keyword rule
- maintenance start/end
- public status page toggle

URL input fix:

- Dashboard URL field is now text/inputmode URL instead of native `type=url`.
- Accepts `example.com`, `www.example.com`, or `https://example.com`.
- Automatically prepends `https://` when missing.
- Avoids browser-native Spanish validation messages like "Introduce una URL".

### Incident Lifecycle

Implemented:

- Unreachable/fetch-failed monitors are now recorded as `down` checks.
- Incident opens after 2 consecutive matching `down` or `warning` checks.
- Incident resolves automatically when monitor returns to `online`.
- Resolution stores `resolved_at` and `duration_seconds`.
- Maintenance windows skip incident creation.
- Alerts fire on incident open and incident resolve.

### Alerts

Resend email alerts:

- Domain `sitetrace.it.com` was added and verified in Resend.
- DNS records were added in Namecheap:
  - DKIM TXT
  - SPF TXT for `send`
  - DMARC TXT
  - MX for `send`
- `RESEND_API_KEY` and `ALERT_FROM_EMAIL` should be configured in Render.

Slack and Teams:

- Optional webhook variables added:

```bash
SLACK_WEBHOOK_URL=
TEAMS_WEBHOOK_URL=
```

Behavior:

- If Resend is configured, emails are sent.
- If Slack webhook is configured, Slack messages are sent.
- If Teams webhook is configured, Teams messages are sent.
- If none are configured, incidents are still recorded in Supabase.

Email fallback fix:

- If `profiles.email` is empty, backend now fetches user email from Supabase Auth.
- `/api/me` repairs profile email when user signs in.

### Public Status Pages

Implemented:

- Route:

```txt
/status/:slug
```

- Public data endpoint:

```txt
/public/status/:slug
```

Shows:

- monitor name
- URL
- current status
- uptime sample
- response time
- last check
- uptime bars
- incident history

Enable per monitor from dashboard settings.

### Security / Anti-Abuse

Implemented:

- CORS restricted to SiteTrace domains and localhost.
- Public API documentation removed from the frontend.
- `/api` page now explains "How it works" instead of showing endpoint details.
- Public scanner still works from the SiteTrace site.

## Important Commits

Recent notable commits:

```txt
9a2ec83 Improve SiteTrace product and analyzer
ceb34f3 Make H1 checks context aware
2b60aa0 Add dashboard auth and billing foundation
9eba75b Set Node version for Render deploy
9bd4427 Add setup checklist and alert foundation
9cf8aa7 Use API origin for dashboard requests
bea1e2d Fix monitoring status classification
16e5bba Split frontend into dedicated pages
d83685c Document public analyze API
14b2ce0 Refine product info and monitoring dashboard
925cbf3 Make title checks platform aware
a473e1b Reduce platform SEO noise
44c4575 Add incident lifecycle and status pages
1180dd3 Add Slack and Teams incident webhooks
6fca119 Fix dashboard URL entry
72f35c1 Record unreachable monitor checks
ee41828 Fallback to auth email for alerts
9aa90dd Explain monitor settings
```

Current latest pushed commit at time of this summary:

```txt
9aa90dd Explain monitor settings
```

## Environment Variables

Render should have:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=https://www.sitetrace.it.com
```

Optional billing:

```bash
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STARTER_PRICE_ID=
STRIPE_AGENCY_PRICE_ID=
```

Scheduled checks:

```bash
CRON_SECRET=
```

Alerts:

```bash
RESEND_API_KEY=
ALERT_FROM_EMAIL=SiteTrace <alerts@sitetrace.it.com>
SLACK_WEBHOOK_URL=
TEAMS_WEBHOOK_URL=
```

Other:

```bash
RATE_LIMIT=20
RATE_LIMIT_WINDOW_MS=3600000
API_TIMEOUT_MS=12000
MAX_BODY_BYTES=2097152
```

## Supabase

The user already created Supabase and previously ran `supabase-schema.sql`.

Important: after the incident/status page updates, `supabase-schema.sql` should be run again in Supabase SQL Editor. It includes `alter table ... add column if not exists`, so it is safe to rerun.

New columns include:

- `sites.keyword`
- `sites.keyword_should_exist`
- `sites.maintenance_starts_at`
- `sites.maintenance_ends_at`
- `sites.status_page_enabled`
- `sites.public_slug`
- `incidents.duration_seconds`
- `incidents.resolved_details`
- `incidents.confirmed_after_checks`

## Resend / Email Alerts Status

The user configured DNS records in Namecheap and Resend showed domain verified.

User said they added Render variables.

Backend `/config` returned:

```json
{
  "alerts_enabled": true
}
```

If emails still do not arrive:

1. Make sure latest commit is deployed.
2. Sign out and sign back in so `/api/me` repairs `profiles.email`.
3. Run a fake/unreachable monitor twice.
4. Check Resend Logs.
5. Check spam folder.

## Testing Alerts

To test a real unreachable monitor:

1. Add a fake URL or invalid site.
2. Click `Run check` twice.
3. The second consecutive failure should open an incident.
4. Email should be sent if Resend is configured.

To test keyword monitoring:

1. Add a real site.
2. In monitor settings, set a fake keyword like:

```txt
sitetrace-alert-test-999999
```

3. Save settings.
4. Click `Run check` twice.
5. Should open incident and send alert.
6. Remove keyword and run check again to resolve.

## Render Deployment Steps

Whenever changes are pushed:

1. Open Render service `sitetrace-api`.
2. Click `Manual Deploy`.
3. Click `Deploy latest commit`.
4. Wait for deploy to complete.
5. Hard refresh the browser.

## Known / Pending Items

Not implemented yet:

- Stripe production setup
- Teams/Slack actual webhook URLs
- Twilio/SMS
- DNS monitoring
- domain expiry monitoring
- multi-location checks
- plan-aware scheduled intervals
- status page branding/custom domain
- unsubscribe/notification preferences
- full incident details UI separate from checks

Possible next priorities:

1. Verify email delivery through Resend logs.
2. Add DNS monitoring.
3. Add domain expiry monitoring.
4. Improve status page design.
5. Add notification preferences per monitor.
6. Configure Stripe.
7. Configure Render Cron.
