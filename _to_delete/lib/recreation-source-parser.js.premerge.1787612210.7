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
const TIME_RANGE_EXPRESSION = String.raw`(1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)\s*[-–]\s*(1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:a\.?m\.?|p\.?m\.?)`;

export function parseColumbiaHours(html, { generated } = {}) {
  const $ = cheerio.load(html);
  const seasonalHeading = $('h2').filter((_, element) => /facility hours/i.test($(element).text())).first();
  if (!seasonalHeading.length) return [];

  const schedule = seasonalHeading.closest('.paragraph--type--cu-page-slice, section, .paragraph, div');
  const effectiveRange = seasonalDateRange($, seasonalHeading, schedule)
    || seasonalTransitionDateRange($, seasonalHeading, generated);
  const seasonalClaims = [
    ...seasonalHeading.nextAll('p').map((_, element) => $(element).text()).get(),
    ...schedule.find('p').map((_, element) => $(element).text()).get(),
  ].join(' ');
  if (!effectiveRange && /\beffective\b/i.test(seasonalClaims)) return [];
  const evidence = [];

  schedule.find('h2, h3, h4').each((_, heading) => {
    const targetId = targetIdForColumbiaScheduleHeading($(heading).text());
    const section = $(heading).closest('.paragraph--type--table, .paragraph--type--cu-tabbed-content-tab, section, .paragraph');
    const weeklyIntervals = weeklyIntervalsFromTable($, section);
    if (!targetId || !hasIntervals(weeklyIntervals)) return;
    if (!effectiveRange) {
      evidence.push(unavailableEvidence({
        targetId,
        sourceId: 'columbiaHours',
        priority: 5,
        unavailableStatus: 'Hours need verification',
        availabilityType: availabilityTypeFor(section.text(), targetId),
      }));
      return;
    }
    evidence.push(createEvidence({
      targetId,
      sourceId: 'columbiaHours',
      priority: 3,
      effectiveRange,
      weeklyIntervals,
      availabilityType: availabilityTypeFor(section.text(), targetId),
    }));
  });

  if (!effectiveRange && seasonalLabel(seasonalHeading.text())) {
    const activitySection = $('h2').filter((_, element) => /open recreation and activity spaces/i.test($(element).text()))
      .first().closest('section, .paragraph');
    activitySection.find('section, .paragraph--type--cu-tabbed-content-tab').each((_, sectionElement) => {
      const sectionElementQuery = $(sectionElement);
      const targetId = targetIdFor(sectionElementQuery.find('h2, h3').first().text());
      if (!targetId || evidence.some(item => item.targetId === targetId)) return;
      const hasCalendar = sectionElementQuery.find('iframe[src*="calendar.google.com"]').length > 0;
      const bookingOnly = targetId === 'squash-courts' && /booking portal|reservations?/i.test(sectionElementQuery.text());
      if (!hasCalendar && !bookingOnly) return;
      evidence.push(unavailableEvidence({
        targetId,
        sourceId: 'columbiaHours',
        priority: 5,
        unavailableStatus: bookingOnly ? 'Separate hours not published' : 'Hours need verification',
        availabilityType: hasCalendar ? 'open-recreation' : null,
      }));
    });
  }

  evidence.push(...maintenanceEvidence($, seasonalHeading));

  return evidence;
}

