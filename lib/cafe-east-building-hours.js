/**
 * Café East is "open to the public during building hours" — it sits inside Lerner Hall —
 * but its own page only lists a weekly schedule. Over Thanksgiving 2026 Lerner was closed
 * Thursday to Saturday while LionHour showed Café East open all three days.
 *
 * Lerner's dated hours already arrive through the Student Life feed, so the Dining API
 * limits Café East to them when it serves a snapshot: a day Lerner is closed reads closed,
 * and an open day is clipped to the building's hours. Days Lerner says nothing about, or a
 * Student Life snapshot that is too old to trust, leave Café East exactly as published.
 */

export const CAFE_EAST_ID = 'cafe-east';
export const LERNER_ID = 'lerner';
export const LERNER_CLOSED_STATUS = 'Closed while Lerner Hall is closed';
export const MAX_LERNER_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const toMinutes = value => {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
};
const toClock = minutes => (minutes === 1440 ? '24:00'
  : `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`);

/** date → { open: [[start, end], ...] (minutes), closed: boolean } from a Student Life snapshot. */
export function lernerDaysFromStudentServices(snapshot, now = new Date(), maxAgeMs = MAX_LERNER_AGE_MS) {
  const days = new Map();
  const source = (snapshot?.sources || []).find(item => (item.venues || []).some(venue => venue.id === LERNER_ID));
  if (!source) return days;
  const success = Date.parse(source.lastSuccessAt);
  if (Number.isNaN(success) || now.getTime() - success > maxAgeMs) return days;
  const lerner = source.venues.find(venue => venue.id === LERNER_ID);
  for (const day of lerner.days || []) {
    const access = (day.availabilities || []).filter(item => item.type === 'open-access');
    if (!access.length) continue;
    const open = access.flatMap(item => item.intervals || []).map(([start, end]) => [toMinutes(start), toMinutes(end)]);
    const closed = !open.length && access.some(item => /^closed\b/i.test(item.status || ''));
    if (!open.length && !closed) continue;
    days.set(day.date, { open, closed });
  }
  return days;
}

function clipDay(day, lerner) {
  if (!lerner || !Array.isArray(day?.intervals)) return day;
  if (lerner.closed) {
    return day.intervals.length || day.status !== LERNER_CLOSED_STATUS
      ? { ...day, intervals: [], status: LERNER_CLOSED_STATUS }
      : day;
  }
  const clipped = [];
  for (const [start, end] of day.intervals) {
    const from = toMinutes(start);
    const to = end === '24:00' ? 1440 : toMinutes(end);
    for (const [openFrom, openTo] of lerner.open) {
      const lo = Math.max(from, openFrom);
      const hi = Math.min(to, openTo);
      if (lo < hi) clipped.push([toClock(lo), toClock(hi)]);
    }
  }
  clipped.sort(([left], [right]) => left.localeCompare(right));
  if (JSON.stringify(clipped) === JSON.stringify(day.intervals)) return day;
  return clipped.length ? { ...day, intervals: clipped } : { ...day, intervals: [], status: LERNER_CLOSED_STATUS };
}

/** Returns a copy of a public Dining snapshot with Café East limited to Lerner's hours. */
export function applyLernerHoursToCafeEast(snapshot, lernerDays) {
  if (!snapshot || !Array.isArray(snapshot.locations) || !lernerDays?.size) return snapshot;
  let changed = false;
  const locations = snapshot.locations.map((location) => {
    if (location.id !== CAFE_EAST_ID) return location;
    const days = location.days.map(day => clipDay(day, lernerDays.get(day.date)));
    const previousDay = location.previousDay ? clipDay(location.previousDay, lernerDays.get(location.previousDay.date)) : undefined;
    if (days.some((day, index) => day !== location.days[index]) || previousDay !== location.previousDay) {
      changed = true;
      return previousDay === undefined ? { ...location, days } : { ...location, days, previousDay };
    }
    return location;
  });
  return changed ? { ...snapshot, locations } : snapshot;
}
