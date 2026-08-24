(function recreationHoursView(global) {
  'use strict';

  function text(value) {
    const string = String(value ?? '');
    if (global.document?.createElement) {
      const node = global.document.createElement('span');
      node.textContent = string;
      return node.innerHTML;
    }
    return string.replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function toMinutes(value) {
    const parts = typeof value === 'string' ? value.split(':').map(Number) : [];
    if (parts.length !== 2 || parts.some(part => !Number.isInteger(part))) return null;
    const [hours, minutes] = parts;
    if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59 || (hours === 24 && minutes !== 0)) return null;
    return hours * 60 + minutes;
  }

  function formatTime(minutes) {
    const normalized = ((minutes % 1440) + 1440) % 1440;
    const hours = Math.floor(normalized / 60);
    const minute = normalized % 60;
    const displayHour = hours % 12 || 12;
    return `${displayHour}${minute ? `:${String(minute).padStart(2, '0')}` : ''} ${hours < 12 ? 'AM' : 'PM'}`;
  }

  function intervalText(intervals) {
    if (!Array.isArray(intervals) || !intervals.length) return null;
    const formatted = intervals.map(interval => {
      if (!Array.isArray(interval) || interval.length !== 2) return null;
      const start = toMinutes(interval[0]);
      const end = toMinutes(interval[1]);
      if (start === null || end === null) return null;
      if (start === 0 && end === 1440) return 'Open 24 hours';
      return `${formatTime(start)} – ${formatTime(end)}`;
    });
    return formatted.every(Boolean) ? formatted : null;
  }

  function activeInterval(intervals, minutes) {
    if (!Array.isArray(intervals) || minutes === null) return null;
    return intervals.find(interval => {
      if (!Array.isArray(interval) || interval.length !== 2) return false;
      const start = toMinutes(interval[0]);
      let end = toMinutes(interval[1]);
      if (start === null || end === null) return false;
      if (end <= start) end += 1440;
      return minutes >= start && minutes < end;
    }) || null;
  }

  function availabilityLabel(value) {
    return ({
      'facility-hours': 'Facility hours',
      'open-recreation': 'Open recreation',
      'lap-swim': 'Lap swim',
      'recreation-swim': 'Recreation swim',
      'reservation-required': 'Reservation required',
    })[value] || value || null;
  }

  function stateFor(space, now) {
    const status = typeof space?.status === 'string' && space.status.trim() ? space.status.trim() : null;
    const hours = intervalText(space?.intervals);
    const minutes = Number.isFinite(now?.mins) ? now.mins : null;
    const activeRestriction = (Array.isArray(space?.restrictions) ? space.restrictions : [])
      .find(restriction => activeInterval(restriction?.intervals, minutes));
    if (activeRestriction) {
      return {
        label: activeRestriction.status || 'Closed',
        hours,
        reason: activeRestriction.reason || null,
        availabilityType: activeRestriction.availabilityType || null,
        accessRestrictions: [...new Set([
          ...(Array.isArray(space?.accessRestrictions) ? space.accessRestrictions : []),
          ...(Array.isArray(activeRestriction.accessRestrictions) ? activeRestriction.accessRestrictions : []),
        ])],
      };
    }
    if (status === 'Closed for maintenance'
      || status === 'Separate hours not published'
      || status === 'Hours need verification'
      || status === 'Reservation required'
      || /^Closed\b/i.test(status || '')) {
      return {
        label: status,
        hours,
        reason: space?.reason || null,
        availabilityType: space?.availabilityType || null,
        accessRestrictions: Array.isArray(space?.accessRestrictions) ? space.accessRestrictions : [],
      };
    }
    if (!hours) return {
      label: 'Closed', hours: null, reason: space?.reason || null,
      availabilityType: space?.availabilityType || null,
      accessRestrictions: Array.isArray(space?.accessRestrictions) ? space.accessRestrictions : [],
    };
    const openInterval = activeInterval(space.intervals, minutes);
    const close = openInterval ? toMinutes(openInterval[1]) : null;
    const closingSoon = close !== null && close - minutes <= 60;
    return {
      label: openInterval ? (closingSoon ? 'Closing soon' : 'Open') : 'Closed',
      hours,
      reason: space?.reason || null,
      availabilityType: space?.availabilityType || null,
      accessRestrictions: Array.isArray(space?.accessRestrictions) ? space.accessRestrictions : [],
    };
  }

  function dotClass(label) {
    if (!label) return 'closed';
    if (/^Open\b/i.test(label)) return 'open';
    if (/closing soon/i.test(label)) return 'closing-soon';
    return 'closed';
  }

  function spaceHTML(space, now) {
    const state = stateFor(space, now);
    const dot = dotClass(state.label);
    const restrictions = Array.isArray(state.accessRestrictions) ? state.accessRestrictions : [];
    const restrictionsText = restrictions.filter(Boolean).join(' · ');
    const hourLines = Array.isArray(state.hours) ? state.hours : [];

    /* Availability label + restrictions collapse onto one trailing line */
    const otherParts = [];
    const avail = availabilityLabel(state.availabilityType);
    if (avail) otherParts.push(text(avail));
    if (restrictionsText) otherParts.push(text(restrictionsText));

    let metaLine = '';
    if (hourLines.length > 1) {
      /* Multiple time slots: each gets its own line instead of comma-joining onto one row */
      const lines = hourLines.map(line => `<div class="recreation-space-hours">${text(line)}</div>`);
      if (otherParts.length) lines.push(`<div class="recreation-space-extra">${otherParts.join(' · ')}</div>`);
      metaLine = `<div class="recreation-space-meta">${lines.join('')}</div>`;
    } else {
      const metaParts = hourLines.length ? [text(hourLines[0]), ...otherParts] : [...otherParts];
      metaLine = metaParts.length
        ? `<div class="recreation-space-meta">${metaParts.join(' · ')}</div>`
        : '';
    }

    return `<li class="recreation-space">
      <div class="recreation-space-heading"><span class="dot ${dot}"></span><span class="recreation-space-name">${text(space?.name)}</span><span class="recreation-space-status ${dot}">${text(state.label)}</span></div>
      ${metaLine}
    </li>`;
  }

  function renderSpaces(spaces, now, expanded = false) {
    const items = Array.isArray(spaces) ? spaces : [];
    if (!items.length) return '';
    const hidden = expanded ? '' : ' hidden';
    return `<section class="recreation-spaces" aria-label="Dodge Fitness Center spaces">
      <button class="recreation-spaces-toggle" type="button" aria-expanded="${expanded}" aria-controls="dodge-recreation-spaces">View spaces (${items.length})</button>
      <ul class="recreation-spaces-list" id="dodge-recreation-spaces"${hidden}>${items.map(space => spaceHTML(space, now)).join('')}</ul>
    </section>`;
  }

  global.LionHourRecreationView = Object.freeze({ renderSpaces });
}(globalThis));
