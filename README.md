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

## Local Development

```bash
npm install
npm run check
npm start
```

Then open `http://localhost:3000`.
