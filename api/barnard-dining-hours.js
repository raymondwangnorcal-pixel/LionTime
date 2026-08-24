import { createBarnardDiningHoursService } from '../lib/barnard-dining-hours-service.js';
import { createDiningHoursStore } from '../lib/dining-hours-store.js';

export default async function handler(req, res) {
  const service = createBarnardDiningHoursService({ store: createDiningHoursStore() });
  const result = await service.handle({ method: req.method });
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  return res.status(result.status).json(result.body);
}
