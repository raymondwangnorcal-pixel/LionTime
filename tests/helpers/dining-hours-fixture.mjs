import { readFileSync } from 'node:fs';

import {
  parseFallArticle,
  parseLaborDayArticle,
  parseNsopArticle,
} from '../../lib/dining-article-parser.js';
import { parseCafeEastPage } from '../../lib/cafe-east-parser.js';
import {
  combineBarnardDiningWeeks,
  parseBarnardRenderedWeek,
} from '../../lib/barnard-dining-hours-parser.js';
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

export function makeValidDiningSnapshotV2() {
  const snapshot = makeValidDiningSnapshot();
  snapshot.schemaVersion = 2;
  snapshot.sources = [
    ['locations-feed', 'https://dining.columbia.edu/content/locations-hours'],
    ['nsop-2026', 'https://dining.columbia.edu/news/new-student-orientation-program-nsop-2026-dining-service'],
    ['labor-day-2026', 'https://dining.columbia.edu/news/labor-day-2026-operating-hours'],
    ['fall-2026', 'https://dining.columbia.edu/news/fall-2026-operating-hours'],
  ].map(([id, url]) => ({ id, url, fetchedAt: snapshot.generated }));
  for (const location of snapshot.locations) {
    for (const day of location.days) day.sourceId = 'locations-feed';
  }
  snapshot.specialServices = [{
    id: 'nsop-2026',
    name: 'NSOP Dining Service',
    audience: 'Incoming First-Year, Transfer, Combined Plan, and Exchange students, plus students supporting NSOP programming',
    sourceId: 'nsop-2026',
    countsAsOpen: false,
    days: [{
      date: '2026-08-30',
      status: 'Restricted NSOP service',
      sessions: [
        { label: 'Coffee Bar', open: '08:00', close: '17:00' },
        { label: 'Lunch Service', open: '10:00', close: '13:00' },
        { label: 'Dinner Service', open: '15:45', close: '17:30' },
      ],
    }],
  }];
  return snapshot;
}

export function makeValidDiningSnapshotV3() {
  const snapshot = makeValidDiningSnapshotV2();
  snapshot.schemaVersion = 3;
  snapshot.sources.push({
    id: 'cafe-east',
    url: 'https://lernerhall.columbia.edu/content/cafe-east',
    fetchedAt: snapshot.generated,
  });
  snapshot.locations.push({
    id: 'cafe-east',
    sourceId: 'cafe-east',
    name: 'Café East',
    category: 'cafe',
    days: Array.from({ length: 14 }, (_unused, index) => {
      const date = addDays(snapshot.windowStart, index);
      const day = new Date(`${date}T12:00:00Z`).getUTCDay();
      return {
        date,
        intervals: day === 0 || day === 6 ? [['11:00', '19:30']] : [['10:30', '19:30']],
        status: null,
        sourceId: 'cafe-east',
      };
    }),
  });
  return snapshot;
}

export function makeValidDiningSnapshotV4({ barnardFetchedAt = '2026-08-21T12:00:00.000Z' } = {}) {
  const snapshot = makeValidDiningSnapshotV3();
  snapshot.schemaVersion = 4;
  snapshot.sources.push({
    id: 'barnard-hours',
    url: 'https://dineoncampus.com/barnard/hours-of-operation',
    fetchedAt: barnardFetchedAt,
  });
  const barnard = [
    ['hewitt', 'Hewitt Dining', 'dining'],
    ['diana-center-cafe', 'Diana Center Cafe', 'dining'],
    ['barnard-bubble-tea-sushi', 'Bubble Tea & Sushi', 'dining'],
    ['lizs-place', "Liz's Place", 'cafe'],
  ];
  for (const [id, name, category] of barnard) {
    snapshot.locations.push({
      id,
      sourceId: 'barnard-hours',
      name,
      category,
      days: Array.from({ length: 14 }, (_unused, index) => ({
        date: addDays(snapshot.windowStart, index),
        intervals: index % 7 < 5 ? [['08:00', '14:00']] : [],
        status: index % 7 < 5 ? null : 'Closed',
        sourceId: 'barnard-hours',
      })),
    });
  }
  return snapshot;
}

export function makeValidBarnardDiningSnapshot({
  generated = '2026-08-21T12:00:00.000Z',
} = {}) {
  const batch = makeValidDiningAttemptBatch({ generated, schemaVersion: 3 });
  const source = batch.attempts.find(({ sourceId }) => sourceId === 'barnard-hours');
  return {
    schemaVersion: 1,
    generated,
    source: source.sourceUrl,
    windowStart: source.payload.windowStart,
    windowEnd: source.payload.windowEnd,
    venues: structuredClone(source.payload.venues),
  };
}

export function makeValidDiningAttemptBatch({
  generated = '2026-08-21T12:00:00.000Z',
  failures = [],
  schemaVersion = 2,
} = {}) {
  const base = makeValidDiningSnapshot();
  base.generated = generated;
  const generatedDate = new Date(generated);
  const easternParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(generatedDate);
  const part = type => easternParts.find(item => item.type === type)?.value;
  base.windowStart = `${part('year')}-${part('month')}-${part('day')}`;
  base.windowEnd = addDays(base.windowStart, 13);
  for (const location of base.locations) {
    location.days = Array.from({ length: 14 }, (_unused, index) => ({
      date: addDays(base.windowStart, index),
      intervals: index % 7 < 5 ? [['08:00', '20:00']] : [],
      status: index % 7 < 5 ? 'Summer Hours' : 'Closed for Summer',
    }));
  }

  const fixture = name => readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');
  const sources = [
    ['locations-feed', 'https://dining.columbia.edu/content/locations-hours', base],
    ['nsop-2026', 'https://dining.columbia.edu/news/new-student-orientation-program-nsop-2026-dining-service',
      parseNsopArticle(fixture('dining-nsop-2026.html'))],
    ['labor-day-2026', 'https://dining.columbia.edu/news/labor-day-2026-operating-hours',
      parseLaborDayArticle(fixture('dining-labor-day-2026.html'))],
    ['fall-2026', 'https://dining.columbia.edu/news/fall-2026-operating-hours',
      parseFallArticle(fixture('dining-fall-2026.html'))],
    ['cafe-east', 'https://lernerhall.columbia.edu/content/cafe-east',
      parseCafeEastPage(fixture('cafe-east-live.txt'))],
  ];
  if (schemaVersion === 3) {
    const barnardWeeks = ['2026-08-23', '2026-08-30', '2026-09-06']
      .map(date => parseBarnardRenderedWeek(fixture(`barnard-dining-hours-week-${date}.html`)));
    sources.push([
      'barnard-hours',
      'https://dineoncampus.com/barnard/hours-of-operation',
      combineBarnardDiningWeeks(barnardWeeks),
    ]);
  }
  return {
    schemaVersion,
    generated,
    windowStart: base.windowStart,
    windowEnd: base.windowEnd,
    attempts: sources.map(([sourceId, sourceUrl, payload]) => failures.includes(sourceId)
      ? {
          sourceId, sourceUrl, attemptedAt: generated, result: 'failure',
          failureCode: 'challenge', payload: null,
        }
      : {
          sourceId, sourceUrl, attemptedAt: generated, result: 'success',
          failureCode: null, payload,
        }),
  };
}
