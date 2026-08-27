# QR poster tracking

LionHour tracks aggregate visits from five permanent poster URLs:

| Poster | QR destination |
| --- | --- |
| Dodge | `https://lionhour.com/qr/dodge` |
| Butler | `https://lionhour.com/qr/butler` |
| General Dining | `https://lionhour.com/qr/dining` |
| Ferris | `https://lionhour.com/qr/ferris` |
| Hewitt | `https://lionhour.com/qr/hewitt` |

Each successful request increments an all-time hash and an Eastern-date daily hash in Upstash Redis, then returns an uncached `302` redirect to the LionHour home page. The daily hashes expire after 400 days; all-time totals do not expire. If Redis is temporarily unavailable, the visitor is still redirected and the failed scan is logged rather than counted.

Counts are aggregate route visits. Repeated scans, browser reloads, link previews, and automated requests that reach the route may each increment a total. No IP address or visitor identifier is stored by the QR tracker.

## Deployment

The tracker uses the same Upstash Redis environment variables as LionHour's existing Dining voting feature. Add a strong `QR_STATS_SECRET` to the Vercel project for Production, and optionally Preview, before deploying.

After deployment, verify each printed destination returns a `302` whose `Location` is `/` and whose `Cache-Control` is `no-store`.

## Viewing results

Request the private report with the secret in the Authorization header:

```sh
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $QR_STATS_SECRET" \
  https://lionhour.com/api/qr-stats
```

The response lists all five posters in descending all-time order and includes both all-time and current-day totals:

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
