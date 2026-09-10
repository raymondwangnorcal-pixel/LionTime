# QR poster tracking

LionHour tracks aggregate visits from eleven permanent poster URLs:

| Poster | QR destination |
| --- | --- |
| Dodge | `https://lionhour.com/qr/dodge` |
| Butler | `https://lionhour.com/qr/butler` |
| General Dining | `https://lionhour.com/qr/dining` |
| Ferris | `https://lionhour.com/qr/ferris` |
| Hewitt | `https://lionhour.com/qr/hewitt` |
| Plug | `https://lionhour.com/qr/plug` |
| Feedback | `https://lionhour.com/qr/feedback` |
| Orientation | `https://lionhour.com/qr/orientation` |
| Discord | `https://lionhour.com/qr/discord` |
| Reddit | `https://lionhour.com/qr/reddit` |
| Butler Closure | `https://lionhour.com/qr/butler-closure` |

Each QR `GET` returns an uncached lightweight HTML landing page with LionHour's Open Graph and Twitter preview metadata. The page does not increment a counter when fetched, so ordinary link-preview crawlers do not inflate the totals. In a browser, the page sends a `POST` to the same QR URL, then redirects to the LionHour home page. A valid `POST` increments an all-time hash and an Eastern-date daily hash in Upstash Redis and returns `204`. The daily hashes expire after 400 days; all-time totals do not expire. If Redis is temporarily unavailable, the visitor is still redirected and the failed scan is logged rather than counted.

Counts are aggregate browser visits that execute the tracking `POST`. Repeated scans and browser reloads may each increment a total; ordinary metadata-only link previews do not. No IP address or visitor identifier is stored by the QR tracker.

## Deployment

The tracker uses the same Upstash Redis environment variables as LionHour's existing Dining voting feature. Add a strong `QR_STATS_SECRET` to the Vercel project for Production, and optionally Preview, before deploying. Add the same value as a GitHub Actions repository secret named `QR_STATS_SECRET` so the scheduled Telegram report can authenticate to the private statistics endpoint.

After deployment, verify each printed destination returns `200`, `Content-Type: text/html`, `Cache-Control: no-store`, and the V7 preview metadata. Opening the URL in a browser should issue one `POST`, receive `204`, and redirect to `/`.

## Viewing results

Request the private report with the secret in the Authorization header:

```sh
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $QR_STATS_SECRET" \
  https://www.lionhour.com/api/qr-stats
```

The response lists all eleven posters in descending all-time order and includes both all-time and current-day totals:

```json
{
  "date": "2026-08-27",
  "posters": [
    { "id": "ferris", "label": "Ferris", "allTime": 387, "today": 12 },
    { "id": "dining", "label": "General Dining", "allTime": 291, "today": 8 }
  ]
}
```

Unauthorized requests return `401` and never expose the counts.

The `Report site views` GitHub Actions workflow includes these rankings in its existing Telegram message every six hours. A manual workflow dispatch sends the same report on demand. If the QR endpoint or secret is unavailable, the Telegram message still includes site views and marks the QR section unavailable.
