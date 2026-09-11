#!/usr/bin/env node
/**
 * Render what the (patched) parser actually produces for a fixture, as a Markdown
 * table for the autofix PR body (docs/automated-fix.md §5). A human can run it
 * locally with the same arguments:
 *
 *   node scripts/autofix-values-table.mjs --source health --fixture tests/fixtures/student-services-health-2026-09-11.html
 *
 * The table is generated from the parser's output, never written by the model (R4).
 * Shapes handled: student-services evidence rows, recreation evidence rows, dining
 * article payloads, Café East, the Dining locations feed, Barnard rendered weeks.
 * Anything else falls back to a bounded JSON dump so the reviewer still sees values.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { AUTOFIX_SOURCES } from '../lib/autofix-sources.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function weekdayLabel(days) {
  const list = (days || []).map(Number).filter(day => day >= 0 && day <= 6).sort();
  if (!list.length) return '—';
  if (list.length === 7) return 'Every day';
  const contiguous = list.every((day, index) => index === 0 || day === list[index - 1] + 1);
  return contiguous && list.length > 2 ? `${WEEKDAYS[list[0]]}–${WEEKDAYS[list.at(-1)]}` : list.map(day => WEEKDAYS[day]).join(', ');
}

function intervalsLabel(intervals) {
  if (!Array.isArray(intervals) || !intervals.length) return 'Closed';
  return intervals.map(pair => Array.isArray(pair) ? pair.join('–') : String(pair)).join(', ');
}

function groupWeekdays(byWeekday) {
  // byWeekday: { '0': intervals, … } → rows grouped by identical hours
  const groups = new Map();
  for (const [day, intervals] of Object.entries(byWeekday || {})) {
    const key = intervalsLabel(intervals);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(Number(day));
  }
  return [...groups.entries()].map(([hours, days]) => ({ days, hours }));
}

function esc(value) {
  return String(value ?? '—').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function table(headers, rows) {
  if (!rows.length) return '_The parser returned no rows._';
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(esc).join(' | ')} |`),
  ].join('\n');
}

export function renderValues(sourceId, output) {
  if (Array.isArray(output) && !output.length) return table([], []);
  // Student-services / recreation evidence rows
  if (Array.isArray(output) && output.every(item => item && typeof item === 'object' && 'targetId' in item)) {
    const rows = [];
    for (const item of output) {
      const effective = item.exactDate || (item.effectiveStart || item.effectiveEnd
        ? `${item.effectiveStart || '…'} → ${item.effectiveEnd === '9999-12-31' ? 'open-ended' : (item.effectiveEnd || '…')}` : '—');
      if (Array.isArray(item.weekdays) || Array.isArray(item.intervals)) {
        rows.push([item.targetId, item.type || item.availabilityType || '—', weekdayLabel(item.weekdays), item.status || intervalsLabel(item.intervals), effective]);
      }
      if (item.weeklyIntervals) {
        for (const group of groupWeekdays(item.weeklyIntervals)) rows.push([item.targetId, item.availabilityType || item.type || '—', weekdayLabel(group.days), group.hours, effective]);
      }
      if (Array.isArray(item.dateIntervals)) {
        for (const entry of item.dateIntervals) rows.push([item.targetId, item.availabilityType || item.type || '—', entry.date, item.status || intervalsLabel(entry.intervals), entry.date]);
      }
      if (!Array.isArray(item.weekdays) && !Array.isArray(item.intervals) && !item.weeklyIntervals && !Array.isArray(item.dateIntervals)) {
        rows.push([item.targetId, item.type || item.availabilityType || '—', '—', item.status || '—', effective]);
      }
    }
    return table(['Target', 'Access', 'Weekdays', 'Hours', 'Effective'], rows);
  }
  // Dining article payload { id, start, end, venues: { venue: { weekday: intervals } } } or { days: [...] }
  if (output && typeof output === 'object' && output.venues && !Array.isArray(output.venues)) {
    const rows = [];
    for (const [venue, byWeekday] of Object.entries(output.venues)) {
      for (const group of groupWeekdays(byWeekday)) rows.push([venue, weekdayLabel(group.days), group.hours, `${output.start || '…'} → ${output.end || '…'}`]);
    }
    return table(['Venue', 'Weekdays', 'Hours', 'Effective'], rows);
  }
  if (output && Array.isArray(output.days)) {
    const rows = [];
    for (const day of output.days) for (const [venue, intervals] of Object.entries(day.venues || {})) rows.push([venue, day.date, intervalsLabel(intervals)]);
    return table(['Venue', 'Date', 'Hours'], rows);
  }
  // Café East { id, name, weekdays: { '0': intervals } }
  if (output && typeof output === 'object' && output.weekdays && !Array.isArray(output.weekdays)) {
    return table(['Venue', 'Weekdays', 'Hours'], groupWeekdays(output.weekdays).map(group => [output.name || output.id || sourceId, weekdayLabel(group.days), group.hours]));
  }
  // Barnard rendered week { weekStart, venues: { venue: { date: intervals } } } or similar date maps
  if (output && typeof output === 'object' && output.weekStart) {
    const rows = [];
    for (const [venue, byDate] of Object.entries(output.venues || output.days || {})) {
      for (const [date, intervals] of Object.entries(byDate || {})) rows.push([venue, date, intervalsLabel(intervals)]);
    }
    if (rows.length) return table(['Venue', 'Date', 'Hours'], rows);
  }
  const json = JSON.stringify(output, null, 2) || 'undefined';
  return `_No table renderer for this shape; parser output (truncated):_\n\n\`\`\`json\n${json.slice(0, 6000)}${json.length > 6000 ? '\n…' : ''}\n\`\`\``;
}

async function runParser(sourceId, fixturePath, root) {
  const entry = AUTOFIX_SOURCES[sourceId];
  if (!entry) throw new Error(`unknown source ${sourceId}`);
  if (entry.parserKind === 'python') {
    return { note: 'Library parsers are Python; see the `tests/test_scrape.py` run in the PR checks for the parsed values.' };
  }
  const module = await import(pathToFileURL(path.join(root, entry.parserFile)).href);
  const parser = module[entry.parserExport];
  if (typeof parser !== 'function') throw new Error(`${entry.parserFile} does not export ${entry.parserExport}`);
  const raw = await readFile(fixturePath, 'utf8');
  switch (entry.parserKind) {
    case 'json-string': return parser(raw);
    case 'json-or-text': return parser(raw.trimStart().startsWith('{') ? JSON.parse(raw) : raw);
    case 'lerner': return parser(raw.trimStart().startsWith('{') ? JSON.parse(raw) : { homeHtml: raw, calendarHtml: raw });
    case 'text': return parser(raw);
    default: return parser(raw, { generated: new Date() });
  }
}

function arg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sourceId = arg('--source');
  const fixture = arg('--fixture');
  if (!sourceId || !fixture) {
    console.error('usage: node scripts/autofix-values-table.mjs --source <sourceId> --fixture <path>');
    process.exit(2);
  }
  try {
    const output = await runParser(sourceId, fixture, process.cwd());
    if (output && output.note) console.log(output.note);
    else console.log(renderValues(sourceId, output));
  } catch (error) {
    console.log(`_The patched parser threw on the new fixture: ${String(error?.message || error).slice(0, 300)}_`);
    process.exitCode = 1;
  }
}
