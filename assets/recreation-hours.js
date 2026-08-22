(function exposeRecreationHours(global) {
  const SOURCE_MANIFEST = Object.freeze({
    columbiaHours: 'https://perec.columbia.edu/hours-operation',
    columbiaModifications: 'https://perec.columbia.edu/content/modified-hours-closures',
    barnardFitness: 'https://barnard.edu/lefrak-center/physical-well-being',
  });
  const FACILITIES = Object.freeze({
    dodge: { name: 'Dodge Fitness Center', kind: 'facility', parentId: null },
    'uris-pool': { name: 'Uris Pool', kind: 'facility', parentId: 'dodge' },
    'barnard-fitness': { name: 'Barnard Fitness Center', kind: 'facility', parentId: null },
  });
  const SPACES = Object.freeze({
    'blue-gym': 'Blue Gym',
    'levien-gymnasium': 'Levien Gymnasium',
    'functional-fitness-studio': 'Functional Fitness Studio',
    'aerobics-room-4': 'Aerobics Room 4',
    'squash-courts': 'Squash Courts',
  });
  const STATUS_VALUES = new Set([
    'Open', 'Closing soon', 'Closed', 'Closed for maintenance',
    'Closed for Athletics event', 'Reservation required',
    'Separate hours not published', 'Hours need verification',
  ]);
  const AVAILABILITY_TYPES = new Set([
    'facility-hours', 'open-recreation', 'lap-swim', 'recreation-swim', 'reservation-required',
  ]);
  const OFFICIAL_SOURCES = new Set(Object.keys(SOURCE_MANIFEST));
  const COLUMBIA_SOURCES = new Set(['columbiaHours', 'columbiaModifications']);
  const OPEN_TIME = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  const CLOSE_TIME = /^(?:(?:[01]\d|2[0-3]):[0-5]\d|24:00)$/;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
  const TIMEZONE_AWARE_ISO = /(?:Z|[+-]\d{2}:\d{2})$/;
  const MAX_TEXT_LENGTH = 200;
  const UNAVAILABLE_STATUSES = new Set(['Separate hours not published', 'Hours need verification']);
  const RESTRICTION_STATUS_VALUES = new Set([
    'Closed', 'Closed for maintenance', 'Closed for Athletics event', 'Reservation required',
  ]);

  function isRecord(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function exactKeys(value, expected, path, errors) {
    for (const key of Object.keys(value)) {
      if (!expected.has(key)) errors.push(`${path} contains unexpected field: ${key}`);
    }
  }

  function validDate(value) {
    if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
    const parsed = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function addDays(value, count) {
    if (!validDate(value)) return null;
    const date = new Date(`${value}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + count);
    return date.toISOString().slice(0, 10);
  }

  function easternDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const get = type => parts.find(part => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function minutes(value) {
    const [hours, mins] = value.split(':').map(Number);
    return hours * 60 + mins;
  }

  function validText(value) {
    return typeof value === 'string'
      && value.trim().length > 0
      && value.length <= MAX_TEXT_LENGTH
      && !/[<>\u0000-\u001f]/.test(value);
  }

  function canonicalUnique(values) {
    return values.every((value, index) => index === 0 || values[index - 1] < value);
  }

  function allowedSources(targetId) {
    return targetId === 'barnard-fitness' ? new Set(['barnardFitness']) : COLUMBIA_SOURCES;
  }

  function availabilityAllowed(targetId, availabilityType) {
    if (availabilityType === null) return true;
    if (targetId === 'uris-pool') return ['lap-swim', 'recreation-swim', 'reservation-required'].includes(availabilityType);
    if (Object.hasOwn(SPACES, targetId)) return ['open-recreation', 'reservation-required'].includes(availabilityType);
    return ['facility-hours', 'reservation-required'].includes(availabilityType);
  }

  function validateTextList(value, path, errors) {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array`);
      return;
    }
    if (!canonicalUnique(value)) errors.push(`${path} must use canonical unique order`);
    value.forEach((item, index) => {
      if (!validText(item)) errors.push(`${path}[${index}] must be bounded plain text`);
    });
  }

  function validateSourceRefs(value, path, targetId, errors) {
    if (!Array.isArray(value)) {
      errors.push(`${path}.sourceRefs must be an array`);
      return { trusted: false, allowed: false, present: false };
    }
    let trusted = true;
    let allowed = true;
    if (!canonicalUnique(value)) errors.push(`${path}.sourceRefs must use canonical unique order`);
    const sources = allowedSources(targetId);
    for (const [index, source] of value.entries()) {
      if (!OFFICIAL_SOURCES.has(source)) {
        errors.push(`${path}.sourceRefs[${index}] must reference an official source manifest entry`);
        trusted = false;
      } else if (!sources.has(source)) {
        errors.push(`${path}.sourceRefs[${index}] is not allowed for ${targetId}`);
        allowed = false;
      }
    }
    return { trusted, allowed, present: value.length > 0 };
  }

  function validateEvidenceRefs(value, path, targetId, isDodgeChild, sourceRefs, errors) {
    if (!Array.isArray(value)) {
      errors.push(`${path}.evidenceRefs must be an array`);
      return { trusted: false, present: false, targetSpecific: false };
    }
    if (!canonicalUnique(value)) errors.push(`${path}.evidenceRefs must use canonical unique order`);
    let trusted = true;
    let targetSpecific = false;
    for (const [index, evidenceRef] of value.entries()) {
      const evidencePath = `${path}.evidenceRefs[${index}]`;
      if (typeof evidenceRef !== 'string') {
        errors.push(`${evidencePath} must be a trusted target-specific evidence identity`);
        trusted = false;
        continue;
      }
      const separator = evidenceRef.indexOf(':');
      const sourceId = separator > 0 ? evidenceRef.slice(0, separator) : '';
      const evidenceTarget = separator > 0 ? evidenceRef.slice(separator + 1) : '';
      const knownTarget = Object.hasOwn(FACILITIES, evidenceTarget) || Object.hasOwn(SPACES, evidenceTarget);
      const allowedTarget = evidenceTarget === targetId || (isDodgeChild && evidenceTarget === 'dodge');
      if (!OFFICIAL_SOURCES.has(sourceId) || !knownTarget
        || !allowedSources(evidenceTarget).has(sourceId)
        || evidenceRef !== `${sourceId}:${evidenceTarget}` || !allowedTarget) {
        errors.push(`${evidencePath} must be a trusted target-specific evidence identity for ${targetId}`);
        trusted = false;
        continue;
      }
      if (!sourceRefs.includes(sourceId)) {
        errors.push(`${evidencePath} must correspond to ${path}.sourceRefs`);
        trusted = false;
      }
      if (evidenceTarget === targetId) targetSpecific = true;
    }
    for (const sourceRef of sourceRefs) {
      if (!value.some(evidenceRef => evidenceRef.startsWith(`${sourceRef}:`))) {
        errors.push(`${path}.sourceRefs must correspond to trusted evidence identities`);
        trusted = false;
      }
    }
    return { trusted, present: value.length > 0, targetSpecific };
  }

  function validateIntervals(value, path, errors) {
    if (!Array.isArray(value)) {
      errors.push(`${path}.intervals must be an array`);
      return false;
    }
    let valid = true;
    let previousEnd = -1;
    for (const [index, interval] of value.entries()) {
      const intervalPath = `${path}.intervals[${index}]`;
      if (!Array.isArray(interval) || interval.length !== 2
        || !OPEN_TIME.test(interval[0] || '') || !CLOSE_TIME.test(interval[1] || '')) {
        errors.push(`${intervalPath} times must use HH:MM`);
        valid = false;
        continue;
      }
      const start = minutes(interval[0]);
      const end = interval[1] === '24:00' ? 1440 : minutes(interval[1]);
      if (end <= start) {
        errors.push(`${intervalPath} must end after it starts`);
        valid = false;
      } else if (start < previousEnd) {
        errors.push(`${path}.intervals must not overlap`);
        valid = false;
      }
      previousEnd = end;
    }
    return valid;
  }

  function intervalsOverlap(left, right) {
    return left[0] < right[1] && right[0] < left[1];
  }

  function validateRestriction(restriction, path, targetId, isDodgeChild, dayIntervals, errors) {
    if (!isRecord(restriction)) {
      errors.push(`${path} must be an object`);
      return null;
    }
    exactKeys(restriction, new Set([
      'targetId', 'intervals', 'status', 'reason', 'availabilityType', 'accessRestrictions', 'sourceRefs', 'evidenceRefs',
    ]), path, errors);
    const restrictionTargetAllowed = restriction.targetId === targetId
      || (isDodgeChild && restriction.targetId === 'dodge');
    if (!restrictionTargetAllowed) errors.push(`${path}.targetId must identify ${targetId} or its Dodge parent`);
    const validIntervals = validateIntervals(restriction.intervals, path, errors);
    if (validIntervals && restriction.intervals.length === 0) errors.push(`${path}.intervals must contain a restriction window`);
    if (validIntervals && restriction.intervals.some(window => dayIntervals.some(interval => intervalsOverlap(window, interval)))) {
      errors.push(`${path} restriction windows must not overlap residual operating intervals`);
    }
    if (!RESTRICTION_STATUS_VALUES.has(restriction.status)) {
      errors.push(`${path}.status must be an approved restriction status`);
    }
    if (restriction.reason !== null && !validText(restriction.reason)) errors.push(`${path}.reason must be bounded plain text`);
    if (restriction.availabilityType !== null && !AVAILABILITY_TYPES.has(restriction.availabilityType)) {
      errors.push(`${path}.availabilityType must be approved`);
    } else if (restrictionTargetAllowed && !availabilityAllowed(restriction.targetId, restriction.availabilityType)) {
      errors.push(`${path}.availabilityType is not valid for ${restriction.targetId}`);
    }
    if (restriction.status === 'Reservation required' && restriction.availabilityType !== 'reservation-required') {
      errors.push(`${path}.Reservation required must use reservation-required availability`);
    }
    validateTextList(restriction.accessRestrictions, `${path}.accessRestrictions`, errors);
    const provenance = validateSourceRefs(restriction.sourceRefs, path, restriction.targetId, errors);
    const evidence = validateEvidenceRefs(
      restriction.evidenceRefs,
      path,
      restriction.targetId,
      false,
      Array.isArray(restriction.sourceRefs) ? restriction.sourceRefs : [],
      errors,
    );
    if (!provenance.trusted || !provenance.allowed || !provenance.present
      || !evidence.trusted || !evidence.present || !evidence.targetSpecific) {
      errors.push(`${path} requires trusted target-specific evidence`);
    }
    return validIntervals ? restriction : null;
  }

  function validateRestrictions(value, path, targetId, isDodgeChild, dayIntervals, errors) {
    if (!Array.isArray(value)) {
      errors.push(`${path}.restrictions must be an array`);
      return [];
    }
    if (!canonicalUnique(value.map(item => JSON.stringify(item)))) {
      errors.push(`${path}.restrictions must use canonical unique order`);
    }
    const restrictions = value.map((restriction, index) => validateRestriction(
      restriction, `${path}.restrictions[${index}]`, targetId, isDodgeChild, dayIntervals, errors,
    )).filter(Boolean);
    const windows = restrictions.flatMap(restriction => restriction.intervals)
      .sort(([left], [right]) => left.localeCompare(right));
    if (windows.some((window, index) => index > 0 && intervalsOverlap(window, windows[index - 1]))) {
      errors.push(`${path}.restriction windows must not overlap each other`);
    }
    return restrictions;
  }

  function validateDay(day, path, expectedDate, targetId, isSpace, isDodgeChild, errors) {
    if (!isRecord(day)) {
      errors.push(`${path} must be an object`);
      return {
        date: expectedDate, intervals: [], status: null, reason: null, availabilityType: null,
        accessRestrictions: [], sourceRefs: [], evidenceRefs: [], restrictions: [], conflict: false, validIntervals: false,
      };
    }
    exactKeys(day, new Set([
      'date', 'intervals', 'status', 'reason', 'availabilityType', 'accessRestrictions', 'sourceRefs', 'evidenceRefs', 'restrictions', 'conflict',
    ]), path, errors);
    if (day.date !== expectedDate) errors.push(`${path}.date must be ${expectedDate}`);
    const validIntervals = validateIntervals(day.intervals, path, errors);
    if (day.status !== null && !STATUS_VALUES.has(day.status)) errors.push(`${path}.status must be approved`);
    if (validIntervals && day.intervals.length > 0 && typeof day.status === 'string'
      && (day.status.startsWith('Closed') || UNAVAILABLE_STATUSES.has(day.status))) {
      errors.push(`${path} unavailable status cannot include intervals`);
    }
    if ((day.status === 'Open' || day.status === 'Closing soon')
      && (!validIntervals || day.intervals.length === 0)) {
      errors.push(`${path}.${day.status} status requires operating intervals`);
    }
    if (day.status === 'Separate hours not published' && !isSpace) {
      errors.push(`${path}.Separate hours not published is only valid for Dodge spaces`);
    }
    if (day.reason !== null && !validText(day.reason)) errors.push(`${path}.reason must be bounded plain text`);
    if (day.availabilityType !== null && !AVAILABILITY_TYPES.has(day.availabilityType)) {
      errors.push(`${path}.availabilityType must be approved`);
    }
    if (!availabilityAllowed(targetId, day.availabilityType)) errors.push(`${path}.availabilityType is not valid for ${targetId}`);
    const reservationMismatch = day.status === 'Reservation required'
      && day.availabilityType !== 'reservation-required';
    if (reservationMismatch && !isDodgeChild) {
      errors.push(`${path}.Reservation required must use reservation-required availability`);
    }
    validateTextList(day.accessRestrictions, `${path}.accessRestrictions`, errors);
    const provenance = validateSourceRefs(day.sourceRefs, path, targetId, errors);
    const evidence = validateEvidenceRefs(
      day.evidenceRefs,
      path,
      targetId,
      isDodgeChild,
      Array.isArray(day.sourceRefs) ? day.sourceRefs : [],
      errors,
    );
    const restrictions = validateRestrictions(
      day.restrictions, path, targetId, isDodgeChild, validIntervals ? day.intervals : [], errors,
    );
    if (typeof day.conflict !== 'boolean') errors.push(`${path}.conflict must be boolean`);
    const requiresProvenance = day.status === null
      || day.conflict === true
      || !UNAVAILABLE_STATUSES.has(day.status)
      || (validIntervals && day.intervals.length > 0)
      || day.availabilityType !== null
      || day.reason !== null
      || (Array.isArray(day.accessRestrictions) && day.accessRestrictions.length > 0);
    if (requiresProvenance && (!provenance.trusted || !provenance.allowed || !provenance.present
      || !evidence.trusted || !evidence.present)) {
      errors.push(`${path} requires official provenance`);
    }
    if (validIntervals && day.intervals.length > 0 && !evidence.targetSpecific) {
      errors.push(`${path} requires target-specific evidence for published intervals`);
    }
    return {
      date: day.date,
      intervals: validIntervals ? day.intervals : [],
      status: day.status,
      reason: day.reason,
      availabilityType: day.availabilityType,
      accessRestrictions: Array.isArray(day.accessRestrictions) ? day.accessRestrictions : [],
      sourceRefs: Array.isArray(day.sourceRefs) ? day.sourceRefs : [],
      evidenceRefs: Array.isArray(day.evidenceRefs) ? day.evidenceRefs : [],
      restrictions,
      conflict: day.conflict,
      validIntervals,
      hasOfficialProvenance: provenance.trusted && provenance.allowed && provenance.present
        && evidence.trusted && evidence.present,
      reservationMismatch,
      path,
    };
  }

  function validateFacility(facility, index, startDate, errors) {
    const path = `facilities[${index}]`;
    if (!isRecord(facility)) {
      errors.push(`${path} must be an object`);
      return null;
    }
    if (typeof facility.id !== 'string' || !Object.hasOwn(FACILITIES, facility.id)) {
      errors.push(`unexpected facility: ${facility.id}`);
      return null;
    }
    const definition = FACILITIES[facility.id];
    exactKeys(facility, new Set(['id', 'name', 'kind', 'parentId', 'days', 'spaces']), path, errors);
    if (facility.name !== definition.name) errors.push(`${facility.id}.name does not match catalog`);
    if (facility.kind !== definition.kind) errors.push(`${facility.id}.kind does not match catalog`);
    if (facility.parentId !== definition.parentId) errors.push(`${facility.id}.parentId does not match catalog`);
    const isPool = facility.id === 'uris-pool';
    const days = Array.isArray(facility.days) && facility.days.length === 14
      ? facility.days.map((day, dayIndex) => validateDay(
        day, `${path}.days[${dayIndex}]`, addDays(startDate, dayIndex), facility.id, false, isPool, errors,
      ))
      : [];
    if (!Array.isArray(facility.days) || facility.days.length !== 14) {
      errors.push(`${path}.days must contain fourteen consecutive dates`);
    }
    let spaces = [];
    if (facility.id === 'dodge') {
      if (!Array.isArray(facility.spaces)) {
        errors.push(`${path}.spaces must be an array`);
      } else {
        const seen = new Set();
        spaces = facility.spaces.map((space, spaceIndex) => {
          const spacePath = `${path}.spaces[${spaceIndex}]`;
          if (!isRecord(space)) {
            errors.push(`${spacePath} must be an object`);
            return null;
          }
          if (typeof space.id !== 'string' || seen.has(space.id)) errors.push(`${spacePath}.id must be unique`);
          seen.add(space.id);
          if (typeof space.id !== 'string' || !Object.hasOwn(SPACES, space.id)) {
            errors.push(`unexpected Dodge space: ${space.id}`);
            return null;
          }
          exactKeys(space, new Set(['id', 'name', 'days']), spacePath, errors);
          if (space.name !== SPACES[space.id]) errors.push(`${space.id}.name does not match catalog`);
          const spaceDays = Array.isArray(space.days) && space.days.length === 14
            ? space.days.map((day, dayIndex) => validateDay(
              day, `${spacePath}.days[${dayIndex}]`, addDays(startDate, dayIndex), space.id, true, true, errors,
            ))
            : [];
          if (!Array.isArray(space.days) || space.days.length !== 14) {
            errors.push(`${spacePath}.days must contain fourteen consecutive dates`);
          }
          return { id: space.id, days: spaceDays };
        });
        for (const id of Object.keys(SPACES)) if (!seen.has(id)) errors.push(`missing required Dodge space: ${id}`);
      }
    } else if (facility.spaces !== undefined) {
      errors.push(`${path}.spaces is only allowed for Dodge`);
    }
    return { id: facility.id, days, spaces };
  }

  function within(interval, parentIntervals) {
    return parentIntervals.some(([start, end]) => start <= interval[0] && interval[1] <= end);
  }

  function verifiedClosure(day) {
    return day.validIntervals && day.intervals.length === 0 && !day.conflict
      && day.restrictions.length === 0
      && day.status !== 'Hours need verification' && day.hasOfficialProvenance;
  }

  function unresolved(day) {
    return day.conflict === true || day.status === 'Hours need verification';
  }

  function inheritedClosure(child, parent, id, index, errors) {
    if (!child.validIntervals || child.intervals.length) errors.push(`${id} day ${index} cannot open while Dodge is closed`);
    if (child.status !== (parent.status || 'Closed')) errors.push(`${id} day ${index} must inherit Dodge closure status`);
    if (child.reason !== parent.reason) errors.push(`${id} day ${index} must inherit Dodge closure reason`);
    if (!parent.sourceRefs.every(source => child.sourceRefs.includes(source))) {
      errors.push(`${id} day ${index} must retain Dodge closure provenance`);
    }
    if (!parent.evidenceRefs.every(ref => child.evidenceRefs.includes(ref))) {
      errors.push(`${id} day ${index} must retain Dodge closure evidence identity`);
    }
  }

  function inheritedUnresolved(child, parent, id, index, errors, isSpace) {
    const unavailable = child.validIntervals && child.intervals.length === 0
      && UNAVAILABLE_STATUSES.has(child.status) && child.conflict === false;
    if (unavailable) {
      for (const restriction of parent.restrictions) {
        if (!child.restrictions.some(candidate => JSON.stringify(candidate) === JSON.stringify(restriction))) {
          errors.push(`${id} day ${index} must retain known Dodge restriction windows`);
        }
      }
      return;
    }
    if (!child.validIntervals || child.intervals.length) errors.push(`${id} day ${index} cannot publish intervals while Dodge is unresolved`);
    if (child.status !== 'Hours need verification') errors.push(`${id} day ${index} must inherit Dodge unresolved status`);
    if (child.reason !== parent.reason) errors.push(`${id} day ${index} must inherit Dodge unresolved reason`);
    if (child.conflict !== true) errors.push(`${id} day ${index} must inherit Dodge unresolved conflict`);
    if (!parent.sourceRefs.every(source => child.sourceRefs.includes(source))) {
      errors.push(`${id} day ${index} must retain Dodge unresolved provenance`);
    }
    if (!parent.evidenceRefs.every(ref => child.evidenceRefs.includes(ref))) {
      errors.push(`${id} day ${index} must retain Dodge unresolved evidence identity`);
    }
  }

  function validateParents(facilities, errors) {
    const dodge = facilities.get('dodge');
    const pool = facilities.get('uris-pool');
    if (!dodge || !pool) return;
    const children = [
      { id: 'uris-pool', days: pool.days, isSpace: false },
      ...dodge.spaces.filter(Boolean).map(space => ({ id: space.id, days: space.days, isSpace: true })),
    ];
    for (let index = 0; index < Math.min(14, dodge.days.length); index += 1) {
      const parent = dodge.days[index];
      for (const child of children) {
        if (!child.days[index]) continue;
        const day = child.days[index];
        if (!parent.validIntervals || !day.validIntervals) continue;
        if (verifiedClosure(parent)) {
          inheritedClosure(day, parent, child.id, index, errors);
          continue;
        }
        else if (unresolved(parent)) inheritedUnresolved(day, parent, child.id, index, errors, child.isSpace);
        else if (day.intervals.some(interval => !within(interval, parent.intervals))) {
          errors.push(`${child.id} day ${index} intervals must be within Dodge hours`);
        }
        if (day.conflict === true && day.status !== 'Hours need verification') {
          errors.push(`${child.id} day ${index}.conflict must use Hours need verification`);
        }
        if (day.status === 'Reservation required' && day.availabilityType !== 'reservation-required'
          && !(child.isSpace && verifiedClosure(parent) && parent.status === 'Reservation required')) {
          errors.push(`${child.id} day ${index}.Reservation required must use reservation-required availability`);
        }
      }
    }
  }

  function validateSnapshot(snapshot) {
    const errors = [];
    if (!isRecord(snapshot)) return ['snapshot must be an object'];
    exactKeys(snapshot, new Set(['generated', 'facilities']), 'snapshot', errors);
    if (typeof snapshot.generated !== 'string' || !TIMEZONE_AWARE_ISO.test(snapshot.generated)
      || Number.isNaN(Date.parse(snapshot.generated))) {
      errors.push('generated must be a timezone-aware ISO timestamp');
    }
    const startDate = easternDate(snapshot.generated);
    if (!startDate || !validDate(startDate)) errors.push('generated must resolve to an Eastern date');
    if (!Array.isArray(snapshot.facilities)) return [...errors, 'facilities must be an array'];
    const facilities = new Map();
    const seen = new Set();
    for (const [index, facility] of snapshot.facilities.entries()) {
      if (isRecord(facility)) {
        if (typeof facility.id !== 'string' || seen.has(facility.id)) errors.push(`facilities[${index}].id must be unique`);
        seen.add(facility.id);
      }
      const validated = validateFacility(facility, index, startDate, errors);
      if (validated && !facilities.has(validated.id)) facilities.set(validated.id, validated);
    }
    if (seen.size !== Object.keys(FACILITIES).length) errors.push('facilities must contain the exact recreation catalog');
    for (const id of Object.keys(FACILITIES)) if (!seen.has(id)) errors.push(`missing required facility: ${id}`);
    validateParents(facilities, errors);
    for (const [id, facility] of facilities) {
      if (id === 'uris-pool') continue;
      for (const day of facility.days) {
        if (day.conflict === true && day.status !== 'Hours need verification') {
          errors.push(`${day.path}.conflict must use Hours need verification`);
        }
      }
    }
    return errors;
  }

  function dayIndexFor(today, startDate) {
    if (!validDate(today) || !validDate(startDate)) return -1;
    return Math.round((new Date(`${today}T12:00:00Z`) - new Date(`${startDate}T12:00:00Z`)) / 86400000);
  }

  function cloneIntervals(intervals) {
    return intervals.map(interval => [interval[0], interval[1]]);
  }

  function cloneRestrictions(restrictions) {
    return restrictions.map(restriction => ({
      targetId: restriction.targetId,
      intervals: cloneIntervals(restriction.intervals),
      status: restriction.status,
      reason: restriction.reason,
      availabilityType: restriction.availabilityType,
      accessRestrictions: [...restriction.accessRestrictions],
      sourceRefs: [...restriction.sourceRefs],
      evidenceRefs: [...restriction.evidenceRefs],
    }));
  }

  function buildUpdates(snapshot, venues, today) {
    const errors = validateSnapshot(snapshot);
    if (errors.length || !Array.isArray(venues)) return { ok: false, errors };
    const startDate = easternDate(snapshot.generated);
    const firstIndex = dayIndexFor(today, startDate);
    if (firstIndex < 0 || firstIndex + 7 > 14) return { ok: false, errors: ['today is outside the fourteen-day snapshot window'] };
    const byId = new Map();
    for (const venue of venues) if (venue && typeof venue.id === 'string') byId.set(venue.id, venue);
    const facilities = new Map(snapshot.facilities.map(facility => [facility.id, facility]));
    const entries = [];
    const verificationIds = [];
    for (const id of Object.keys(FACILITIES)) {
      const venue = byId.get(id);
      if (!venue) return { ok: false, errors: [`missing venue: ${id}`] };
      const facility = facilities.get(id);
      const selectedDays = facility.days.slice(firstIndex, firstIndex + 7);
      const hours = {};
      const sourceStatuses = {};
      const sourceRestrictions = {};
      const recreationDays = {};
      for (const day of selectedDays) {
        const dow = new Date(`${day.date}T12:00:00Z`).getUTCDay();
        hours[dow] = cloneIntervals(day.intervals);
        sourceStatuses[dow] = day.status;
        sourceRestrictions[dow] = cloneRestrictions(day.restrictions);
        recreationDays[dow] = {
          date: day.date,
          status: day.status,
          reason: day.reason,
          availabilityType: day.availabilityType,
          accessRestrictions: [...day.accessRestrictions],
          sourceRefs: [...day.sourceRefs],
          evidenceRefs: [...day.evidenceRefs],
          restrictions: cloneRestrictions(day.restrictions),
          conflict: day.conflict,
        };
      }
      const current = selectedDays[0];
      const recreationCurrent = {
        date: current.date,
        status: current.status,
        reason: current.reason,
        availabilityType: current.availabilityType,
        accessRestrictions: [...current.accessRestrictions],
        sourceRefs: [...current.sourceRefs],
        evidenceRefs: [...current.evidenceRefs],
        restrictions: cloneRestrictions(current.restrictions),
        conflict: current.conflict,
      };
      const next = {
        hours,
        sourceStatuses,
        sourceRestrictions,
        accessRestrictions: [...current.accessRestrictions],
        recreationLive: true,
        recreationSpaces: [],
        recreationDays,
        recreationCurrent,
        recreationStatus: current.status,
        recreationReason: current.reason,
        recreationAvailabilityType: current.availabilityType,
        recreationConflict: current.conflict,
      };
      if (current.conflict === true || UNAVAILABLE_STATUSES.has(current.status)) verificationIds.push(id);
      if (id === 'dodge') {
        next.recreationSpaces = facility.spaces.map(space => {
          const day = space.days[firstIndex];
          if (day.conflict === true || UNAVAILABLE_STATUSES.has(day.status)) verificationIds.push(space.id);
          return {
            id: space.id,
            name: space.name,
            intervals: cloneIntervals(day.intervals),
            status: day.status,
            reason: day.reason,
            availabilityType: day.availabilityType,
            accessRestrictions: [...day.accessRestrictions],
            sourceRefs: [...day.sourceRefs],
            evidenceRefs: [...day.evidenceRefs],
            restrictions: cloneRestrictions(day.restrictions),
            conflict: day.conflict,
          };
        });
      }
      entries.push([venue, next]);
    }
    return { ok: true, entries, verificationIds };
  }

  function inheritedDescriptor(target, key) {
    let current = Object.getPrototypeOf(target);
    while (current) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor) return descriptor;
      current = Object.getPrototypeOf(current);
    }
    return null;
  }

  function prepareTransaction(entries) {
    const states = [];
    try {
      for (const [venue, next] of entries) {
        if (!venue || (typeof venue !== 'object' && typeof venue !== 'function')) {
          return null;
        }
        const descriptors = new Map();
        for (const key of Object.keys(next)) {
          const own = Object.getOwnPropertyDescriptor(venue, key);
          const descriptor = own || inheritedDescriptor(venue, key);
          if (own) {
            if (!('value' in own) || own.writable !== true) return null;
          } else {
            if (!Object.isExtensible(venue)) return null;
            if (descriptor && (!('value' in descriptor) || descriptor.writable !== true)) return null;
          }
          descriptors.set(key, own || null);
        }
        states.push({ venue, next, descriptors });
      }
    } catch {
      return null;
    }
    return states;
  }

  function rollbackTransaction(states) {
    for (const state of [...states].reverse()) {
      for (const [key, descriptor] of state.descriptors) {
        try {
          if (descriptor) Object.defineProperty(state.venue, key, descriptor);
          else Reflect.deleteProperty(state.venue, key);
        } catch {
          // The original descriptors are restored on ordinary objects. Proxies are unsupported.
        }
      }
    }
  }

  function applyTransaction(states) {
    const applied = [];
    try {
      for (const state of states) {
        for (const key of Object.keys(state.next)) {
          const descriptor = state.descriptors.get(key);
          const nextDescriptor = descriptor
            ? { ...descriptor, value: state.next[key] }
            : { value: state.next[key], writable: true, enumerable: true, configurable: true };
          Object.defineProperty(state.venue, key, nextDescriptor);
        }
        applied.push(state);
      }
    } catch (error) {
      rollbackTransaction(applied.concat(states.filter(state => !applied.includes(state))));
      throw error;
    }
  }

  function messageFor(error, fallback) {
    return error?.message || fallback;
  }

  function fallbackResult(setStatus, failureReason, failureMessage = failureReason) {
    const result = {
      applied: false,
      reason: failureReason,
      failureReason,
      failureMessage,
    };
    try {
      setStatus({ kind: 'fallback', failureReason });
      return result;
    } catch (error) {
      return {
        ...result,
        reason: 'status-error',
        statusError: messageFor(error, 'status-error'),
      };
    }
  }

  async function hydrate({
    venues,
    fetchImpl = global.fetch,
    render = () => {},
    restore = () => {},
    setStatus = () => {},
    today,
    now = new Date(),
  }) {
    let updates;
    let status;
    try {
      const response = await fetchImpl('/api/recreation-hours', { headers: { Accept: 'application/json' } });
      if (!response || !response.ok) throw new Error(`http-${response?.status || 0}`);
      const snapshot = await response.json();
      updates = buildUpdates(snapshot, venues, today);
      if (!updates.ok) throw new Error('invalid-data');
      const generatedAt = Date.parse(snapshot.generated);
      const nowAt = now instanceof Date ? now.getTime() : Date.parse(now);
      if (!Number.isFinite(generatedAt) || !Number.isFinite(nowAt)) throw new Error('invalid-freshness');
      const stale = nowAt - generatedAt > 8 * 60 * 60 * 1000;
      const kind = stale ? 'stale' : updates.verificationIds.length ? 'verification' : 'live';
      status = {
        kind,
        generated: snapshot.generated,
        updatedCount: updates.entries.length,
        totalCount: updates.entries.length,
        verificationIds: updates.verificationIds,
        verificationCount: updates.verificationIds.length,
      };
    } catch (error) {
      const failureReason = messageFor(error, 'network-error');
      return fallbackResult(setStatus, failureReason, failureReason);
    }
    const states = prepareTransaction(updates.entries);
    if (!states) {
      return fallbackResult(setStatus, 'venue-update-failed');
    }
    try {
      applyTransaction(states);
    } catch (error) {
      rollbackTransaction(states);
      return fallbackResult(setStatus, 'venue-update-failed', messageFor(error, 'venue-update-failed'));
    }
    try {
      render();
    } catch (error) {
      rollbackTransaction(states);
      try {
        restore({ kind: 'embedded', reason: 'render-error' });
      } catch (restoreError) {
        return {
          applied: false,
          reason: 'rollback-error',
          failureReason: 'render-error',
          renderingError: messageFor(error, 'render-error'),
          restorationError: messageFor(restoreError, 'restore-error'),
        };
      }
      return {
        applied: false,
        reason: 'render-error',
        failureReason: 'render-error',
        renderingError: messageFor(error, 'render-error'),
      };
    }
    try {
      setStatus(status);
    } catch (error) {
      return {
        applied: true,
        degraded: true,
        reason: 'status-error',
        statusError: messageFor(error, 'status-error'),
        ...status,
      };
    }
    return { applied: true, stale: status.kind === 'stale', ...status };
  }

  global.LionHourRecreationHours = { buildUpdates, hydrate };
})(globalThis);
