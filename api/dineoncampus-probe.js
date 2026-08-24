const BARNARD_WEEKLY_SCHEDULE_URL =
  'https://apiv4.dineoncampus.com/locations/weekly_schedule'
  + '?site_id=5cb77d6e4198d40babbc28b5&date=2026-08-24&locale=en';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const response = await fetch(BARNARD_WEEKLY_SCHEDULE_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    });
    const text = await response.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return res.status(200).json({
      upstreamStatus: response.status,
      contentType: response.headers.get('content-type'),
      bytes: text.length,
      json: json !== null,
      topLevelKeys: json && typeof json === 'object' && !Array.isArray(json)
        ? Object.keys(json).sort() : [],
    });
  } catch (error) {
    return res.status(502).json({ error: error?.name || 'FetchError' });
  }
}
