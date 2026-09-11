#!/usr/bin/env node
/**
 * Pick the reminders in .github/reminders.json that fall due today (America/New_York)
 * and hand them to the workflow as one Telegram message. No secrets here; the
 * workflow does the sending.
 *
 *   node scripts/reminders-due.mjs [--file .github/reminders.json] [--today YYYY-MM-DD]
 *
 * Writes `count` and `message` to $GITHUB_OUTPUT when set; always prints the message.
 */

import { appendFile, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function easternDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** Reminders whose date is today. Malformed entries are ignored rather than fatal. */
export function dueReminders(reminders, today) {
  return (Array.isArray(reminders) ? reminders : [])
    .filter(item => item && typeof item.text === 'string' && item.text.trim() && item.date === today);
}

export function formatReminders(due, today) {
  if (!due.length) return '';
  const header = `Reminder for ${today}:`;
  return [header, ...due.map(item => item.text.trim())].join('\n\n');
}

function arg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main() {
  const file = arg('--file', '.github/reminders.json');
  const today = arg('--today', easternDate());
  const parsed = JSON.parse(await readFile(file, 'utf8'));
  const due = dueReminders(parsed.reminders, today);
  const message = formatReminders(due, today);
  process.stdout.write(message ? `${message}\n` : `no reminders due on ${today}\n`);
  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `EOF_${Date.now()}`;
    await appendFile(process.env.GITHUB_OUTPUT, [`count=${due.length}`, `message<<${delimiter}`, message, delimiter, ''].join('\n'));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`reminders: ${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
