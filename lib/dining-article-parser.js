import { load } from 'cheerio';

export const DINING_ARTICLE_SOURCES = Object.freeze({
  nsop: Object.freeze({
    id: 'nsop-2026',
    url: 'https://dining.columbia.edu/news/new-student-orientation-program-nsop-2026-dining-service',
  }),
  labor: Object.freeze({
    id: 'labor-day-2026',
    url: 'https://dining.columbia.edu/news/labor-day-2026-operating-hours',
  }),
  fall: Object.freeze({
    id: 'fall-2026',
    url: 'https://dining.columbia.edu/news/fall-2026-operating-hours',
  }),
});

const VENUE_IDS = Object.freeze({
  "Chef Mike's Sub Shop": 'chefmikes',
  "Chef Don's Pizza Pi": 'chefdons',
  'Faculty House 2nd Floor': 'facultyhouse',
  'Faculty House 4th Floor': 'facultyhouse-4',
  'Fac Shack': 'facshack',
  'Ferris Booth Commons': 'ferris',
  'Grace Dodge Dining Hall': 'gracedodge',
  "JJ's Place": 'jjs',
  'John Jay': 'johnjay',
  'John Jay Dining Hall': 'johnjay',
  "Johnny's Food Truck": 'johnnys',
  'Blue Java Butler': 'bj-butler',
  'Blue Java Mudd': 'bj-mudd',
  'Blue Java at Everett Library Cafe': 'bj-everett',
  'Blue Java Uris': 'bj-uris',
  'Lenfest Cafe': 'lenfest-cafe',
});

const DAY_INDEX = Object.freeze({
  Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6,
});

