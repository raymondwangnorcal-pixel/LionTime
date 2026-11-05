import { DINING_ARTICLE_SOURCES, FALL_BREAK_SOURCE, THANKSGIVING_SOURCE } from './dining-article-parser.js';

export const LOCATIONS_SOURCE = Object.freeze({
  id: 'locations-feed',
  url: 'https://dining.columbia.edu/content/locations-hours',
});

export const CAFE_EAST_SOURCE = Object.freeze({
  id: 'cafe-east',
  url: 'https://lernerhall.columbia.edu/content/cafe-east',
});

export const BARNARD_HOURS_SOURCE = Object.freeze({
  id: 'barnard-hours',
  url: 'https://dineoncampus.com/barnard/hours-of-operation',
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

function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function resolveCafeEast(baseSnapshot, cafeEast, { withPreviousDay = false } = {}) {
  const previousDate = addDays(baseSnapshot.windowStart, -1);
  const previous = withPreviousDay ? {
    previousDay: {
      date: previousDate,
      intervals: cloneIntervals(cafeEast.weekdays[String(dayOfWeek(previousDate))]),
      status: null,
      sourceId: CAFE_EAST_SOURCE.id,
    },
  } : {};
  return {
    ...previous,
    id: 'cafe-east',
    sourceId: CAFE_EAST_SOURCE.id,
    name: cafeEast.name,
    category: 'cafe',
    days: Array.from({ length: 14 }, (_unused, index) => {
      const date = addDays(baseSnapshot.windowStart, index);
      return {
        date,
        intervals: cloneIntervals(cafeEast.weekdays[String(dayOfWeek(date))]),
        status: null,
        sourceId: CAFE_EAST_SOURCE.id,
      };
    }),
  };
}

function resolveBarnardLocations(baseSnapshot, barnardHours, { withPreviousDay = false } = {}) {
  const previousDate = addDays(baseSnapshot.windowStart, -1);
  return barnardHours.venues.map((venue) => {
    const byDate = new Map(venue.days.map(day => [day.date, day]));
    const prior = byDate.get(previousDate);
    const previous = withPreviousDay ? {
      previousDay: prior
        ? { date: previousDate, intervals: cloneIntervals(prior.intervals), status: prior.status, sourceId: BARNARD_HOURS_SOURCE.id }
        : { date: previousDate, intervals: [], status: UNPUBLISHED, sourceId: 'unpublished' },
    } : {};
    return {
      ...previous,
      id: venue.id,
      sourceId: BARNARD_HOURS_SOURCE.id,
      name: venue.name,
      category: venue.category,
      days: Array.from({ length: 14 }, (_unused, index) => {
        const date = addDays(baseSnapshot.windowStart, index);
        const sourceDay = byDate.get(date);
        return sourceDay ? {
          date,
          intervals: cloneIntervals(sourceDay.intervals),
          status: sourceDay.status,
          sourceId: BARNARD_HOURS_SOURCE.id,
        } : {
          date,
          intervals: [],
          status: UNPUBLISHED,
          sourceId: 'unpublished',
        };
      }),
    };
  });
}

export function resolveDiningSnapshot({
  baseSnapshot, nsop, labor, fall, cafeEast, barnardHours = null, fallBreak = null, thanksgiving = null,
  sourceFetchedAt = null,
}) {
  if ((fallBreak || thanksgiving) && !barnardHours) throw new Error('Break evidence requires the v4 Barnard sources');
  // Schema v6 lists both break sources with their fetch times, so Thanksgiving can only
  // be applied once Fall Break has succeeded at least once (it has, since 2026-10-13).
  if (thanksgiving && !fallBreak) thanksgiving = null;
  const laborByDate = new Map(labor.days.map((day) => [day.date, day.venues]));
  // Dated-exception articles, in schema order. Their date ranges do not overlap, so
  // the first article that speaks for a venue on a date decides it.
  const breaks = [
    fallBreak && { source: FALL_BREAK_SOURCE, label: 'Fall Break 2026 hours', byDate: new Map(fallBreak.days.map((day) => [day.date, day.venues])) },
    thanksgiving && { source: THANKSGIVING_SOURCE, label: 'Thanksgiving 2026 hours', byDate: new Map(thanksgiving.days.map((day) => [day.date, day.venues])) },
  ].filter(Boolean);
  const breakDay = (location, date) => {
    for (const article of breaks) {
      const breakVenues = article.byDate.get(date);
      if (!breakVenues || !Object.hasOwn(breakVenues, location.id)) continue;
      const intervals = cloneIntervals(breakVenues[location.id]);
      return {
        date,
        intervals,
        status: intervals.length ? article.label : 'Closed',
        sourceId: article.source.id,
      };
    }
    return null;
  };
  const regularDay = (location, day) => {
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
      const intervals = cloneIntervals(fallHours[String(dayOfWeek(day.date))]);
      return {
        date: day.date,
        intervals,
        // The article gives a weekly schedule, so a day it leaves out is a closed day.
        // Labelling that day "Fall 2026 hours" told the reader where the answer came from
        // and never what it was (Lenfest and Blue Java Mudd read that way all weekend).
        status: intervals.length ? 'Fall 2026 hours' : 'Closed',
        sourceId: DINING_ARTICLE_SOURCES.fall.id,
      };
    }
    return { ...day, intervals: [], sourceId: 'unpublished' };
  };
  const previousDate = addDays(baseSnapshot.windowStart, -1);
  const locations = baseSnapshot.locations.map((location) => {
    // Fall Break is a dated exception: it outranks the feed's regular weekly periods,
    // which do not mention the break. A covered venue the article leaves out is closed.
    const { previousDay: _feedPreviousDay, ...feedLocation } = location;
    const resolved = {
      ...feedLocation,
      days: location.days.map((day) => breakDay(location, day.date) || regularDay(location, day)),
    };
    if (breaks.length) {
      // v5 states the day before the window outright. Browsers read "yesterday" for
      // overnight venues (JJ's, Chef Mike's), and the weekday slot they would otherwise
      // reuse is six days ahead: next week's hours, or a break day, not yesterday's.
      // Outside the break, the same weekday's regular evidence stands in for it.
      resolved.previousDay = breakDay(location, previousDate)
        || (location.previousDay
          ? regularDay(location, location.previousDay)
          // Payloads from before the feed carried previousDay: the same weekday's
          // evidence a week on is the closest stand-in.
          : { ...regularDay(location, location.days[6]), date: previousDate });
    }
    return resolved;
  });

  const nsopDays = nsop.days.filter((day) => inWindow(day.date, baseSnapshot.windowStart, baseSnapshot.windowEnd));
  const specialServices = nsopDays.length ? [{
    id: nsop.id,
    name: nsop.name,
    audience: nsop.audience,
    sourceId: DINING_ARTICLE_SOURCES.nsop.id,
    countsAsOpen: false,
    days: structuredClone(nsopDays),
  }] : [];

  const withPreviousDay = breaks.length > 0;
  locations.push(resolveCafeEast(baseSnapshot, cafeEast, { withPreviousDay }));
  if (barnardHours) locations.push(...resolveBarnardLocations(baseSnapshot, barnardHours, { withPreviousDay }));

  const sourceDefinitions = [LOCATIONS_SOURCE, ...Object.values(DINING_ARTICLE_SOURCES), CAFE_EAST_SOURCE];
  if (barnardHours) sourceDefinitions.push(BARNARD_HOURS_SOURCE);
  if (fallBreak) sourceDefinitions.push(FALL_BREAK_SOURCE);
  if (thanksgiving) sourceDefinitions.push(THANKSGIVING_SOURCE);
  return {
    ...baseSnapshot,
    schemaVersion: thanksgiving ? 6 : fallBreak ? 5 : barnardHours ? 4 : 3,
    sources: sourceDefinitions.map((source) => ({
      id: source.id,
      url: source.url,
      fetchedAt: barnardHours ? sourceFetchedAt?.[source.id] : baseSnapshot.generated,
    })),
    locations,
    specialServices,
  };
}