export function parseBlueGymCalendar(payload, { generated } = {}) {
  if (!isOfficialBlueGymCalendar(payload?.calendarUrl) || !validGeneratedDate(generated)) return [];
  if (!Array.isArray(payload.weeks) || payload.weeks.length < 1 || payload.weeks.length > 3
    || payload.weeks.some(week => typeof week !== 'string' || week.length > 500_000)) return [];

  const windowStart = easternDate(generated);
  const windowEnd = addDays(windowStart, 13);
  const eventsByDate = new Map();
  for (const text of payload.weeks) {
    for (const event of calendarEvents(text)) {
      if (event.date < windowStart || event.date > windowEnd) continue;
      const key = `${event.date}:${event.interval.join('-')}:${event.title.toLowerCase()}`;
      const events = eventsByDate.get(event.date) || new Map();
      events.set(key, event);
      eventsByDate.set(event.date, events);
    }
  }

  const evidence = [];
  for (const [date, eventMap] of [...eventsByDate.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const events = [...eventMap.values()];
    const blueIntervals = mergeIntervals(events
      .filter(event => /\bopen\s+rec(?:reation)?\b/i.test(event.title))
      .map(event => event.interval));
    if (!blueIntervals.length) continue;
    const eventIntervals = events.map(event => event.interval);
    const envelope = [[
      eventIntervals.map(interval => interval[0]).sort()[0],
      eventIntervals.map(interval => interval[1]).sort().at(-1),
    ]];
    evidence.push(createEvidence({
      targetId: 'blue-gym',
      sourceId: 'columbiaHours',
      priority: 2,
      effectiveRange: { start: date, end: date },
      dateIntervals: blueIntervals,
      availabilityType: 'open-recreation',
    }));
    evidence.push(createEvidence({
      targetId: 'dodge',
      sourceId: 'columbiaHours',
      priority: 4,
      effectiveRange: { start: date, end: date },
      dateIntervals: envelope,
      availabilityType: 'facility-hours',
    }));
  }
  return evidence;
}

export function parseColumbiaModifications(html) {
  const $ = cheerio.load(html);
  const article = $('article').filter((_, element) => /modified hours\s*&\s*closures/i.test($(element).find('h1').first().text())).first();
  if (!article.length) return [];
  const evidence = [];
  const handledKnownNotices = new Set();

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

      const dateIntervals = dateIntervalsForModification(paragraphs);
      if (!dateIntervals) return;
      handledKnownNotices.add(noticeHeading);
      evidence.push(createEvidence({
        targetId,
        sourceId: 'columbiaModifications',
        priority: 1,
        effectiveRange: { start: effectiveDate, end: effectiveDate },
        dateIntervals,
        status,
        reason: paragraphs.find(paragraph => paragraph !== status && !timeRangeWithinText(paragraph)) || null,
        availabilityType: availabilityTypeFor(paragraphs.join(' '), targetId),
      }));
    });
  });

  article.find('h2').filter((_, heading) => /recurring area closures/i.test($(heading).text())).each((_, heading) => {
    const notices = $(heading).nextUntil('h2').filter('h3').add($(heading).nextUntil('h2').find('h3'));
    notices.each((_, notice) => {
      const noticeText = boundedText($(notice).text());
      const targetId = targetIdFor(noticeText);
      if (!targetId) return;
      const details = $(notice).nextUntil('h2, h3').text();
      if (!/when\b.+\bin session/i.test(`${noticeText || ''} ${details}`)) return;
      handledKnownNotices.add(notice);
      evidence.push(unavailableEvidence({
        targetId,
        sourceId: 'columbiaModifications',
        priority: 1,
        unavailableStatus: 'Hours need verification',
        availabilityType: availabilityTypeFor(`${noticeText || ''} ${details}`, targetId),
      }));
    });
  });

  const hasUnhandledKnownNotice = article.find('h3').toArray().some(notice => (
    targetIdFor($(notice).text()) && !handledKnownNotices.has(notice)
  ));
  return hasUnhandledKnownNotice ? [] : evidence;
}

