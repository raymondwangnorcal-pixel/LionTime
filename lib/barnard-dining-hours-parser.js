import * as cheerio from 'cheerio';

export const BARNARD_DINING_VENUES = Object.freeze({
  'Hewitt Dining': Object.freeze({ id: 'hewitt', name: 'Hewitt Dining', category: 'dining' }),
  'Diana Center Cafe': Object.freeze({
    id: 'diana-center-cafe', name: 'Diana Center Cafe', category: 'dining',
  }),
  'Barnard Dining Bubble Tea and Sushi Spot': Object.freeze({
    id: 'barnard-bubble-tea-sushi', name: 'Bubble Tea & Sushi', category: 'dining',
  }),
  "Liz's Place": Object.freeze({ id: 'lizs-place', name: "Liz's Place", category: 'cafe' }),
});

const MONTHS = Object.freeze({
  jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3,
  may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7,
  sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10,
  dec: 11, december: 11,
});
const DATE_CAPTION = /(?:week\s+of\s+)?(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:st|nd|rd|th)?,\s*(\d{4})/i;
const CELL_DATE = /^\d{1,2}\/\d{1,2}$/;
const TIME_RANGE = /^\s*(\d{1,2}(?::\d{2})?\s*(?:a|am|p|pm)|\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*(?:a|am|p|pm)|\d{1,2}:\d{2})\s*$/i;

function normalizeText(value) {
  return String(value ?? '').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim();
}

function addDays(date, count) {
  const value = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(value.getTime())) throw new Error(`invalid Barnard date: ${date}`);
  value.setUTCDate(value.getUTCDate() + count);
  return value.toISOString().slice(0, 10);
}

function minutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function parseClock(value) {
  const text = normalizeText(value).toLowerCase();
  const twelveHour = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(a|am|p|pm)$/);
  if (twelveHour) {
    const hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] || 0);
    if (hour < 1 || hour > 12 || minute > 59) throw new Error(`invalid Barnard time: ${value}`);
    const normalizedHour = (hour % 12) + (twelveHour[3].startsWith('p') ? 12 : 0);
    return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  }
  const twentyFourHour = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!twentyFourHour) throw new Error(`invalid Barnard time: ${value}`);
  const hour = Number(twentyFourHour[1]);
  const minute = Number(twentyFourHour[2]);
  if (hour > 23 || minute > 59) throw new Error(`invalid Barnard time: ${value}`);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function parseBarnardTimeRange(value) {
  const match = normalizeText(value).match(TIME_RANGE);
  if (!match) throw new Error(`invalid Barnard time range: ${value}`);
  const interval = [parseClock(match[1]), parseClock(match[2])];
  if (interval[0] === interval[1]) throw new Error(`zero-length Barnard time range: ${value}`);
  return interval;
}

function normalizeIntervals(values) {
  const intervals = values.map(parseBarnardTimeRange)
    .sort((left, right) => minutes(left[0]) - minutes(right[0]));
  let priorEnd = -1;
  for (const [open, close] of intervals) {
    const start = minutes(open);
    let end = minutes(close);
    if (end <= start) end += 1440;
    if (start < priorEnd) throw new Error('Barnard intervals overlap');
    priorEnd = end;
  }
  return intervals;
}

function parseCaption(value) {
  const match = normalizeText(value).match(DATE_CAPTION);
  if (!match) throw new Error(`invalid Barnard week caption: ${value}`);
  const month = MONTHS[match[1].toLowerCase()];
  const day = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month, day, 12));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month || date.getUTCDate() !== day
    || date.getUTCDay() !== 0) throw new Error(`Barnard week must start Sunday: ${value}`);
  return date.toISOString().slice(0, 10);
}

function evidenceFromAria(value) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/:\s*closed$/i.test(text)) return { intervals: [], status: 'Closed' };
  const hours = text.match(/\b(?:hours|hrs)\s*:\s*(.+)$/i);
  if (!hours) return null;
  const ranges = hours[1].split(/\s*,\s*/).filter(Boolean);
  if (!ranges.length) return null;
  return { intervals: normalizeIntervals(ranges), status: null };
}

function evidenceFromVisible($, cell) {
  const desktop = $(cell).find('div[class~="hidden"][class~="md:block"]').first();
  if (!desktop.length) return null;
  const text = normalizeText(desktop.text());
  if (/^closed$/i.test(text)) return { intervals: [], status: 'Closed' };
  const ranges = desktop.find('span[class~="block"]').map((_index, span) => normalizeText($(span).text()))
    .get().filter(value => TIME_RANGE.test(value));
  return ranges.length ? { intervals: normalizeIntervals(ranges), status: null } : null;
}

