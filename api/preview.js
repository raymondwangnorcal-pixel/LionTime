import { createPreviewService } from '../lib/preview-service.js';
import { createLibraryHoursStore } from '../lib/library-hours-store.js';

function store() {
  // Redis.fromEnv() throws when the env is absent (local preview, a missing
  // secret). The preview is a marketing surface: fall back to the baseline
  // rather than 500.
  try {
    return createLibraryHoursStore();
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  const service = createPreviewService({ libraryStore: store() });
  const result = await service.handle({ method: req.method });
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.status === 204) return res.status(204).end();
  return res.status(result.status).json(result.body);
}
