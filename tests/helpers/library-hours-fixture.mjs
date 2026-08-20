const identities = {
  avery: 'avery',
  business: 'business',
  butler_24: 'butler-24',
  lehman: 'lehman',
  math: 'math',
  science_engineering: 'science-engineering',
};

export function makeValidSnapshot() {
  return {
    schemaVersion: 1,
    generated: '2026-08-20T12:00:00-04:00',
    generatedDisplay: 'August 20, 2026 at 12:00 PM',
    libraries: Object.entries(identities).map(([id, slug]) => ({
      id,
      name: id,
      url: `https://hours.library.columbia.edu/locations/${slug}`,
      note: null,
      temporarilyClosed: false,
      schedules: [{
        label: 'Current',
        start: '2026-08-16',
        end: '2026-08-22',
        hours: {
          0: null,
          1: { open: '09:00', close: '21:00' },
          2: { open: '09:00', close: '21:00' },
          3: { open: '09:00', close: '21:00' },
          4: { open: '09:00', close: '21:00' },
          5: { open: '09:00', close: '19:00' },
          6: { open: '11:00', close: '18:00' },
        },
      }],
    })),
  };
}