function sameEvidence(left, right) {
  return left.status === right.status && JSON.stringify(left.intervals) === JSON.stringify(right.intervals);
}

function parseCell($, cell, expectedDate) {
  const dateLabels = $(cell).find('span').map((_index, span) => normalizeText($(span).text()))
    .get().filter(value => CELL_DATE.test(value));
  if (dateLabels.length !== 1) throw new Error(`Barnard day ${expectedDate} must expose one M/D label`);
  const expected = `${Number(expectedDate.slice(5, 7))}/${Number(expectedDate.slice(8, 10))}`;
  if (dateLabels[0] !== expected) throw new Error(`Barnard day label ${dateLabels[0]} does not match ${expectedDate}`);

  const visible = evidenceFromVisible($, cell);
  const aria = evidenceFromAria($(cell).find('[aria-label]').first().attr('aria-label'));
  if (visible && aria && !sameEvidence(visible, aria)) {
    throw new Error(`Barnard visible and accessibility hours disagree for ${expectedDate}`);
  }
  const evidence = visible || aria;
  if (!evidence) throw new Error(`Barnard hours are missing for ${expectedDate}`);
  return { date: expectedDate, intervals: evidence.intervals, status: evidence.status };
}

export function parseBarnardRenderedWeek(html, { expectedWeekStart = null } = {}) {
  if (typeof html !== 'string' || !html.trim()) throw new Error('Barnard rendered HTML is empty');
  const $ = cheerio.load(html);
  const found = new Map();
  $('table.unified-hours-table').each((_tableIndex, table) => {
    const targetRows = $(table).find('tr.hours-row').toArray().filter((row) => {
      const sourceName = normalizeText($(row).find('th[scope="row"]').first().text());
      return Boolean(BARNARD_DINING_VENUES[sourceName]);
    });
    if (!targetRows.length) return;
    const weekStart = parseCaption($(table).find('caption').first().text());
    if (expectedWeekStart && weekStart !== expectedWeekStart) {
      throw new Error(`Barnard week ${weekStart} does not match ${expectedWeekStart}`);
    }
    targetRows.forEach((row) => {
      const sourceName = normalizeText($(row).find('th[scope="row"]').first().text());
      const contract = BARNARD_DINING_VENUES[sourceName];
      if (!contract) return;
      if (found.has(sourceName)) throw new Error(`duplicate Barnard target: ${sourceName}`);
      const cells = $(row).find('td').toArray();
      if (cells.length !== 7) throw new Error(`${sourceName} must contain seven Barnard days`);
      found.set(sourceName, {
        ...contract,
        days: cells.map((cell, index) => parseCell($, cell, addDays(weekStart, index))),
        weekStart,
      });
    });
  });

  const sourceNames = Object.keys(BARNARD_DINING_VENUES);
  for (const sourceName of sourceNames) {
    if (!found.has(sourceName)) throw new Error(`missing Barnard target: ${sourceName}`);
  }
  const weekStarts = new Set([...found.values()].map(venue => venue.weekStart));
  if (weekStarts.size !== 1) throw new Error('Barnard target tables report different weeks');
  const weekStart = [...weekStarts][0];
  return {
    weekStart,
    venues: sourceNames.map(sourceName => {
      const { weekStart: _ignored, ...venue } = found.get(sourceName);
      return venue;
    }),
  };
}

export function combineBarnardDiningWeeks(weeks) {
  if (!Array.isArray(weeks) || ![2, 3].includes(weeks.length)) {
    throw new Error('Barnard hours require two or three complete weeks');
  }
  for (let index = 0; index < weeks.length; index += 1) {
    if (weeks[index]?.weekStart !== addDays(weeks[0]?.weekStart, index * 7)) {
      throw new Error('Barnard weeks must be consecutive');
    }
  }
  const expectedIds = Object.values(BARNARD_DINING_VENUES).map(venue => venue.id);
  const venues = expectedIds.map((id) => {
    const parts = weeks.map((week) => week.venues?.find(venue => venue.id === id));
    if (parts.some(part => !part)) throw new Error(`missing Barnard venue: ${id}`);
    const first = parts[0];
    if (parts.some(part => part.name !== first.name || part.category !== first.category
      || !Array.isArray(part.days) || part.days.length !== 7)) {
      throw new Error(`inconsistent Barnard venue: ${id}`);
    }
    return { id, name: first.name, category: first.category, days: parts.flatMap(part => part.days) };
  });
  return {
    windowStart: weeks[0].weekStart,
    windowEnd: addDays(weeks[0].weekStart, weeks.length * 7 - 1),
    venues,
  };
}
