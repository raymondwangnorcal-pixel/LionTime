export const RECREATION_SOURCE_URLS = Object.freeze({
  columbiaHours: 'https://perec.columbia.edu/hours-operation',
  columbiaModifications: 'https://perec.columbia.edu/content/modified-hours-closures',
  barnardFitness: 'https://barnard.edu/lefrak-center/physical-well-being',
});

export const RECREATION_FACILITIES = Object.freeze({
  dodge: Object.freeze({ name: 'Dodge Fitness Center', kind: 'facility' }),
  'uris-pool': Object.freeze({ name: 'Uris Pool', kind: 'facility', parentId: 'dodge' }),
  'barnard-fitness': Object.freeze({ name: 'Barnard Fitness Center', kind: 'facility' }),
});

export const DODGE_SPACES = Object.freeze({
  'blue-gym': Object.freeze({ name: 'Blue Gym' }),
  'levien-gymnasium': Object.freeze({ name: 'Levien Gymnasium' }),
  'functional-fitness-studio': Object.freeze({ name: 'Functional Fitness Studio' }),
  'aerobics-room-4': Object.freeze({ name: 'Aerobics Room 4' }),
  'squash-courts': Object.freeze({ name: 'Squash Courts' }),
});
