import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

test('reusable Telegram sender has scoped inputs, secrets, and delivery safeguards', () => {
  const workflow = fs.readFileSync(new URL('../.github/workflows/send-telegram-update.yml', import.meta.url), 'utf8');
  assert.match(workflow, /on:\n  workflow_call:/);
  assert.match(workflow, /source_label:|conclusion:|summary:|run_url:/);
  assert.match(workflow, /telegram_bot_token:|telegram_chat_id:/);
  assert.match(workflow, /permissions: \{\}/);
  assert.doesNotMatch(workflow, /actions\/checkout|hermes/i);
  assert.match(workflow, /--fail-with-body/);
  assert.match(workflow, /--retry 3 --retry-all-errors/);
  assert.match(workflow, /--data-urlencode "text=/);
  assert.match(workflow, /cancelled|skipped|failure/);
  assert.match(workflow, /run_url/);
});
