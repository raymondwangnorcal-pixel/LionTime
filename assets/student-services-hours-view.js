(function exposeStudentServicesHoursView(global) {
  'use strict';

  const ACCESS_LABELS = Object.freeze({
    'open-access': 'Open Access',
    'office-hours': 'Office Hours',
    'walk-in': 'Drop-In',
    'appointment-only': 'Appointment Only',
    'virtual-only': 'Virtual Only',
    'phone-support': 'Phone Support',
  });
  const ACCESS_PRIORITY = Object.freeze([
    'walk-in', 'open-access', 'office-hours', 'appointment-only', 'virtual-only', 'phone-support',
  ]);

  function escapeText(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  function minutes(value) {
    if (!/^\d{2}:\d{2}$/.test(value || '')) return null;
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  function activeInterval(availability, nowMinutes) {
    return availability?.intervals?.find(interval => {
      const start = minutes(interval?.[0]);
      const end = interval?.[1] === '24:00' ? 1440 : minutes(interval?.[1]);
      return start !== null && end !== null && nowMinutes >= start && nowMinutes < end;
    }) || null;
  }

  function ranked(availabilities) {
    return [...availabilities].sort((left, right) => {
      const leftIndex = ACCESS_PRIORITY.indexOf(left.type);
      const rightIndex = ACCESS_PRIORITY.indexOf(right.type);
      return leftIndex - rightIndex;
    });
  }

  function dayFor(venue, dow) {
    return venue?.studentServicesDays?.[((dow % 7) + 7) % 7] || null;
  }

  function stateFor(venue, now) {
    if (venue?.studentServicesSourceState === 'verification') {
      return {
        status: 'closed', label: 'Needs verification', detail: 'Official hours have not refreshed in 24 hours',
        accessLabel: accessLabelFor(venue, now),
      };
    }
    const day = dayFor(venue, now.dow);
    if (!day) return null;
    const active = ranked(day.availabilities.filter(availability => activeInterval(availability, now.mins)));
    if (!active.length) {
      return {
        status: 'closed', label: 'Closed', detail: 'No active availability right now',
        accessLabel: accessLabelFor(venue, now),
      };
    }
    const context = active[0];
    const interval = activeInterval(context, now.mins);
    const close = interval[1] === '24:00' ? 1440 : minutes(interval[1]);
    const closingSoon = close - now.mins <= 60;
    return {
      status: closingSoon ? 'closing-soon' : 'open',
      label: closingSoon ? 'Closing soon' : 'Open',
      detail: context.reason || ACCESS_LABELS[context.type],
      accessLabel: ACCESS_LABELS[context.type],
    };
  }

  function accessLabelFor(venue, now) {
    const day = dayFor(venue, now.dow);
    const availabilities = Array.isArray(day?.availabilities) ? day.availabilities : [];
    const active = ranked(availabilities.filter(availability => activeInterval(availability, now.mins)));
    const selected = active[0] || ranked(availabilities.filter(availability => availability.intervals.length))[0]
      || ranked(availabilities)[0];
    return ACCESS_LABELS[selected?.type] || ACCESS_LABELS[venue?.studentAccessType] || null;
  }

  function renderDay(day, formatRange) {
    if (!day?.availabilities?.length) return '<div class="service-availability">No availability published</div>';
    return day.availabilities.map(availability => {
      const hours = availability.intervals.length
        ? availability.intervals.map(formatRange).join(', ')
        : availability.status || 'Closed';
      const reason = availability.reason ? `<span class="service-reason">${escapeText(availability.reason)}</span>` : '';
      return `<div class="service-availability"><span class="service-access">${escapeText(ACCESS_LABELS[availability.type])}</span><span>${escapeText(hours)}</span>${reason}</div>`;
    }).join('');
  }

  global.LionHourStudentServicesView = {
    ACCESS_LABELS,
    accessLabelFor,
    renderDay,
    stateFor,
  };
})(globalThis);
