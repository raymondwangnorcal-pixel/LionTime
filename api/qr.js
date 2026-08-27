import { createQrTrackerService } from '../lib/qr-tracker-service.js';
import { createQrTrackerStore } from '../lib/qr-tracker-store.js';

export default async function handler(req, res) {
  const service = createQrTrackerService({ store: createQrTrackerStore() });
  const result = await service.handleScan({
    method: req.method,
    poster: req.query.poster,
  });

  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.body === null) return res.status(result.status).end();
  return res.status(result.status).json(result.body);
}
