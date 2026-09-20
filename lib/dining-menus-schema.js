/**
 * Validate a dining menus snapshot before it is allowed to replace the published one.
 *
 * Menus moved off `git push` on 2026-09-20. A repository ruleset requiring pull requests
 * started rejecting the workflow's commit at 16:30 UTC on 2026-09-18; the scrape kept
 * succeeding, the job kept failing at the push, and the site served the menus of
 * 2026-09-18 for two days. Publishing to the API removes the commit, and with it the
 * only thing that used to stop a bad scrape from reaching the site — the push failing.
 * That guard now lives here: a snapshot with no venues, or with venues that carry no
 * meals at all, is refused and the last good one stays up.
 */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MEAL_SLUGS = new Set(['breakfast', 'lunch', 'dinner', 'late-night']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateDiningMenusSnapshot(value) {
  const errors = [];
  if (!isRecord(value)) return { ok: false, errors: ['snapshot must be an object'] };

  if (value.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  if (typeof value.generated !== 'string' || Number.isNaN(Date.parse(value.generated))) {
    errors.push('generated must be an ISO timestamp');
  }
  if (!ISO_DATE.test(value.date || '')) errors.push('date must be YYYY-MM-DD');
  if (typeof value.source !== 'string' || !value.source) errors.push('source must name where the menus came from');
  if (value.unavailable !== undefined && !Array.isArray(value.unavailable)) {
    errors.push('unavailable must be an array when present');
  }

  if (!isRecord(value.venues) || Object.keys(value.venues).length === 0) {
    errors.push('venues must list at least one venue');
    return { ok: false, errors };
  }

  let mealCount = 0;
  for (const [id, venue] of Object.entries(value.venues)) {
    if (!isRecord(venue) || !isRecord(venue.meals)) {
      errors.push(`venues.${id} must carry a meals object`);
      continue;
    }
    for (const [meal, body] of Object.entries(venue.meals)) {
      if (!MEAL_SLUGS.has(meal)) errors.push(`venues.${id}.meals.${meal} is not a known meal`);
      else if (!isRecord(body)) errors.push(`venues.${id}.meals.${meal} must be an object`);
      else mealCount += 1;
    }
  }
  // A day on which every hall is closed is legitimate; a day on which no hall published
  // any meal at all is a scrape that saw nothing, and must not overwrite a good snapshot.
  if (mealCount === 0) errors.push('no venue published a single meal; refusing to replace the last good snapshot');

  return errors.length ? { ok: false, errors } : { ok: true, value };
}
