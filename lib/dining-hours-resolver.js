import { DINING_ARTICLE_SOURCES } from './dining-article-parser.js';

export const LOCATIONS_SOURCE = Object.freeze({
  id: 'locations-feed',
  url: 'https://dining.columbia.edu/content/locations-hours',
});

const UNPUBLISHED = 'Hours not published';

function dayOfWeek(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function inWindow(date, start, end) {
  return start <= date && date <= end;
}

function cloneIntervals(intervals) {
  return intervals.map(([open, close]) => [open, close]);
}

export function resolveDiningSnapshot({ baseSnapshot, nsop, labor, fall }) {
  const laborByDate = new Map(labor.days.map((day) => [day.date, day.venues]));
  const locations = baseSnapshot.locations.map((location) => ({
    ...location,
    days: location.days.map((day) => {
      const laborVenues = laborByDate.get(day.date);
      if (laborVenues?.[location.id]) {
        return {
          date: day.date,
          intervals: cloneIntervals(laborVenues[location.id]),
          status: 'Labor Day 2026 hours',
          sourceId: DINING_ARTICLE_SOURCES.labor.id,
        };
      }
      if (day.status !== UNPUBLISHED) {
        return { ...day, intervals: cloneIntervals(day.intervals), sourceId: LOCATIONS_SOURCE.id };
      }
      const fallHours = fall.venues[location.id];
      if (fallHours && inWindow(day.date, fall.start, fall.end)) {
        return {
          date: day.date,
          intervals: cloneIntervals(fallHours[String(dayOfWeek(day.date))]),
          status: 'Fall 2026 hours',
          sourceId: DINING_ARTICLE_SOURCES.fall.id,
        };
      }
      return { ...day, intervals: [], sourceId: 'unpublished' };
    }),
  }));

  const nsopDays = nsop.days.filter((day) => inWindow(day.date, baseSnapshot.windowStart, baseSnapshot.windowEnd));
  const specialServices = nsopDays.length ? [{
    id: nsop.id,
    name: nsop.name,
    audience: nsop.audience,
    sourceId: DINING_ARTICLE_SOURCES.nsop.id,
    countsAsOpen: false,
    days: structuredClone(nsopDays),
  }] : [];

  const sourceDefinitions = [LOCATIONS_SOURCE, ...Object.values(DINING_ARTICLE_SOURCES)];
  return {
    ...baseSnapshot,
    schemaVersion: 2,
    sources: sourceDefinitions.map((source) => ({
      id: source.id,
      url: source.url,
      fetchedAt: baseSnapshot.generated,
    })),
    locations,
    specialServices,
  };
}
