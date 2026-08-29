import { load } from 'cheerio';

import { ACCESS_TYPES, STUDENT_SERVICES_SOURCE_URLS } from './student-services-hours-catalog.js';

const DAY_INDEX = Object.freeze({
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
});

function text(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseClock(value, closing = false) {
  const match = text(value).match(/^(\d{1,2})(?::(\d{2}))?\s*([AP])\.?\s*M\.?$/i);
  if (!match) throw new Error(`invalid Student Life time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 1 || hour > 12 || minute > 59) throw new Error(`invalid Student Life time: ${value}`);
  let result = hour % 12 + (match[3].toUpperCase() === 'P' ? 12 : 0);
  if (closing && result === 0 && minute === 0) return '24:00';
  return `${String(result).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseRange(value) {
  const match = text(value).match(/(\d{1,2}(?::\d{2})?\s*(?:[AP]\.?\s*M\.?)?)\s*(?:[-–—]|\bto\b)\s*(\d{1,2}(?::\d{2})?\s*[AP]\.?\s*M\.?)/i);
  if (!match) throw new Error(`invalid Student Life range: ${value}`);
  const closingMeridiem = match[2].match(/([AP])\.?\s*M\.?/i)?.[0];
  const openingText = /[AP]\.?\s*M\.?/i.test(match[1]) ? match[1] : `${match[1]} ${closingMeridiem}`;
  const open = parseClock(openingText);
  const close = parseClock(match[2], true);
  if (close !== '24:00' && close <= open) throw new Error(`Student Life intervals cannot cross midnight: ${value}`);
  return [open, close];
}

function parseCalendarRange(value) {
  const match = text(value).match(/(\d{1,2}(?::\d{2})?\s*[AP]\.?\s*M\.?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*[AP]\.?\s*M\.?)/i);
  if (!match) throw new Error(`invalid Student Life calendar range: ${value}`);
  return [parseClock(match[1]), parseClock(match[2])];
}

function nextDate(value) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function dayIndexes(value) {
  const clean = text(value).replace(/\band\b/gi, '&').replace(/,/g, ' & ');
  const result = new Set();
  for (const part of clean.split(/\s*&\s*/).filter(Boolean)) {
    const range = part.split(/\s*[-–—]\s*/);
    if (range.length === 1 && DAY_INDEX[range[0]] !== undefined) result.add(DAY_INDEX[range[0]]);
    else if (range.length === 2 && DAY_INDEX[range[0]] !== undefined && DAY_INDEX[range[1]] !== undefined) {
      for (let day = DAY_INDEX[range[0]]; ; day = (day + 1) % 7) {
        result.add(day);
        if (day === DAY_INDEX[range[1]]) break;
        if (result.size === 7) break;
      }
    } else throw new Error(`invalid Student Life weekday expression: ${value}`);
  }
  return [...result].sort((left, right) => left - right);
}

function evidence({ sourceId, targetId, type, weekdays = [], intervals = [], status = null,
  reason = null, effectiveStart = '2026-01-01', effectiveEnd = '9999-12-31', exactDate = null, suffix = type }) {
  return {
    sourceId, targetId, effectiveStart, effectiveEnd, exactDate, weekdays, type,
    intervals, status, reason, evidenceRef: `${sourceId}:${targetId}:${suffix}`,
  };
}

function schedulesFromContainer($, container, options) {
  const results = [];
  const type = $(container).attr('data-access') || options.type;
  if (!ACCESS_TYPES.includes(type)) throw new Error(`unsupported Student Life access type: ${type}`);
  const effectiveStart = $(container).attr('data-start') || options.effectiveStart || '2026-01-01';
  const effectiveEnd = $(container).attr('data-end') || options.effectiveEnd || '9999-12-31';
  const reason = text($(container).find('h4').first().text()) || options.reason || null;
  $(container).find('p').each((_index, paragraph) => {
    const line = text($(paragraph).text()).replace(/\s+ET$/i, '');
    if (/Available 24\/7/i.test(line)) {
      results.push(evidence({ ...options, type, effectiveStart, effectiveEnd,
        weekdays: [0, 1, 2, 3, 4, 5, 6], intervals: [['00:00', '24:00']], reason,
        suffix: `${type}-daily` }));
      return;
    }
    const match = line.match(/^(.+?):\s*(CLOSED|.+)$/i);
    if (!match || !/(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/.test(match[1])) return;
    const weekdays = dayIndexes(match[1]);
    const closed = /^closed$/i.test(match[2]);
    results.push(evidence({ ...options, type, effectiveStart, effectiveEnd, weekdays,
      intervals: closed ? [] : [parseRange(match[2])], status: closed ? 'Closed' : null,
      reason,
      suffix: `${type}-${weekdays.join('')}` }));
  });
  return results;
}

export function parseLernerSource({ homeHtml, calendarHtml, calendarText, calendarUrl }) {
  const $ = load(homeHtml);
  const content = text($('main').text() || $.root().text());
  if (!/Building Hours of Operation/i.test(content) || !/most up to date hours/i.test(content)) {
    throw new Error('Lerner building-hours content is missing');
  }
  const officialCalendar = new URL(calendarUrl, STUDENT_SERVICES_SOURCE_URLS.lerner);
  const sameOriginEvents = officialCalendar.origin === new URL(STUDENT_SERVICES_SOURCE_URLS.lerner).origin
    && officialCalendar.pathname === '/events';
  const embeddedGoogleCalendar = officialCalendar.hostname === 'calendar.google.com'
    && officialCalendar.pathname === '/calendar/embed'
    && officialCalendar.searchParams.get('title') === 'Lerner Hall Operating Hours'
    && officialCalendar.searchParams.getAll('src').length >= 1;
  if (!sameOriginEvents && !embeddedGoogleCalendar) throw new Error('Lerner calendar provenance is invalid');
  const baseline = [];
  for (const match of content.matchAll(/((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:\s*[-&]\s*(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday))?)\s*:\s*(\d{1,2}(?::\d{2})?\s*[AP]M\s*[-–—]\s*\d{1,2}(?::\d{2})?\s*[AP]M)/gi)) {
    baseline.push(evidence({ sourceId: 'lerner', targetId: 'lerner', type: 'open-access',
      weekdays: dayIndexes(match[1]), intervals: [parseRange(match[2])], suffix: `baseline-${baseline.length}` }));
  }
  if (baseline.length !== 2) throw new Error('Lerner recurring schedule is incomplete');
  const exceptions = [];
  if (sameOriginEvents) {
    const calendar$ = load(calendarHtml || '<main></main>');
    calendar$('.hours-event').each((_index, event) => {
      const exactDate = calendar$(event).attr('data-start-date');
      const title = text(calendar$(event).find('h2').first().text());
      const rangeText = text(calendar$(event).find('p').first().text());
      if (!/^\d{4}-\d{2}-\d{2}$/.test(exactDate || '') || !rangeText) return;
      exceptions.push(evidence({ sourceId: 'lerner', targetId: 'lerner', type: 'open-access', exactDate,
        intervals: /closed/i.test(rangeText) ? [] : [parseRange(rangeText)],
        status: /closed/i.test(rangeText) ? 'Closed' : null, reason: title || null, suffix: `exception-${exactDate}` }));
    });
  } else {
    const monthPattern = '(?:January|February|March|April|May|June|July|August|September|October|November|December)';
    const eventPattern = new RegExp(`All day,\\s*(Closed|\\d{1,2}(?::\\d{2})?\\s*[AP]M\\s*[-–—]\\s*\\d{1,2}(?::\\d{2})?\\s*[AP]M),\\s*Calendar:\\s*([^,]+),\\s*No location,\\s*(${monthPattern}\\s+\\d{1,2},\\s+\\d{4})`, 'gi');
    for (const match of String(calendarText || '').matchAll(eventPattern)) {
      const parsedDate = new Date(`${match[3]} 12:00:00 UTC`);
      if (Number.isNaN(parsedDate.getTime())) continue;
      const exactDate = parsedDate.toISOString().slice(0, 10);
      const closed = /^closed$/i.test(match[1]);
      const calendarName = text(match[2]);
      const interval = closed ? null : parseCalendarRange(match[1]);
      const crossesMidnight = interval && interval[1] <= interval[0];
      exceptions.push(evidence({ sourceId: 'lerner', targetId: 'lerner', type: 'open-access', exactDate,
        intervals: closed ? [] : [[interval[0], crossesMidnight ? '24:00' : interval[1]]],
        status: closed ? 'Closed' : null, reason: calendarName, suffix: `embedded-calendar-${exactDate}` }));
      if (crossesMidnight && interval[1] !== '00:00') {
        const spillDate = nextDate(exactDate);
        exceptions.push(evidence({ sourceId: 'lerner', targetId: 'lerner', type: 'open-access', exactDate: spillDate,
          intervals: [['00:00', interval[1]]], reason: `${calendarName} (from prior day)`,
          suffix: `embedded-calendar-spill-${spillDate}` }));
      }
    }
    if (exceptions.length < 14) throw new Error('Lerner embedded calendar schedule is incomplete');
  }
  return [...baseline, ...exceptions];
}

export function parseMailSource(html) {
  const $ = load(html);
  const section = $('[data-location="student-mail-center"]');
  if (!section.length) return parseRawMailSource($);
  if (!section.length || !/Wien Hall, Lower Level/i.test(text(section.find('h2').text()))) {
    throw new Error('Student Mail Center section is missing');
  }
  const records = [];
  section.children().each((_index, child) => {
    if (child.tagName === 'h3') return;
    const heading = $(child).prevAll('h3').first();
    if (!heading.length) return;
    const line = text($(child).text());
    const match = line.match(/^(.+?):\s*(CLOSED|.+)$/i);
    if (!match || !/(?:Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/.test(match[1])) return;
    const weekdays = dayIndexes(match[1]);
    const closed = /^closed$/i.test(match[2]);
    records.push(evidence({ sourceId: 'mail', targetId: 'mail-center', type: 'office-hours',
      effectiveStart: heading.attr('data-start'), effectiveEnd: heading.attr('data-end'), weekdays,
      intervals: closed ? [] : [parseRange(match[2])], status: closed ? 'Closed' : null,
      reason: text(heading.text()),
      suffix: `${heading.attr('data-start')}-${weekdays.join('')}` }));
  });
  section.find('[data-exact-date]').each((_index, closure) => {
    const exactDate = $(closure).attr('data-exact-date');
    records.push(evidence({ sourceId: 'mail', targetId: 'mail-center', type: 'office-hours', exactDate,
      intervals: [], status: 'Closed', reason: text($(closure).text()), suffix: `closure-${exactDate}` }));
  });
  if (records.length < 8) throw new Error('Student Mail Center schedules are incomplete');
  return records;
}

function capturedRange(content, pattern, label) {
  const match = content.match(pattern);
  if (!match?.[1]) throw new Error(`Student Life live range is missing: ${label}`);
  return [parseRange(match[1])];
}

function rawMailRecord(content, { label, weekdays, pattern, start, end }) {
  return evidence({
    sourceId: 'mail', targetId: 'mail-center', type: 'office-hours', weekdays,
    intervals: capturedRange(content, pattern, label), effectiveStart: start, effectiveEnd: end,
    reason: label, suffix: `${start}-${weekdays.join('')}`,
  });
}

function parseRawMailSource($) {
  const content = text($('#main-article').text() || $('main').text());
  if (!/Student Mail Center\s*:?[\s\S]*Wien Hall, Lower Level/i.test(content)
    || !/Summer Hours \(through 8\/30\)/i.test(content)
    || !/Check-In Week: August 31\s*[-–—]\s*September 7/i.test(content)
    || !/Fall Rush: September 8\s*[-–—]\s*27/i.test(content)
    || !/Regular Fall Hours \(Beginning September 28\)/i.test(content)) {
    throw new Error('Student Mail Center live schedule signature is missing');
  }
  const range = '(\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m\\.?\\s*[-–—]\\s*\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?m\\.?)';
  const sectionBetween = (start, end) => {
    const startIndex = content.search(start);
    const tail = content.slice(startIndex);
    const endIndex = tail.search(end);
    if (startIndex < 0 || endIndex < 0) throw new Error('Student Mail Center period boundary is missing');
    return tail.slice(0, endIndex);
  };
  const summer = sectionBetween(/Summer Hours/i, /Check-In Week/i);
  const checkIn = sectionBetween(/Check-In Week/i, /Fall Rush/i);
  const rush = sectionBetween(/Fall Rush/i, /Regular Fall Hours/i);
  const regular = content.slice(content.search(/Regular Fall Hours/i), content.search(/Administrative Mail Office/i));
  const records = [
    rawMailRecord(summer, { label: 'Summer Hours', weekdays: [1, 2, 3, 4, 5], pattern: new RegExp(`Monday\\s*[-–—]\\s*Friday\\s*:\\s*${range}`, 'i'), start: '2026-01-01', end: '2026-08-30' }),
    rawMailRecord(checkIn, { label: 'Check-In Week', weekdays: [1], pattern: new RegExp(`Monday\\s*:\\s*${range}`, 'i'), start: '2026-08-31', end: '2026-09-07' }),
    rawMailRecord(checkIn, { label: 'Check-In Week', weekdays: [2], pattern: new RegExp(`Tuesday\\s*:\\s*${range}`, 'i'), start: '2026-08-31', end: '2026-09-07' }),
    rawMailRecord(checkIn, { label: 'Check-In Week', weekdays: [3], pattern: new RegExp(`Wednesday\\s*:\\s*${range}`, 'i'), start: '2026-08-31', end: '2026-09-07' }),
    rawMailRecord(checkIn, { label: 'Check-In Week', weekdays: [4], pattern: new RegExp(`Thursday\\s*:\\s*${range}`, 'i'), start: '2026-08-31', end: '2026-09-07' }),
    rawMailRecord(checkIn, { label: 'Check-In Week', weekdays: [5], pattern: new RegExp(`Friday\\s*:\\s*${range}`, 'i'), start: '2026-08-31', end: '2026-09-07' }),
    rawMailRecord(checkIn, { label: 'Check-In Week', weekdays: [6], pattern: new RegExp(`Saturday\\s*:\\s*${range}`, 'i'), start: '2026-08-31', end: '2026-09-07' }),
    rawMailRecord(rush, { label: 'Fall Rush', weekdays: [1, 4], pattern: new RegExp(`Monday\\s*&\\s*Thursday\\s*:\\s*${range}`, 'i'), start: '2026-09-08', end: '2026-09-27' }),
    rawMailRecord(rush, { label: 'Fall Rush', weekdays: [2, 3], pattern: new RegExp(`Tuesday\\s*&\\s*Wednesday\\s*:\\s*${range}`, 'i'), start: '2026-09-08', end: '2026-09-27' }),
    rawMailRecord(rush, { label: 'Fall Rush', weekdays: [5], pattern: new RegExp(`Friday\\s*:\\s*${range}`, 'i'), start: '2026-09-08', end: '2026-09-27' }),
    rawMailRecord(rush, { label: 'Fall Rush', weekdays: [0, 6], pattern: new RegExp(`Saturday\\s*&\\s*Sunday\\s*:\\s*${range}`, 'i'), start: '2026-09-08', end: '2026-09-27' }),
    rawMailRecord(regular, { label: 'Regular Fall Hours', weekdays: [1, 4], pattern: new RegExp(`Monday\\s*&\\s*Thursday\\s*:\\s*${range}`, 'i'), start: '2026-09-28', end: '2026-12-31' }),
    rawMailRecord(regular, { label: 'Regular Fall Hours', weekdays: [2, 3], pattern: new RegExp(`Tuesday\\s*&\\s*Wednesday\\s*:\\s*${range}`, 'i'), start: '2026-09-28', end: '2026-12-31' }),
    rawMailRecord(regular, { label: 'Regular Fall Hours', weekdays: [5], pattern: new RegExp(`Friday\\s*:\\s*${range}`, 'i'), start: '2026-09-28', end: '2026-12-31' }),
  ];
  records.push(evidence({ sourceId: 'mail', targetId: 'mail-center', type: 'office-hours', exactDate: '2026-09-07',
    intervals: [], status: 'Closed', reason: 'Closed for Labor Day', suffix: 'closure-2026-09-07' }));
  return records;
}

export function parseHealthSource(html) {
  const $ = load(html);
  if (!$('[data-service]').length) return parseRawHealthSource($);
  const records = [];
  for (const targetId of ['alice-health', 'caps', 'disability', 'medical', 'svr', 'student-insurance', 'immunization']) {
    const section = $(`[data-service="${targetId}"]`);
    if (!section.length) throw new Error(`Health service section is missing: ${targetId}`);
    if ((targetId === 'disability' || targetId === 'svr') && !/Morningside/i.test(text(section.text()))) {
      throw new Error(`Health service lacks Morningside evidence: ${targetId}`);
    }
    section.find('[data-access]').each((_index, container) => {
      records.push(...schedulesFromContainer($, container, { sourceId: 'health', targetId }));
    });
    if (!records.some(record => record.targetId === targetId)) {
      throw new Error(`Health service has no parseable availability: ${targetId}`);
    }
  }
  return records;
}

function rawHealthAvailability(segment, { targetId, type, weekdays, pattern, reason, start, end, suffix }) {
  return evidence({ sourceId: 'health', targetId, type, weekdays,
    intervals: capturedRange(segment, pattern, suffix || reason), reason,
    effectiveStart: start, effectiveEnd: end, suffix });
}

function parseRawHealthSource($) {
  const content = text($('#main-article').text() || $('main').text());
  if (!/Summer 2026 Operating Hours/i.test(content)) throw new Error('Health live schedule signature is missing');
  const clock = '\\d{1,2}(?::\\d{2})?\\s*(?:[ap]\\.?\\s*m\\.?)?';
  const fullRange = `(${clock}\\s*(?:[-–—]|to)\\s*\\d{1,2}(?::\\d{2})?\\s*[ap]\\.?\\s*m\\.?)`;
  const rangePattern = (prefix) => new RegExp(`${prefix}\\s*:?\\s*${fullRange}`, 'i');
  const weekdayHoursPrefix = weekdayExpression => `(?:Hours\\s+)?${weekdayExpression}\\s*:?(?:\\s+Hours)?`;
  const lastIndex = pattern => [...content.matchAll(new RegExp(pattern.source, `${pattern.flags}g`))].at(-1)?.index ?? -1;
  const nextIndex = (pattern, from) => {
    const relative = content.slice(from).search(pattern);
    return relative < 0 ? -1 : from + relative;
  };
  const aliceStart = lastIndex(/Alice! Health Promotion/i);
  const capsStart = nextIndex(/Counseling and Psychological Services/i, aliceStart + 1);
  const disabilityStart = nextIndex(/Disability Services/i, capsStart + 1);
  const medicalStart = nextIndex(/Medical Services/i, disabilityStart + 1);
  const svrStart = nextIndex(/Sexual Violence Response/i, medicalStart + 1);
  const insuranceStart = nextIndex(/Student (?:Health )?Insurance Office/i, svrStart + 1);
  const immunizationStart = nextIndex(/Immunization Compliance Office/i, insuranceStart + 1);
  if ([aliceStart, capsStart, disabilityStart, medicalStart, svrStart, insuranceStart, immunizationStart].some(index => index < 0)) {
    throw new Error('Health service live section is missing');
  }
  const alice = content.slice(aliceStart, capsStart);
  const caps = content.slice(capsStart, disabilityStart);
  const disability = content.slice(disabilityStart, medicalStart);
  const medical = content.slice(medicalStart, svrStart);
  const svr = content.slice(svrStart, insuranceStart);
  const insurance = content.slice(insuranceStart, immunizationStart);
  const immunization = content.slice(immunizationStart);
  for (const [name, segment, signature] of [
    ['Alice!', alice, /John Jay Hall \(Floor 3\)/i], ['CAPS', caps, /Lerner Hall, 8th Floor/i],
    ['Disability', disability, /Morningside[\s\S]*Wien Hall, Suite 108A/i], ['Medical', medical, /John Jay Hall[\s\S]{0,80}(?:Floor 4|4th Floor)/i],
    ['SVR', svr, /Morningside[\s\S]*Lerner Hall, Suite 700/i], ['Insurance', insurance, /John Jay Hall \(Floor 3\)/i],
    ['Immunization', immunization, /Virtual appointments/i],
  ]) if (!signature.test(segment)) throw new Error(`Health ${name} live identity is missing`);

  const capsFall = /Starting August 17, 2026/i.test(caps)
    ? caps.slice(caps.search(/Starting August 17, 2026/i))
    : caps;
  const records = [
    rawHealthAvailability(alice, { targetId: 'alice-health', type: 'office-hours', weekdays: [1, 2, 3, 4, 5], pattern: rangePattern('Monday\\s*[-–—]\\s*Friday'), reason: 'Office Hours', start: '2026-05-26', end: '2026-09-04', suffix: 'office-hours' }),
    rawHealthAvailability(alice, { targetId: 'alice-health', type: 'virtual-only', weekdays: [1, 2, 4, 5], pattern: rangePattern('Monday, Tuesday, Thursday, Friday'), reason: 'Sexual & Reproductive Health Drop-In — Virtual Only', start: '2026-05-26', end: '2026-09-04', suffix: 'virtual-drop-in' }),
    rawHealthAvailability(capsFall, { targetId: 'caps', type: 'office-hours', weekdays: [1, 2, 3, 4], pattern: rangePattern(weekdayHoursPrefix('Monday\\s*[-–—]\\s*Thursday')), reason: 'Main Office', start: '2026-08-17', suffix: 'main-office-weekdays' }),
    rawHealthAvailability(capsFall, { targetId: 'caps', type: 'office-hours', weekdays: [5], pattern: rangePattern(weekdayHoursPrefix('Friday')), reason: 'Main Office', start: '2026-08-17', suffix: 'main-office-friday' }),
    evidence({ sourceId: 'health', targetId: 'caps', type: 'phone-support', weekdays: [0, 1, 2, 3, 4, 5, 6], intervals: [['00:00', '24:00']], reason: 'After Hours', suffix: 'phone-support' }),
    rawHealthAvailability(caps.slice(caps.search(/Urgent Mental Health Concerns/i)), { targetId: 'caps', type: 'walk-in', weekdays: [1, 2, 3, 4], pattern: rangePattern('Monday\\s*[-–—]\\s*Thursday'), reason: 'Urgent Mental Health Concerns Drop-In', start: '2026-09-08', suffix: 'urgent-drop-in' }),
    rawHealthAvailability(disability, { targetId: 'disability', type: 'appointment-only', weekdays: [1, 2, 3, 4, 5], pattern: rangePattern('Monday\\s*[-–—]\\s*Friday'), reason: 'Virtual and in person by appointment only', suffix: 'appointments' }),
    rawHealthAvailability(disability.slice(disability.search(/Virtual Drop-In/i)), { targetId: 'disability', type: 'virtual-only', weekdays: [1], pattern: rangePattern('Monday'), reason: 'Virtual Drop-In', suffix: 'virtual-monday' }),
    rawHealthAvailability(disability.slice(disability.search(/Virtual Drop-In/i)), { targetId: 'disability', type: 'virtual-only', weekdays: [3], pattern: rangePattern('Wednesday'), reason: 'Virtual Drop-In', suffix: 'virtual-wednesday' }),
    rawHealthAvailability(disability.slice(disability.search(/Virtual Drop-In/i)), { targetId: 'disability', type: 'virtual-only', weekdays: [4], pattern: rangePattern('Thursday'), reason: 'Virtual Drop-In', suffix: 'virtual-thursday' }),
    rawHealthAvailability(disability.slice(disability.search(/Virtual Drop-In/i)), { targetId: 'disability', type: 'virtual-only', weekdays: [5], pattern: rangePattern('Friday'), reason: 'Virtual Drop-In', suffix: 'virtual-friday' }),
    rawHealthAvailability(medical, { targetId: 'medical', type: 'office-hours', weekdays: [1, 2, 3, 4], pattern: rangePattern(weekdayHoursPrefix('Monday\\s*[-–—]\\s*Thursday')), reason: 'Office Hours', suffix: 'office-weekdays' }),
    rawHealthAvailability(medical, { targetId: 'medical', type: 'office-hours', weekdays: [5], pattern: rangePattern(weekdayHoursPrefix('Friday')), reason: 'Office Hours', suffix: 'office-friday' }),
    evidence({ sourceId: 'health', targetId: 'medical', type: 'phone-support', weekdays: [0, 1, 2, 3, 4, 5, 6], intervals: [['00:00', '24:00']], reason: 'Afterhours & Urgent Medical Concerns', suffix: 'phone-support' }),
    rawHealthAvailability(svr, { targetId: 'svr', type: 'appointment-only', weekdays: [1, 2, 3, 4, 5], pattern: rangePattern('Office Hours[\\s\\S]*?Monday\\s*[-–—]\\s*Friday'), reason: 'Appointments', suffix: 'appointments' }),
    rawHealthAvailability(svr, { targetId: 'svr', type: 'walk-in', weekdays: [1, 2, 4, 5], pattern: rangePattern('Drop-in Hours[\\s\\S]*?Monday, Tuesday, Thursday, Friday'), reason: 'Drop-In Hours', suffix: 'drop-in' }),
    evidence({ sourceId: 'health', targetId: 'svr', type: 'phone-support', weekdays: [0, 1, 2, 3, 4, 5, 6], intervals: [['00:00', '24:00']], reason: 'After hours', suffix: 'phone-support' }),
    rawHealthAvailability(insurance, { targetId: 'student-insurance', type: 'appointment-only', weekdays: [1, 2, 3, 4, 5], pattern: rangePattern('Appointments[\\s\\S]*?Hours[\\s\\S]*?Monday\\s*[-–—]\\s*Friday'), reason: 'Appointments', suffix: 'appointments' }),
    rawHealthAvailability(insurance.slice(insurance.search(/Drop-ins/i)), { targetId: 'student-insurance', type: 'walk-in', weekdays: [1], pattern: rangePattern('Monday'), reason: 'Drop-ins', suffix: 'drop-in-monday' }),
    rawHealthAvailability(insurance.slice(insurance.search(/Drop-ins/i)), { targetId: 'student-insurance', type: 'walk-in', weekdays: [2], pattern: rangePattern('Tuesday'), reason: 'Drop-ins', suffix: 'drop-in-tuesday' }),
    rawHealthAvailability(insurance.slice(insurance.search(/Drop-ins/i)), { targetId: 'student-insurance', type: 'walk-in', weekdays: [4], pattern: rangePattern('Thursday'), reason: 'Drop-ins', suffix: 'drop-in-thursday' }),
    rawHealthAvailability(insurance.slice(insurance.search(/Drop-ins/i)), { targetId: 'student-insurance', type: 'walk-in', weekdays: [5], pattern: rangePattern('Friday'), reason: 'Drop-ins', suffix: 'drop-in-friday' }),
    rawHealthAvailability(immunization, { targetId: 'immunization', type: 'virtual-only', weekdays: [1, 2, 3, 4, 5], pattern: rangePattern('Monday\\s*[-–—]\\s*Friday'), reason: 'Virtual appointments', suffix: 'virtual-appointments' }),
  ];
  return records;
}

export function parseBookstoreSource(value) {
  if (typeof value === 'string' && !/^\s*[{[]/.test(value)) return parseBookstoreVisibleText(value);
  const data = typeof value === 'string' ? JSON.parse(value) : value;
  if (!data || data.store?.name !== 'Columbia University Bookstore' || data.store?.storeId !== '45552') {
    throw new Error('Bookstore store identity is ambiguous');
  }
  const records = [];
  for (const [day, valueText] of Object.entries(data.hours || {})) {
    if (DAY_INDEX[day] === undefined) throw new Error(`unknown Bookstore weekday: ${day}`);
    records.push(evidence({ sourceId: 'bookstore', targetId: 'bookstore', type: 'office-hours',
      weekdays: [DAY_INDEX[day]], intervals: /^closed$/i.test(valueText) ? [] : [parseRange(valueText)],
      status: /^closed$/i.test(valueText) ? 'Closed' : null, suffix: `weekday-${DAY_INDEX[day]}` }));
  }
  if (records.length !== 7) throw new Error('Bookstore schedule must contain seven weekdays');
  return records;
}

function parseBookstoreVisibleText(value) {
  const content = text(value);
  if (!/Columbia University in the City of New York[\s\S]*2922 Broadway[\s\S]*Lerner Hall\s*\|\s*Lower Level[\s\S]*STORE HOURS/i.test(content)) {
    throw new Error('Bookstore store identity is ambiguous');
  }
  const dayNames = [['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6]];
  const records = dayNames.map(([day, weekday]) => {
    const match = content.match(new RegExp(`\\b${day}\\s*:\\s*(Closed|\\d{1,2}(?::\\d{2})?\\s*[ap]m\\s*[-–—]\\s*\\d{1,2}(?::\\d{2})?\\s*[ap]m)`, 'i'));
    if (!match) throw new Error(`Bookstore visible hours are incomplete: ${day}`);
    const closed = /^closed$/i.test(match[1]);
    return evidence({ sourceId: 'bookstore', targetId: 'bookstore', type: 'office-hours', weekdays: [weekday],
      intervals: closed ? [] : [parseRange(match[1])], status: closed ? 'Closed' : null,
      suffix: `visible-weekday-${weekday}` });
  });
  return records;
}
