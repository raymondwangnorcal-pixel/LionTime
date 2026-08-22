import * as cheerio from 'cheerio';

const TARGET_PATTERNS = Object.freeze([
  [/dodge fitness/i, 'dodge'],
  [/uris pool/i, 'uris-pool'],
  [/blue gym/i, 'blue-gym'],
  [/levien gym/i, 'levien-gymnasium'],
  [/functional fitness studio/i, 'functional-fitness-studio'],
  [/aerobics room 4/i, 'aerobics-room-4'],
  [/squash courts?/i, 'squash-courts'],
  [/fitness center|physical well-being/i, 'barnard-fitness'],
]);

const WEEKDAY_NUMBERS = Object.freeze({
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
});
const WEEKDAYS = Object.keys(WEEKDAY_NUMBERS);
const MONTH_NUMBERS = Object.freeze({
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
});

export function parseColumbiaHours(html) {
  const $ = cheerio.load(html);
  const seasonalHeading = $('h2').filter((_, element) => /facility hours/i.test($(element).text())).first();
  if (!seasonalHeading.length) return [];

  const schedule = seasonalHeading.closest('.paragraph--type--cu-page-slice, section, .paragraph, div');
  const effectiveRange = seasonalDateRange($, seasonalHeading, schedule);
  if (!effectiveRange) return [];
  const evidence = [];

  schedule.find('h2, h3, h4').each((_, heading) => {
    const targetId = targetIdForColumbiaScheduleHeading($(heading).text());
    const section = $(heading).closest('.paragraph--type--table, .paragraph--type--cu-tabbed-content-tab, section, .paragraph');
    const weeklyIntervals = weeklyIntervalsFromTable($, section);
    if (!targetId || !hasIntervals(weeklyIntervals)) return;
    evidence.push(createEvidence({
      targetId,
      sourceId: 'columbiaHours',
      priority: 3,
      effectiveRange,
      weeklyIntervals,
      availabilityType: availabilityTypeFor(section.text(), targetId),
    }));
  });

  return evidence;
}

export function parseColumbiaModifications(html) {
  const $ = cheerio.load(html);
  const article = $('article').filter((_, element) => /modified hours\s*&\s*closures/i.test($(element).find('h1').first().text())).first();
  if (!article.length) return [];
  const evidence = [];

  article.find('h2').each((_, dateHeading) => {
    const effectiveDate = parseSingleDate($(dateHeading).text());
    if (!effectiveDate) return;

    const notices = $(dateHeading).nextUntil('h2').filter('h3').add($(dateHeading).nextUntil('h2').find('h3'));
    notices.each((_, noticeHeading) => {
      const targetId = targetIdFor($(noticeHeading).text());
      const paragraphs = $(noticeHeading).nextUntil('h2, h3').filter('p').add($(noticeHeading).nextUntil('h2, h3').find('p'))
        .map((_, paragraph) => boundedText($(paragraph).text())).get().filter(Boolean);
      const status = statusForModification(paragraphs);
      if (!targetId || !status) return;

      const interval = paragraphs.map(timeRangeWithinText).find(Boolean);
      evidence.push(createEvidence({
        targetId,
        sourceId: 'columbiaModifications',
        priority: 1,
        effectiveRange: { start: effectiveDate, end: effectiveDate },
        dateIntervals: interval ? [interval] : [],
        status,
        reason: paragraphs.find(paragraph => paragraph !== status && !timeRangeWithinText(paragraph)) || null,
        availabilityType: availabilityTypeFor(paragraphs.join(' '), targetId),
      }));
    });
  });

  return evidence;
}

export function parseBarnardHours(html) {
  const $ = cheerio.load(html);
  const section = $('section[aria-label*="Barnard Fitness Center"]').first();
  if (!section.length) return [];

  const weeklyIntervals = {};
  section.find('strong').each((_, element) => {
    const days = weekdayNumbers($(element).text());
    const timeText = boundedText($(element).get(0).next?.data?.replace(/^\s*:\s*/, ''));
    const interval = parseTimeRange(timeText);
    if (!days || !interval) return;
    for (const day of days) weeklyIntervals[day] = [...(weeklyIntervals[day] || []), interval];
  });
  if (!hasIntervals(weeklyIntervals)) return [];

  return [createEvidence({
    targetId: 'barnard-fitness',
    sourceId: 'barnardFitness',
    priority: 3,
    weeklyIntervals,
    availabilityType: 'facility-hours',
    accessRestrictions: barnardAccessRestrictions(section.text()),
  })];
}

function createEvidence({
  targetId,
  sourceId,
  priority,
  effectiveRange = {},
  weeklyIntervals = null,
  dateIntervals = null,
  status = null,
  reason = null,
  availabilityType,
  accessRestrictions = [],
}) {
  return {
    targetId,
    sourceId,
    priority,
    effectiveStart: effectiveRange.start || null,
    effectiveEnd: effectiveRange.end || null,
    weeklyIntervals,
    dateIntervals,
    status,
    reason,
    availabilityType,
    accessRestrictions,
    sourceUpdatedAt: null,
  };
}

function weeklyIntervalsFromTable($, section) {
  const weeklyIntervals = {};
  let previousDays = null;
  section.find('table tr').each((_, row) => {
    const cells = [];
    $(row).find('th, td').each((_, cell) => cells.push($(cell).text()));
    const dayCell = cells[0] || '';
    const days = isBlankCell(dayCell) ? previousDays : weekdayNumbers(dayCell);
    const interval = parseTimeRange(cells[1]);
    if (!days || !interval) {
      if (!isBlankCell(dayCell)) previousDays = null;
      return;
    }
    previousDays = days;
    for (const day of days) weeklyIntervals[day] = [...(weeklyIntervals[day] || []), interval];
  });
  return weeklyIntervals;
}