export function isSafeEmptyColumbiaModificationsPage(html) {
  const $ = cheerio.load(html);
  const article = $('article').filter((_, element) => /modified hours\s*&\s*closures/i.test($(element).find('h1').first().text())).first();
  if (!article.length) return false;
  if (article.find('h3').toArray().some(notice => targetIdFor($(notice).text()))) return false;
  const recognizedHeadings = article.find('h2').toArray().filter(heading => (
    Boolean(parseSingleDate($(heading).text())) || /recurring area closures/i.test($(heading).text())
  ));
  if (!recognizedHeadings.length) return false;
  let noticeCount = 0;
  for (const heading of recognizedHeadings) {
    const notices = $(heading).nextUntil('h2').filter('h3').add($(heading).nextUntil('h2').find('h3')).toArray();
    if (!notices.length) return false;
    noticeCount += notices.length;
    if (notices.some(notice => targetIdFor($(notice).text()))) return false;
  }
  return noticeCount > 0;
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

  const effectiveRange = section.find('p').map((_, element) => $(element).text()).get()
    .map(parseDateRange).find(Boolean) || null;
  if (!effectiveRange) {
    if (!seasonalLabel(section.find('h1, h2, h3, h4').first().text())) return [];
    return [unavailableEvidence({
      targetId: 'barnard-fitness',
      sourceId: 'barnardFitness',
      priority: 3,
      unavailableStatus: 'Hours need verification',
      availabilityType: null,
      accessRestrictions: barnardAccessRestrictions(section.text()),
    })];
  }

  return [createEvidence({
    targetId: 'barnard-fitness',
    sourceId: 'barnardFitness',
    priority: 3,
    effectiveRange,
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
  unavailableStatus = null,
}) {
  return {
    targetId,
    sourceId,
    evidenceRef: `${sourceId}:${targetId}`,
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
    unavailableStatus,
  };
}

function unavailableEvidence(options) {
  return createEvidence({
    ...options,
    weeklyIntervals: null,
    dateIntervals: null,
  });
}

function seasonalLabel(value) {
  return /\b(?:spring|summer|fall|winter)\s+20\d{2}\b/i.test(boundedText(value) || '');
}

function maintenanceEvidence($, seasonalHeading) {
  const yearMatch = boundedText(seasonalHeading.text())?.match(/\b(20\d{2})\b/);
  if (!yearMatch) return [];
  const year = Number(yearMatch[1]);
  const candidates = [...new Set($('p').map((_, paragraph) => boundedText($(paragraph).text(), 500)).get()
    .filter(text => /Dodge Fitness Center.+closed.+annual maintenance week/i.test(text || ''))
    .filter(text => /from\s+\d{1,2}\/\d{1,2}\s+through\s+\d{1,2}\/\d{1,2}/i.test(text || ''))
    .filter(text => /reopen\s+on\s+(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),/i.test(text || '')))];
  if (candidates.length !== 1) return [];
  const text = candidates[0];
  const range = text.match(/from\s+(\d{1,2})\/(\d{1,2})\s+through\s+(\d{1,2})\/(\d{1,2})/i);
  const reopening = text.match(/reopen\s+on\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+([A-Za-z]+)\s+(\d{1,2})\s+at\s+(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)/i);
  if (!range || !reopening) return [];

  const start = numericDate(year, Number(range[1]), Number(range[2]));
  const rangeEnd = numericDate(year, Number(range[3]), Number(range[4]));
  const reopenMonth = monthNumber(reopening[2]);
  const reopenDate = numericDate(year, reopenMonth, Number(reopening[3]));
  const reopenTime = to24Hour(reopening[4], reopening[5], reopening[6]);
  if (!start || !rangeEnd || !reopenDate || rangeEnd !== reopenDate || start > reopenDate) return [];
  const span = rangeLengthInDays(start, reopenDate);
  if (span < 0 || span > 31 || weekdayForDate(reopenDate) !== reopening[1].toLowerCase()) return [];
  if (reopenTime <= '00:00' || reopenTime >= '24:00') return [];

  const evidence = [];
  for (let offset = 0; offset <= span; offset += 1) {
    const date = addDays(start, offset);
    evidence.push(createEvidence({
      targetId: 'dodge',
      sourceId: 'columbiaHours',
      priority: 1,
      effectiveRange: { start: date, end: date },
      dateIntervals: date === reopenDate ? [['00:00', reopenTime]] : [],
      status: 'Closed for maintenance',
      reason: 'Annual maintenance week',
      availabilityType: 'facility-hours',
    }));
  }
  return evidence;
}

function numericDate(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)
    || month < 1 || month > 12 || day < 1) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(value, count) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}

function rangeLengthInDays(start, end) {
  return Math.round((new Date(`${end}T12:00:00Z`) - new Date(`${start}T12:00:00Z`)) / 86_400_000);
}

