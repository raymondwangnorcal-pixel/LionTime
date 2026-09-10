#!/usr/bin/env node
/**
 * Seed dining votes — casts a time-of-day-dependent number of fake votes,
 * spread by popularity across whichever Columbia / Barnard dining halls
 * are currently open.
 *
 * Called by the "Seed dining votes" GitHub Actions workflow on an
 * hourly cron with a random delay (effective interval ≈ 30-90 min).
 *
 * Set DRY_RUN=1 to print the picks without hitting the API.
 */

import { randomBytes } from 'node:crypto';
import { venuesWithHours } from '../lib/venue-catalog.generated.mjs';

const API_URL = 'https://lionhour.com/api/dining-vote';
const DRY_RUN = process.env.DRY_RUN === '1';

/** Votes per run by Eastern hour — mirrors when people actually poll.
    Nobody is voting at 1 AM, so overnight runs cast nothing. */
function votesForHour(hour) {
  if (hour < 7) return 0;        // overnight — skip
  if (hour < 11) return 3;       // breakfast
  if (hour < 15) return 8;       // lunch peak
  if (hour < 17) return 4;       // afternoon lull
  if (hour < 21) return 8;       // dinner peak
  return 2;                      // late night
}

/* ── Schedule data ──────────────────────────────────────────────
   Derived from the VENUES array in index.html via the generated catalog
   (DEC-0069) — dining venues that carry a fixed weekly schedule. Keyed by
   JS Date.getDay(): 0 = Sun … 6 = Sat; each day is [[open, close], …]
   in HH:MM, close <= open wrapping past midnight.
   ────────────────────────────────────────────────────────────── */
/* Barnard halls load their hours live and have no fixed schedule in VENUES.
   Approximate them here so they still receive a share of seeded votes. */
const LIVE_ONLY_APPROXIMATIONS = {
  hewitt: {
    0: [['09:00','21:00']], 1: [['07:00','21:00']], 2: [['07:00','21:00']],
    3: [['07:00','21:00']], 4: [['07:00','21:00']], 5: [['07:00','21:00']],
    6: [['09:00','20:00']],
  },
  'diana-center-cafe': {
    0: null, 1: [['08:00','20:00']], 2: [['08:00','20:00']],
    3: [['08:00','20:00']], 4: [['08:00','20:00']], 5: [['08:00','17:00']], 6: null,
  },
};

const SCHEDULES = {
  ...Object.fromEntries(venuesWithHours('dining').map(v => [v.id, v.weeklyHours])),
  ...LIVE_ONLY_APPROXIMATIONS,
};

/** Per-hall weight multiplier (default 1.0) — a popularity prior.
    Without this the spread is uniform across whatever is open, which lets
    the two late-night halls (JJ's, Chef Mike's) out-vote John Jay and
    Ferris simply by being open when nothing else is. */
const WEIGHTS = {
  johnjay: 1.5,
  ferris: 1.5,
  jjs: 0.3,
  chefmikes: 0.4,
};

/* ── Helpers ─────────────────────────────────────────────────── */

function toMin(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Return { jsDay (0-6), minutes (0-1439) } in America/New_York. */
function etNow(now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short', hour: 'numeric', minute: 'numeric', hour12: false,
  });
  const p = {};
  for (const { type, value } of fmt.formatToParts(now)) p[type] = value;
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { jsDay: dayMap[p.weekday], dayName: p.weekday,
           minutes: parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10) };
}

function isOpen(hallId, { jsDay, minutes }) {
  const sched = SCHEDULES[hallId];
  if (!sched) return false;

  // Check today's intervals
  const today = sched[jsDay];
  if (today) {
    for (const [open, close] of today) {
      const o = toMin(open), c = toMin(close);
      if (c > o) {                       // same-day interval
        if (minutes >= o && minutes < c) return true;
      } else {                           // overnight: open → midnight
        if (minutes >= o) return true;
      }
    }
  }

  // Check yesterday's overnight carry-over (close portion after midnight)
  const yDay = (jsDay + 6) % 7;
  const yesterday = sched[yDay];
  if (yesterday) {
    for (const [open, close] of yesterday) {
      const o = toMin(open), c = toMin(close);
      if (c <= o && minutes < c) return true;   // still in yesterday's overnight window
    }
  }

  return false;
}

function weightedPick(halls) {
  const weights = halls.map(h => WEIGHTS[h] ?? 1);
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < halls.length; i++) {
    r -= weights[i];
    if (r <= 0) return halls[i];
  }
  return halls[halls.length - 1];
}

function randomFP() {
  return randomBytes(32).toString('hex');
}

async function castVote(fp, hallId) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fp, hallId }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/* ── Main ────────────────────────────────────────────────────── */

const et = etNow();
const hh = String(Math.floor(et.minutes / 60)).padStart(2, '0');
const mm = String(et.minutes % 60).padStart(2, '0');
console.log(`ET: ${et.dayName} ${hh}:${mm}`);

const VOTE_COUNT = votesForHour(Math.floor(et.minutes / 60));
if (VOTE_COUNT === 0) {
  console.log('Overnight — no votes this run.');
  process.exit(0);
}

const openHalls = Object.keys(SCHEDULES).filter(id => isOpen(id, et));

if (openHalls.length === 0) {
  console.log('No dining halls open — skipping.');
  process.exit(0);
}

console.log(`Open (${openHalls.length}): ${openHalls.join(', ')}`);

const picks = Array.from({ length: VOTE_COUNT }, () => weightedPick(openHalls));
const dist = {};
for (const h of picks) dist[h] = (dist[h] || 0) + 1;
console.log(`Votes (${VOTE_COUNT}):`, JSON.stringify(dist));

if (DRY_RUN) {
  console.log('DRY_RUN — nothing sent.');
  process.exit(0);
}

let ok = 0;
for (const hallId of picks) {
  try {
    await castVote(randomFP(), hallId);
    ok++;
  } catch (err) {
    console.error(`✗ ${hallId}: ${err.message}`);
  }
}
console.log(`Done — ${ok}/${VOTE_COUNT} votes cast.`);
