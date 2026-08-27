import { createQrTrackerService } from '../lib/qr-tracker-service.js';
import { createQrTrackerStore } from '../lib/qr-tracker-store.js';

export default async function handler(req, res) {
  const service = createQrTrackerService({
    store: createQrTrackerStore(),
    statsSecret: process.env.QR_STATS_SECRET,
  });
  const result = await service.handleStats({
    method: req.method,
    authorization: req.headers.authorization,
  });

  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  return res.status(result.status).json(result.body);
}
