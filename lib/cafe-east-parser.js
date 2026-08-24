const TIME = String.raw`(\d{1,2}(?::\d{2})?\s*[ap]\.?(?:m)\.?)`;

function normalizeTime(value) {
  const match = String(value).trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (!match) throw new Error(`invalid Café East time: ${value}`);
  const hour = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour < 1 || hour > 12 || minute > 59) throw new Error(`invalid Café East time: ${value}`);
  const normalizedHour = (hour % 12) + (match[3].toLowerCase() === 'p' ? 12 : 0);
  return `${String(normalizedHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function minutes(value) {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}

function parseRange(text, pattern, label) {
  const match = text.match(pattern);
  if (!match) throw new Error(`Café East ${label} hours are missing`);
  const interval = [normalizeTime(match[1]), normalizeTime(match[2])];
  if (minutes(interval[1]) <= minutes(interval[0])) {
    throw new Error(`Café East ${label} hours must increase`);
  }
  return interval;
}

export function parseCafeEastPage(raw) {
  if (typeof raw !== 'string') throw new Error('Café East page must be text');
  const text = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!/Café East/i.test(text)
    || !/Open to the public during building hours/i.test(text)
    || !/Location:\s*2E\b/i.test(text)) {
    throw new Error('Café East official identity is missing');
  }

  const weekday = parseRange(
    text,
    new RegExp(String.raw`Monday\s*[-–—]\s*Friday\s+${TIME}\s*[-–—]\s*${TIME}`, 'i'),
    'weekday',
  );
  const weekend = parseRange(
    text,
    new RegExp(String.raw`Saturday\s*(?:&|and)\s*Sunday\s+${TIME}\s*[-–—]\s*${TIME}`, 'i'),
    'weekend',
  );

  return {
    id: 'cafe-east',
    name: 'Café East',
    location: 'Lerner Hall, Room 2E',
    weekdays: {
      0: [weekend],
      1: [weekday],
      2: [weekday],
      3: [weekday],
      4: [weekday],
      5: [weekday],
      6: [weekend],
    },
  };
}
