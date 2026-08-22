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

export function parseColumbiaHours(html) {
  const $ = cheerio.load(html);
  const seasonalHeading = $('h2').filter((_, element) => /facility hours/i.test($(element).text())).first();
  if (!seasonalHeading.length) return [];

  const schedule = seasonalHeading.closest('section, .paragraph, div');
  const effectiveRange = parseDateRange(schedule.text());
  const evidence = [];

  schedule.find('h2, h3, h4').each((_, heading) => {
    const targetId = targetIdFor($(heading).text());
    const section = $(heading).closest('section, .paragraph');
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
  const evidence = [];

  $('section.date-specific-notices').each((_, sectionElement) => {
    const section = $(sectionElement);
    const effectiveDate = parseSingleDate(section.children('h2').first().text());
    if (!effectiveDate) return;

    section.children('section.notice').each((_, noticeElement) => {
      const notice = $(noticeElement);
      const targetId = targetIdFor(notice.children('h2, h3, h4').first().text());
      const paragraphs = notice.children('p').map((_, paragraph) => boundedText($(paragraph).text())).get().filter(Boolean);
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
    accessRestrictions: /barnard id required/i.test(section.text()) ? ['Barnard ID required'] : [],
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
    $(row).find('th, td').each((_, cell) => cells.push(boundedText($(cell).text())));
    const days = weekdayNumbers(cells[0]) || previousDays;
    const interval = parseTimeRange(cells[1]);
    if (!days || !interval) return;
    previousDays = days;
    for (const day of days) weeklyIntervals[day] = [...(weeklyIntervals[day] || []), interval];
  });
  return weeklyIntervals;
}

function targetIdFor(heading) {
  const text = boundedText(heading);
  return TARGET_PATTERNS.find(([pattern]) => pattern.test(text || ''))?.[1] || null;
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
  return [to24Hour(match[1], match[2], startMeridiem), to24Hour(match[3], match[4], match[5])];
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
  return match ? { start: parseSingleDate(match[1]), end: parseSingleDate(match[2]) } : {};
}

function parseSingleDate(value) {
  const text = boundedText(value);
  const match = text?.match(/^([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!match) return null;
  const date = new Date(`${match[1]} ${match[2]}, ${match[3]} UTC`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function hasIntervals(intervals) {
  return Object.values(intervals).some(dayIntervals => dayIntervals.length > 0);
}