function targetIdFor(heading) {
  const text = boundedText(heading);
  return TARGET_PATTERNS.find(([pattern]) => pattern.test(text || ''))?.[1] || null;
}

function targetIdForColumbiaScheduleHeading(heading) {
  const boundedHeading = boundedText(heading);
  if (/^(?:summer|fall|spring|winter)\s+(?:session\s+)?building hours$/i.test(boundedHeading || '')) {
    return 'dodge';
  }
  return targetIdFor(boundedHeading);
}

function seasonalDateRange($, seasonalHeading, schedule) {
  const labels = [
    ...seasonalHeading.nextAll('p').map((_, element) => $(element).text()).get(),
    ...schedule.find('p').map((_, element) => $(element).text()).get(),
  ];
  return labels.map(parseDateRange).find(Boolean) || null;
}

function boundedText(value, limit = 200) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > limit || /[<>\u0000-\u001f]/.test(text)) return null;
  return text;
}

function maintenanceStatus(text) {
  return /maintenance|construction|repair/i.test(text || '') ? 'Closed for maintenance' : null;
}

function statusForModification(paragraphs) {
  const text = paragraphs.join(' ');
  if (maintenanceStatus(text)) return 'Closed for maintenance';
  if (/closed for athletics event/i.test(text)) return 'Closed for Athletics event';
  if (/reservation required/i.test(text)) return 'Reservation required';
  return null;
}

function availabilityTypeFor(text, targetId) {
  if (/reservation required/i.test(text || '')) return 'reservation-required';
  if (/lap swim/i.test(text || '') || targetId === 'uris-pool') return 'lap-swim';
  if (/open recreation/i.test(text || '') || targetId.endsWith('gymnasium') || targetId === 'blue-gym') return 'open-recreation';
  return 'facility-hours';
}

function barnardAccessRestrictions(text) {
  const restrictions = [];
  if (/open to\s+Barnard students,?\s+faculty,?\s+and\s+staff/i.test(text || '')) {
    restrictions.push('Barnard students, faculty, and staff');
  }
  if (/barnard id required/i.test(text || '')) restrictions.push('Barnard ID required');
  return restrictions;
}

function isBlankCell(value) {
  return String(value || '').replace(/\u00a0/g, ' ').trim() === '';
}

function weekdayNumbers(value) {
  const text = boundedText(value)?.toLowerCase().replace(/&/g, 'and');
  if (!text) return null;
  const matches = [...text.matchAll(new RegExp(`\\b(${WEEKDAYS.join('|')})\\b`, 'g'))].map(match => match[1]);
  if (!matches.length) return null;
  if (matches.length === 1) return [WEEKDAY_NUMBERS[matches[0]]];
  if (/[-–]|through/.test(text)) {
    const start = WEEKDAYS.indexOf(matches[0]);
    const end = WEEKDAYS.indexOf(matches[1]);
    if (start > end) return null;
    return WEEKDAYS.slice(start, end + 1).map(day => WEEKDAY_NUMBERS[day]);
  }
  return [...new Set(matches.map(day => WEEKDAY_NUMBERS[day]))];
}

function parseTimeRange(value) {
  const text = boundedText(value);
  const match = text?.match(/^(1[0-2]|[1-9])(?::([0-5]\d))?\s*(?:a\.?m\.?|p\.?m\.?)\s*[-–]\s*(1[0-2]|[1-9])(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)$/i);
  if (!match) return null;

  const startMeridiem = text.match(/^(?:1[0-2]|[1-9])(?::[0-5]\d)?\s*(a\.?m\.?|p\.?m\.?)/i)?.[1];
  const interval = [to24Hour(match[1], match[2], startMeridiem), to24Hour(match[3], match[4], match[5])];
  return interval[0] < interval[1] ? interval : null;
}

function timeRangeWithinText(value) {
  const text = boundedText(value);
  const exact = parseTimeRange(text);
  if (exact) return exact;
  const match = text?.match(/(1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\s*[-–]\s*(1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)/i);
  return match ? parseTimeRange(match[0]) : null;
}

function to24Hour(hour, minute, meridiem) {
  const normalizedMeridiem = meridiem.replace(/\./g, '').toLowerCase();
  let numericHour = Number(hour);
  if (normalizedMeridiem === 'am' && numericHour === 12) numericHour = 0;
  if (normalizedMeridiem === 'pm' && numericHour !== 12) numericHour += 12;
  return `${String(numericHour).padStart(2, '0')}:${minute || '00'}`;
}

function parseDateRange(value) {
  const text = boundedText(value, 500);
  const match = text?.match(/effective\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})\s+(?:through|to|-)\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})/i);
  if (!match) return null;
  const start = parseSingleDate(match[1]);
  const end = parseSingleDate(match[2]);
  return start && end && start <= end ? { start, end } : null;
}

function parseSingleDate(value) {
  const text = boundedText(value);
  const match = text?.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return null;
  const month = monthNumber(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  if (!month || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(date.getTime())
    || date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) return null;
  return date.toISOString().slice(0, 10);
}

function monthNumber(month) {
  return MONTH_NUMBERS[month.toLowerCase()] || null;
}

function hasIntervals(intervals) {
  return Object.values(intervals).some(dayIntervals => dayIntervals.length > 0);
}
