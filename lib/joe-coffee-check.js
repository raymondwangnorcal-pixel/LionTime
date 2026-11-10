/**
 * Joe Coffee's three campus cafés have no live hours pipeline: their weekly hours are typed
 * into VENUES in index.html. They were entered in August 2026 and nothing noticed if Joe
 * changed them. This compares what Joe's own location pages say with what LionHour shows,
 * so the hours audit can report drift instead of serving it.
 *
 * Joe's pages are plain Shopify HTML with a "Cafe Hours" block such as
 *   Monday - Friday: 7:00AM - 7:00PM
 *   Saturday - Sunday: CLOSED
 * Anything else (a renamed heading, a day missing, an unreadable time) is reported as
 * unreadable rather than guessed at.
 */

export const JOE_COFFEE_PAGES = Object.freeze({
  'joe-noco': 'https://joecoffeecompany.com/pages/columbia-northwest-corner-building',
  'joe-journalism': 'https://joecoffeecompany.com/pages/columbia-pulitzer-hall',
  'joe-dodge': 'https://joecoffeecompany.com/pages/columbia-dodge-hall',
});

const DAY_NUMBERS = Object.freeze({
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
});
const DAY_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function pageText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(?:p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ');
}

function to24(hour, minute, meridiem) {
  let value = Number(hour) % 12;
  if (/p/i.test(meridiem)) value += 12;
  return `${String(value).padStart(2, '0')}:${minute || '00'}`;
}

function dayRange(text) {
  const names = text.toLowerCase().match(/[a-z]+/g) || [];
  const days = names.filter(name => name in DAY_NUMBERS);
  if (days.length === 1) return [days[0]];
  if (days.length !== 2) return null;
  const start = DAY_ORDER.indexOf(days[0]);
  const end = DAY_ORDER.indexOf(days[1]);
  if (start > end) return null;
  return DAY_ORDER.slice(start, end + 1);
}

/** @returns {Record<string, Array<[string, string]> | null> | null} weekday number → intervals (null = closed) */
export function parseJoeCafeHours(html) {
  const text = pageText(html);
  const start = text.search(/Cafe Hours/i);
  if (start === -1) return null;
  const block = text.slice(start, start + 600);
  const weekly = {};
  const line = /((?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day(?:\s*[-–]\s*(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day)?)\s*:\s*(CLOSED|(\d{1,2})(?::(\d{2}))?\s*([AP]M)\s*[-–]\s*(\d{1,2})(?::(\d{2}))?\s*([AP]M))/gi;
  for (const match of block.matchAll(line)) {
    const days = dayRange(match[1]);
    if (!days) return null;
    const hours = /^closed$/i.test(match[2])
      ? null
      : [[to24(match[3], match[4], match[5]), to24(match[6], match[7], match[8])]];
    if (hours && hours[0][0] >= hours[0][1]) return null;
    for (const day of days) weekly[DAY_NUMBERS[day]] = hours;
  }
  return Object.keys(weekly).length === 7 ? weekly : null;
}

const describe = hours => (hours?.length ? hours.map(([open, close]) => `${open}–${close}`).join(', ') : 'closed');
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Compare one café's published hours against the catalog's weeklyHours. */
export function compareJoeHours(id, published, catalogWeekly) {
  if (!published) return [{ kind: 'unreadable', id, detail: `could not read the Cafe Hours block on ${JOE_COFFEE_PAGES[id]}` }];
  const differences = [];
  for (let day = 0; day < 7; day += 1) {
    const ours = describe(catalogWeekly?.[day] ?? catalogWeekly?.[String(day)]);
    const theirs = describe(published[day]);
    if (ours !== theirs) differences.push(`${DAY_LABELS[day]} LionHour ${ours} vs Joe ${theirs}`);
  }
  return differences.length
    ? [{ kind: 'drift', id, detail: `${differences.join('; ')} — update VENUES in index.html` }]
    : [];
}

export async function checkJoeCoffee(catalogById, { fetchImpl = globalThis.fetch } = {}) {
  const findings = [];
  for (const [id, url] of Object.entries(JOE_COFFEE_PAGES)) {
    let html = null;
    try {
      const response = await fetchImpl(url, { headers: { 'User-Agent': 'LionHour hours audit (+https://lionhour.com)' } });
      html = response.ok ? await response.text() : null;
    } catch {
      html = null;
    }
    findings.push(...compareJoeHours(id, html ? parseJoeCafeHours(html) : null, catalogById[id]?.weeklyHours));
  }
  return { category: 'joe-coffee', findings };
}
