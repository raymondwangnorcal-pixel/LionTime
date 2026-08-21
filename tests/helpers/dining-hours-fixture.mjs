import { DINING_LOCATION_MAP } from '../../scripts/dining-hours-scraper.mjs';

function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

export function makeValidDiningSnapshot() {
  const windowStart = '2026-08-21';
  const dates = Array.from({ length: 14 }, (_, index) => addDays(windowStart, index));
  return {
    schemaVersion: 1,
    generated: '2026-08-21T12:00:00.000Z',
    source: 'https://dining.columbia.edu/content/locations-hours',
    windowStart,
    windowEnd: dates.at(-1),
    locations: Object.entries(DINING_LOCATION_MAP).map(([sourceId, mapping]) => ({
      id: mapping.id,
      sourceId,
      name: mapping.name,
      category: mapping.category,
      days: dates.map((date, index) => ({
        date,
        intervals: index % 7 < 5 ? [['08:00', '20:00']] : [],
        status: index % 7 < 5 ? 'Summer Hours' : 'Closed for Summer',
      })),
    })),
  };
}