function normalizeText(value) {
  return String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanName(value) {
  return normalizeText(value).replace(/\*+$/, '').trim();
}

function parseClock(value, { closing = false } = {}) {
  const match = normalizeText(value).match(/^(\d{1,2})(?::(\d{2}))?\s*([AP])\.?M\.?$/i);
  if (!match) throw new Error(`invalid article time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 1 || hour > 12 || minute > 59) throw new Error(`invalid article time: ${value}`);
  let normalizedHour = hour % 12;
  if (match[3].toUpperCase() === 'P') normalizedHour += 12;
  if (closing && normalizedHour === 0 && minute === 0) return '24:00';
  return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function parseRange(value, { allowOvernight = false } = {}) {
  const match = normalizeText(value).match(
    /^(\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?)$/i,
  );
  if (!match) throw new Error(`invalid article range: ${value}`);
  const open = parseClock(match[1]);
  let close = parseClock(match[2], { closing: true });
  if (close === '24:00' && open === '00:00') close = '00:00';
  if (!allowOvernight && close <= open) throw new Error(`article range must increase: ${value}`);
  return [open, close];
}

function definitionPairs($, element) {
  const pairs = new Map();
  let key = null;
  $(element).children('dt, dd').each((_index, child) => {
    if (child.tagName === 'dt') key = normalizeText($(child).text());
    else if (key) {
      const clone = $(child).clone();
      clone.find('hr').replaceWith('\n');
      pairs.set(key, clone.text().replace(/\u00a0/g, ' ').trim());
      key = null;
    }
  });
  return pairs;
}

function articleRoot(html, expectedTitle) {
  const $ = load(html);
  const root = $('#main-article').length ? $('#main-article') : $.root();
  if (normalizeText(root.find('h1').first().text()) !== expectedTitle) {
    throw new Error(`expected article title: ${expectedTitle}`);
  }
  return { $, root };
}

function isoArticleDate(value, yearRequired = true) {
  const clean = normalizeText(value).replace(/:\s*Bring Your CUID$/i, '');
  const parsed = new Date(`${clean} 12:00:00 UTC`);
  if (Number.isNaN(parsed.getTime()) || (yearRequired && parsed.getUTCFullYear() !== 2026)) {
    throw new Error(`invalid 2026 article date: ${value}`);
  }
  return parsed.toISOString().slice(0, 10);
}

function venueId(value) {
  const name = cleanName(value);
  const id = VENUE_IDS[name];
  if (!id) throw new Error(`unknown dining venue: ${name}`);
  return id;
}

function dayIndexes(value) {
  const normalized = normalizeText(value).replace(/:$/, '');
  if (/^7 days\/week,?$/i.test(normalized)) return [0, 1, 2, 3, 4, 5, 6];
  const parts = normalized.split(/\s*[-–—]\s*/);
  if (parts.length === 1 && DAY_INDEX[parts[0]] !== undefined) return [DAY_INDEX[parts[0]]];
  if (parts.length !== 2 || DAY_INDEX[parts[0]] === undefined || DAY_INDEX[parts[1]] === undefined) {
    throw new Error(`invalid weekday expression: ${value}`);
  }
  const result = [];
  for (let day = DAY_INDEX[parts[0]]; ; day = (day + 1) % 7) {
    result.push(day);
    if (day === DAY_INDEX[parts[1]]) return result;
    if (result.length === 7) throw new Error(`invalid weekday range: ${value}`);
  }
}

function parseRecurringHours(value, { allowOvernight = false } = {}) {
  const hours = Object.fromEntries(Array.from({ length: 7 }, (_unused, index) => [String(index), []]));
  const clauses = String(value).split(/\n+/).map(normalizeText).filter(Boolean);
  for (const clause of clauses) {
    const separator = clause.search(/[:,]/);
    const sevenDays = clause.match(/^(7 days\/week),?\s+(.+)$/i);
    const dayPart = sevenDays ? sevenDays[1] : clause.slice(0, separator);
    const rangePart = sevenDays ? sevenDays[2] : clause.slice(separator + 1);
    if ((!sevenDays && separator < 0) || !rangePart) throw new Error(`invalid recurring hours: ${clause}`);
    const matches = [...rangePart.matchAll(
      /(\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?)\s*[-–—]\s*(\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?)/gi,
    )];
    if (!matches.length) throw new Error(`missing recurring time range: ${clause}`);
    const intervals = matches.map((match) => parseRange(`${match[1]} - ${match[2]}`, { allowOvernight }));
    for (const day of dayIndexes(dayPart)) {
      if (hours[String(day)].length) throw new Error(`duplicate recurring weekday: ${dayPart}`);
      hours[String(day)] = intervals;
    }
  }
  return hours;
}

export function parseNsopArticle(html) {
  const { $, root } = articleRoot(html, 'New Student Orientation Program (NSOP) 2026 Dining Service');
  const fullText = normalizeText(root.text());
  if (!/incoming First-Year, Transfer, Combined Plan, and Exchange students/i.test(fullText)
    || !/students supporting NSOP programming/i.test(fullText)) {
    throw new Error('NSOP restricted audience is missing');
  }
  if (!/September 2[\s\S]*bring their CUIDs/i.test(fullText)) throw new Error('NSOP CUID rule is missing');

  const days = [];
  let currentDate = null;
  root.find([
    '.field--name-field-cu-content.field--items > .field--item',
    '.field--name-field-cu-content > .field--items > .field--item',
  ].join(', ')).each((_index, item) => {
    const heading = normalizeText($(item).find('h3').first().text());
    if (heading && /(?:August|September)/.test(heading)) currentDate = isoArticleDate(heading);
    if (currentDate === '2026-08-29' && !days.some((day) => day.date === currentDate)) {
      days.push({
        date: currentDate,
        status: 'Times and locations provided by NSOP administrators; international first-year students and their families only',
        sessions: [],
      });
    }
    const table = $(item).hasClass('paragraph--type--table')
      ? $(item)
      : $(item).find('.paragraph--type--table').first();
    if (!table.length) return;
    if (!currentDate) throw new Error('NSOP table is missing a date heading');
    const sessions = [];
    table.find('dl').each((_dlIndex, dl) => {
      for (const [label, range] of definitionPairs($, dl)) {
        sessions.push({
          label: cleanName(label),
          ...Object.fromEntries(['open', 'close'].map((key, index) => [key, parseRange(range)[index]])),
        });
      }
    });
    days.push({
      date: currentDate,
      status: currentDate === '2026-09-02' ? 'CUID required' : 'Restricted NSOP service',
      sessions,
    });
  });
  const expected = ['2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03'];
  if (days.length !== expected.length || days.some((day, index) => day.date !== expected[index])) {
    throw new Error('NSOP article must contain six consecutive service dates');
  }
  return {
    id: DINING_ARTICLE_SOURCES.nsop.id,
    name: 'NSOP Dining Service',
    audience: 'Incoming First-Year, Transfer, Combined Plan, and Exchange students, plus students supporting NSOP programming',
    countsAsOpen: false,
    days,
  };
}

export function parseLaborDayArticle(html) {
  const { $, root } = articleRoot(html, 'Labor Day 2026 Operating Hours');
  const fullText = normalizeText(root.text());
  if (!/Friday, September 4\s*-\s*Monday, September 7/i.test(fullText)
    || !/begin on Tuesday, September 8/i.test(fullText)) {
    throw new Error('Labor Day effective range is missing');
  }
  const days = [];
  root.find('.paragraph--type--table').each((_index, table) => {
    const date = isoArticleDate(`${normalizeText($(table).find('h3').first().text())}, 2026`, false);
    const venues = {};
    $(table).find('dl').each((_dlIndex, dl) => {
      const pairs = definitionPairs($, dl);
      const id = venueId(pairs.get('Dining Hall'));
      if (venues[id]) throw new Error(`duplicate Labor Day venue: ${id}`);
      venues[id] = [parseRange(pairs.get('Operating Hours'))];
    });
    days.push({ date, venues });
  });
  const expected = ['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'];
  if (days.length !== expected.length || days.some((day, index) => day.date !== expected[index])) {
    throw new Error('Labor Day article must contain September 4 through 7');
  }
  return { id: DINING_ARTICLE_SOURCES.labor.id, days };
}

export function parseFallArticle(html) {
  const { $, root } = articleRoot(html, 'Fall 2026 Operating Hours');
  if (!/begin on Tuesday, September 8/i.test(normalizeText(root.text()))) {
    throw new Error('Fall 2026 effective date is missing');
  }
  const venues = {};
  root.find('.paragraph--type--table dl').each((_index, dl) => {
    const pairs = definitionPairs($, dl);
    const name = pairs.get('Dining Location') || pairs.get('Dining Location ');
    const hoursText = pairs.get('Fall 2026 Operating Hours');
    if (!name || !hoursText) throw new Error('Fall hours row is malformed');
    const id = venueId(name);
    if (venues[id]) throw new Error(`duplicate Fall venue: ${id}`);
    venues[id] = parseRecurringHours(hoursText, { allowOvernight: id === 'jjs' || id === 'chefmikes' });
  });
  if (Object.keys(venues).length !== 15) throw new Error('Fall article must contain fifteen mapped venues');
  return { id: DINING_ARTICLE_SOURCES.fall.id, start: '2026-09-08', end: '2026-12-23', venues };
}
