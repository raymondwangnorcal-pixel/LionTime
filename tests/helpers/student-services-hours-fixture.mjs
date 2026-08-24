import { SOURCE_VENUE_IDS, STUDENT_SERVICES_SOURCE_IDS, STUDENT_SERVICES_SOURCE_URLS, STUDENT_SERVICES_VENUES } from '../../lib/student-services-hours-catalog.js';

function addDays(value, amount) {
  const date = new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10);
}

export function makeStudentServicesVenue(id, start = '2026-08-23') {
  const contract = STUDENT_SERVICES_VENUES[id];
  return { id, name: contract.name, location: contract.location, days: Array.from({ length: 14 }, (_unused, index) => ({
    date: addDays(start, index),
    availabilities: [{ type: id === 'lerner' ? 'open-access' : 'office-hours', intervals: [['09:00', '17:00']], status: null, reason: 'Official hours' }],
    sourceRefs: [contract.sourceId],
    evidenceRefs: [`${contract.sourceId}:${id}:official-hours`],
  })) };
}

export function makeStudentServicesAttemptBatch({ failed = [] } = {}) {
  const generated = '2026-08-23T12:00:00-04:00';
  return {
    schemaVersion: 1, generated, windowStart: '2026-08-23', windowEnd: '2026-09-05',
    attempts: STUDENT_SERVICES_SOURCE_IDS.map(sourceId => failed.includes(sourceId)
      ? { sourceId, sourceUrl: STUDENT_SERVICES_SOURCE_URLS[sourceId], attemptedAt: generated, result: 'failure', failureCode: 'challenge', venues: [] }
      : { sourceId, sourceUrl: STUDENT_SERVICES_SOURCE_URLS[sourceId], attemptedAt: generated, result: 'success', failureCode: null,
          venues: SOURCE_VENUE_IDS[sourceId].map(id => makeStudentServicesVenue(id)) }),
  };
}
