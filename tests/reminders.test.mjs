import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { dueReminders, easternDate, formatReminders } from '../scripts/reminders-due.mjs';

test('only reminders dated today (Eastern) are due, and malformed entries are ignored', () => {
  const reminders = [
    { date: '2026-09-24', text: 'Plan check-in' },
    { date: '2026-09-25', text: 'Tomorrow' },
    { date: '2026-09-24' },
    null,
  ];
  assert.deepEqual(dueReminders(reminders, '2026-09-24').map(item => item.text), ['Plan check-in']);
  assert.deepEqual(dueReminders(reminders, '2026-09-23'), []);
  assert.equal(formatReminders([], '2026-09-23'), '');
  assert.match(formatReminders(dueReminders(reminders, '2026-09-24'), '2026-09-24'), /^Reminder for 2026-09-24:\n\nPlan check-in$/);
});

test('the Eastern date rolls over at midnight New York time, not UTC', () => {
  assert.equal(easternDate(new Date('2026-09-24T03:30:00Z')), '2026-09-23');
  assert.equal(easternDate(new Date('2026-09-24T04:30:00Z')), '2026-09-24');
});

test('the committed reminders file is well formed and the workflow sends only when something is due', async () => {
  const parsed = JSON.parse(await readFile('.github/reminders.json', 'utf8'));
  assert.ok(Array.isArray(parsed.reminders));
  for (const item of parsed.reminders) {
    assert.match(item.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(item.text.trim().length > 0);
  }
  const workflow = await readFile('.github/workflows/reminders.yml', 'utf8');
  assert.match(workflow, /cron: '0 13 \* \* \*'/);
  assert.match(workflow, /if: steps\.due\.outputs\.count != '0'/);
  assert.match(workflow, /secrets\.LIONTIME_TELEGRAM_BOT_TOKEN/);
  assert.match(workflow, /permissions:\n  contents: read/);
});
