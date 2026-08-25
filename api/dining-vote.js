import { createDiningVoteService } from '../lib/dining-vote-service.js';
import { createDiningVoteStore } from '../lib/dining-vote-store.js';

export default async function handler(req, res) {
  const service = createDiningVoteService({
    store: createDiningVoteStore(),
  });
  const result = await service.handle({
    method: req.method,
    query: req.query,
    body: req.body,
  });
  for (const [name, value] of Object.entries(result.headers)) res.setHeader(name, value);
  if (result.status === 204) return res.status(204).end();
  return res.status(result.status).json(result.body);
}
