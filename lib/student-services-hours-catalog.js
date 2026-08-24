export const STUDENT_SERVICES_SOURCE_IDS = Object.freeze([
  'bookstore', 'health', 'lerner', 'mail',
]);

export const STUDENT_SERVICES_SOURCE_URLS = Object.freeze({
  bookstore: 'https://columbia.bncollege.com/',
  health: 'https://www.health.columbia.edu/content/hours-and-locations',
  lerner: 'https://lernerhall.columbia.edu/',
  mail: 'https://mailservices.columbia.edu/content/locations-hours',
});

export const STUDENT_SERVICES_VENUES = Object.freeze({
  'alice-health': Object.freeze({ sourceId: 'health', name: 'Alice! Health Promotion', location: 'John Jay Hall, 3rd Floor' }),
  bookstore: Object.freeze({ sourceId: 'bookstore', name: 'Columbia University Bookstore', location: 'Lerner Hall, Lower Level' }),
  caps: Object.freeze({ sourceId: 'health', name: 'Counseling and Psychological Services', location: 'Lerner Hall, 8th Floor' }),
  disability: Object.freeze({ sourceId: 'health', name: 'Disability Services', location: 'Wien Hall, Suite 108A' }),
  immunization: Object.freeze({ sourceId: 'health', name: 'Immunization Compliance Office', location: 'John Jay Hall, 3rd Floor' }),
  lerner: Object.freeze({ sourceId: 'lerner', name: 'Alfred Lerner Hall', location: '2920 Broadway' }),
  'mail-center': Object.freeze({ sourceId: 'mail', name: 'Student Mail Center (Wein)', location: 'Wien Hall, Lower Level' }),
  medical: Object.freeze({ sourceId: 'health', name: 'Medical Services', location: 'John Jay Hall, 4th Floor' }),
  'student-insurance': Object.freeze({ sourceId: 'health', name: 'Student Health Insurance Office', location: 'John Jay Hall, 3rd Floor' }),
  svr: Object.freeze({ sourceId: 'health', name: 'Sexual Violence Response', location: 'Lerner Hall, Suite 700' }),
});

export const SOURCE_VENUE_IDS = Object.freeze(Object.fromEntries(
  STUDENT_SERVICES_SOURCE_IDS.map(sourceId => [sourceId, Object.freeze(
    Object.entries(STUDENT_SERVICES_VENUES)
      .filter(([, venue]) => venue.sourceId === sourceId)
      .map(([venueId]) => venueId)
      .sort(),
  )]),
));

export const ACCESS_TYPES = Object.freeze([
  'appointment-only', 'office-hours', 'open-access', 'phone-support', 'virtual-only', 'walk-in',
]);

export const SOURCE_FAILURE_CODES = Object.freeze([
  'ambiguous', 'challenge', 'missing-content', 'navigation', 'parse', 'unexpected',
]);

export function venueContract(venueId) {
  return STUDENT_SERVICES_VENUES[venueId] || null;
}
