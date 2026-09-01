import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const TIME_ZONE = 'America/New_York';

export function formatNotificationSummary(kind, snapshot, { publishEnabled } = {}) {
  if (!snapshot || typeof snapshot !== 'object') throw new Error('notification snapshot must be an object');
  const timestamp = formatTimestamp(snapshot.generated, kind === 'library');
  const action = publishEnabled ? 'updated' : 'validated';
  const publication = publishEnabled ? '' : ' · publication disabled';

  if (kind === 'library') {
    if (!Array.isArray(snapshot.libraries) || snapshot.libraries.length === 0) throw new Error('library snapshot must include libraries');
    const fallback = snapshot.libraries.filter(library => library?.useEmbeddedFallback === true).length;
    const live = snapshot.libraries.length - fallback;
    return `Library hours ${action}: ${snapshot.generatedDisplay ? displayWithEasternSuffix(snapshot.generatedDisplay) : timestamp}${publication} · ${live} of ${snapshot.libraries.length} live; ${fallback} ${fallback === 1 ? 'library' : 'libraries'} using embedded schedules`;
  }

  if (kind === 'dining' || kind === 'student-life') {
    if (!Array.isArray(snapshot.attempts) || snapshot.attempts.length === 0) throw new Error(`${kind} snapshot must include attempts`);
    const live = snapshot.attempts.filter(attempt => attempt?.result === 'success').length;
    const label = kind === 'dining' ? 'Dining' : 'Student Life';
    const separator = publishEnabled ? ' · ' : '; ';
    return `${label} hours ${action}: ${timestamp}${publication}${separator}${live} of ${snapshot.attempts.length} sources live`;
  }

  if (kind === 'recreation') {
    if (!Array.isArray(snapshot.facilities) || snapshot.facilities.length === 0) throw new Error('recreation snapshot must include facilities');
    const denied = Array.isArray(snapshot.accessDenied) ? snapshot.accessDenied : [];
    const live = snapshot.facilities.length - denied.length;
    let message = `Recreation hours ${action}: ${timestamp}${publication} · ${live} of ${snapshot.facilities.length} live`;
    if (denied.length > 0) {
      message += `\n⚠️ Access denied: ${denied.map(f => f.name).join(', ')}`;
    }
    return message;
  }

  throw new Error(`unsupported notification kind: ${kind}`);
}

function formatTimestamp(value, longMonth = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('notification snapshot must include a valid generated timestamp');
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE,
    month: longMonth ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${formatter.format(date)} ET`;
}

function displayWithEasternSuffix(value) {
  const display = String(value).trim();
  return /\bET$/.test(display) ? display : `${display} ET`;
}

function optionValue(args, option) {
  const index = args.indexOf(option);
  return index === -1 ? null : args[index + 1] || null;
}

async function main() {
  const args = process.argv.slice(2);
  const kind = optionValue(args, '--kind');
  const input = optionValue(args, '--input');
  const publishEnabled = optionValue(args, '--publish-enabled');
  if (!kind || !input || !['true', 'false'].includes(publishEnabled)) {
    throw new Error('usage: node scripts/workflow-notification-summary.mjs --kind <library|dining|recreation|student-life> --input <path> --publish-enabled <true|false>');
  }
  const snapshot = JSON.parse(await readFile(input, 'utf8'));
  process.stdout.write(`${formatNotificationSummary(kind, snapshot, { publishEnabled: publishEnabled === 'true' })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    process.stderr.write(`Workflow notification summary failed: ${error.message}\n`);
    process.exitCode = 1;
  });
}
