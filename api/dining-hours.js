import { createDiningHoursService } from '../lib/dining-hours-service.js';
import { createDiningHoursStore } from '../lib/dining-hours-store.js';
import { lernerDaysFromStudentServices } from '../lib/cafe-east-building-hours.js';
import { createStudentServicesHoursStore } from '../lib/student-services-hours-store.js';

export default async function handler(req, res) {
  const service = createDiningHoursService({
    store: createDiningHoursStore(),
    updateSecret: process.env.LIBRARY_HOURS_UPDATE_SECRET,
    // Café East is open only while Lerner Hall is; Lerner's dated hours come from Student Life.
    buildingHours: async () => lernerDaysFromStudentServices(await createStudentServicesHoursStore().getSnapshot()),
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
