#!/usr/bin/env node
/**
 * Seed dining votes — casts VOTE_COUNT fake votes spread randomly
 * across whichever Columbia / Barnard dining halls are currently open.
 *
 * Called by the "Seed dining votes" GitHub Actions workflow on an
 * hourly cron with a random delay (effective interval ≈ 30-90 min).
 */

import { randomBytes } from 'node:crypto';

const API_URL = 'https://lionhour.com/api/dining-vote';
const VOTE_COUNT = 8;

/* ── Schedule data ──────────────────────────────────────────────
   Keyed by JS Date.getDay(): 0 = Sun, 1 = Mon, …, 6 = Sat.
   Each day: array of [open, close] pairs (HH:MM, 24-h).
   When close <= open the interval wraps past midnight.
   Sourced from index.html VENUES (hewitt & diana approximated).
   ────────────────────────────────────────────────────────────── */
const SCHEDULES = {
  johnjay: {
    0: [['09:30','21:00']], 1: [['09:30','21:00']], 2: [['09:30','21:00']],
    3: [['09:30','21:00']], 4: [['09:30','21:00']], 5: null, 6: null,
  },
  ferris: {
    0: [['10:00','14:00'],['16:00','20:00']], 1: [['07:30','20:00']],
    2: [['07:30','20:00']], 3: [['07:30','20:00']], 4: [['07:30','20:00']],
    5: [['07:30','20:00']], 6: [['09:00','20:00']],
  },
  jjs: {
    0: [['12:00','10:00']], 1: [['12:00','10:00']], 2: [['12:00','10:00']],
    3: [['12:00','10:00']], 4: [['12:00','10:00']], 5: [['12:00','10:00']],
    6: [['12:00','10:00']],
  },
  chefmikes: {
    0: [['11:00','02:00']], 1: [['11:00','02:00']], 2: [['11:00','02:00']],
    3: [['11:00','02:00']], 4: [['11:00','02:00']], 5: [['11:00','02:00']],
    6: [['11:00','02:00']],
  },
  chefdons: {
    0: null, 1: [['08:00','19:00']], 2: [['08:00','19:00']],
    3: [['08:00','19:00']], 4: [['08:00','19:00']], 5: [['08:00','19:00']], 6: null,
  },
  gracedodge: {
    0: null, 1: [['11:00','19:30']], 2: [['11:00','19:30']],
    3: [['11:00','19:30']], 4: [['11:00','19:30']], 5: null, 6: null,
  },
  facultyhouse: {
    0: null,
    1: [['07:30','14:30'],['17:00','21:00']], 2: [['07:30','14:30'],['17:00','21:00']],
    3: [['07:30','14:30'],['17:00','21:00']], 4: [['07:30','14:30'],['17:00','21:00']],
    5: null, 6: null,
  },
  facshack: {
    0: [['15:00','20:00']], 1: [['12:00','20:00']], 2: [['12:00','20:00']],
    3: [['12:00','20:00']], 4: [['12:00','20:00']], 5: null, 6: null,
  },
  johnnys: {
    0: [['18:00','22:00']],
    1: [['11:00','15:00']], 2: [['11:00','15:00']], 3: [['11:00','15:00']],
    4: [['11:00','15:00'],['19:00','23:00']], 5: [['11:00','15:00'],['19:00','23:00']],
    6: [['19:00','23:00']],
  },
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

const openHalls = Object.keys(SCHEDULES).filter(id => isOpen(id, et));

if (openHalls.length === 0) {
  console.log('No dining halls open — skipping.');
  process.exit(0);
}

console.log(`Open (${openHalls.length}): ${openHalls.join(', ')}`);

const picks = Array.from({ length: VOTE_COUNT }, () =>
  openHalls[Math.floor(Math.random() * openHalls.length)]);
const dist = {};
for (const h of picks) dist[h] = (dist[h] || 0) + 1;
console.log('Votes:', JSON.stringify(dist));

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