function weekdayForDate(value) {
  return WEEKDAYS[new Date(`${value}T12:00:00Z`).getUTCDay()];
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

function seasonalTransitionDateRange($, seasonalHeading, generated) {
  if (!validGeneratedDate(generated)) return null;
  const yearMatch = boundedText(seasonalHeading.text())?.match(/\bSummer\s+(20\d{2})\b/i);
  if (!yearMatch) return null;
  const year = Number(yearMatch[1]);
  const paragraphs = $('p').map((_, element) => boundedText($(element).text(), 500)).get().filter(Boolean);
  const currentMatches = paragraphs.map(text => text.match(
    /Dodge Fitness Center\b[^.]{0,160}\bSummer(?: session)? schedule\b[^.]{0,80}\bthrough\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)\b/i,
  )).filter(Boolean);
  const nextMatches = paragraphs.map(text => text.match(
    /\bOn\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday),\s+([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th),?\s+we will resume Fall Semester operating hours\b/i,
  )).filter(Boolean);
  if (currentMatches.length !== 1 || nextMatches.length !== 1) return null;

  const current = currentMatches[0];
  const next = nextMatches[0];
  const end = numericDate(year, monthNumber(current[2]), Number(current[3]));
  const nextStart = numericDate(year, monthNumber(next[2]), Number(next[3]));
  const start = easternDate(generated);
  if (!end || !nextStart || addDays(end, 1) !== nextStart || start > end
    || start.slice(0, 4) !== String(year)
    || weekdayForDate(end) !== current[1].toLowerCase()
    || weekdayForDate(nextStart) !== next[1].toLowerCase()) return null;
  return { start, end };
}

function isOfficialBlueGymCalendar(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'calendar.google.com'
      && url.pathname === '/calendar/embed'
      && url.searchParams.getAll('title').length === 1
      && url.searchParams.get('title') === 'Blue Gym'
      && url.searchParams.getAll('src').length === 1
      && Boolean(url.searchParams.get('src'))
      && url.searchParams.getAll('ctz').length === 1
      && url.searchParams.get('ctz') === 'America/New_York';
  } catch {
    return false;
  }
}

function calendarEvents(text) {
  const events = [];
  const pattern = /(?:^|\n)\s*((?:1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:am|pm))\s+to\s+((?:1[0-2]|[1-9])(?::[0-5]\d)?\s*(?:am|pm)),\s*([^,\n]+),\s*Calendar:[^,\n]+,\s*(?:No location|[^,\n]*),\s*([A-Za-z]+\s+\d{1,2},\s+\d{4})\s*(?=\n|$)/gi;
  for (const match of text.matchAll(pattern)) {
    const date = parseSingleDate(match[4]);
    const interval = parseTimeRange(`${match[1]} - ${match[2]}`);
    const title = boundedText(match[3]);
    if (date && interval && title) events.push({ date, interval, title });
  }
  return events;
}

function mergeIntervals(intervals) {
  const ordered = intervals.map(interval => [...interval]).sort(([left], [right]) => left.localeCompare(right));
  const merged = [];
  for (const interval of ordered) {
    const previous = merged.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = previous[1] > interval[1] ? previous[1] : interval[1];
    else merged.push(interval);
  }
  return merged;
}

function validGeneratedDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function easternDate(value) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = type => parts.find(item => item.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
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

function dateIntervalsForModification(paragraphs) {
  const temporalParagraphs = paragraphs.filter(hasTemporalCandidate);
  if (!temporalParagraphs.length) return [];
  const intervals = temporalParagraphs.map(timeRangeWithinText);
  if (intervals.length !== 1 || intervals.some(interval => !interval)) return null;
  return intervals;
}

function hasTemporalCandidate(value) {
  const text = boundedText(value);
  return Boolean(text && (
    /\b(?:from|between)\b[^.!?]{0,120}\b(?:to|until|through)\b/i.test(text)
    || /\b(?:a\.?m\.?|p\.?m\.?)\b/i.test(text)
    || /\b(?:noon|midnight)\b/i.test(text)
    || /\b\d{1,2}:\d{2}\b/.test(text)
    || /\b\d{1,2}(?::\d{2})?\s*[-–]\s*\d{1,2}(?::\d{2})?\b/.test(text)
  ));
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
  if (!text) return null;
  const matches = [...text.matchAll(new RegExp(TIME_RANGE_EXPRESSION, 'gi'))];
  if (matches.length !== 1) return null;
  const [match] = matches;
  const interval = parseTimeRange(match[0]);
  if (!interval) return null;
  const remainingText = `${text.slice(0, match.index)}${text.slice(match.index + match[0].length)}`;
  return hasTemporalCandidate(remainingText) ? null : interval;
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
