import { createLibraryHoursService } from '../lib/library-hours-service.js';
import { createLibraryHoursStore } from '../lib/library-hours-store.js';

export default async function handler(req, res) {
  const service = createLibraryHoursService({
    store: createLibraryHoursStore(),
    updateSecret: process.env.LIBRARY_HOURS_UPDATE_SECRET,
  });
  const result = await service.handle({
    method: req.method,
    authorization: req.headers.authorization,
    body: req.body,
  });
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.status === 204) return res.status(204).end();
  return res.status(result.status).json(result.body);
}
