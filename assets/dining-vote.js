(function diningVote(global) {
  'use strict';


  /* ── Date gate: hide voting UI until September 4, 2026 ── */
  const VOTING_START = '2026-09-04';
  const gateDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  if (gateDate < VOTING_START) return;
  /* ── Constants ────────────────────────────────── */
  const STORAGE_FP   = 'lionhour:vote:fp';
  const STORAGE_DATE = 'lionhour:vote:date';
  const STORAGE_HALL = 'lionhour:vote:hallId';
  const API_PATH     = '/api/dining-vote';

  /* ── State ────────────────────────────────────── */
  let fingerprint = null;
  let serverData  = null;   // { date, totalVotes, top, userVote }
  let optimistic  = null;   // hallId during in-flight request
  let pending      = false;

  /* ── Fingerprint ──────────────────────────────── */
  async function generateFingerprint() {
    const raw = [
      navigator.userAgent,
      screen.width + 'x' + screen.height,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join('|');
    const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function getFingerprint() {
    if (fingerprint) return fingerprint;
    try {
      const stored = localStorage.getItem(STORAGE_FP);
      if (stored && /^[0-9a-f]{64}$/.test(stored)) {
        fingerprint = stored;
        return fingerprint;
      }
    } catch (_) { /* storage unavailable */ }
    fingerprint = await generateFingerprint();
    try { localStorage.setItem(STORAGE_FP, fingerprint); } catch (_) { /* ok */ }
    return fingerprint;
  }

  /* ── Date helpers ─────────────────────────────── */
  function todayET() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
  }

  function todayLabel() {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric',
    }).format(new Date());
  }

  /* ── Cached vote (localStorage) ───────────────── */
  function getCachedVote() {
    try {
      const date = localStorage.getItem(STORAGE_DATE);
      const hall = localStorage.getItem(STORAGE_HALL);
      if (date === todayET() && hall) return hall;
    } catch (_) { /* ok */ }
    return null;
  }

  function setCachedVote(hallId) {
    try {
      localStorage.setItem(STORAGE_DATE, todayET());
      localStorage.setItem(STORAGE_HALL, hallId);
    } catch (_) { /* ok */ }
  }

  function clearCachedVote() {
    try {
      localStorage.removeItem(STORAGE_DATE);
      localStorage.removeItem(STORAGE_HALL);
    } catch (_) { /* ok */ }
  }

  /* ── API calls ────────────────────────────────── */
  async function fetchResults() {
    const fp = await getFingerprint();
    try {
      const res = await fetch(`${API_PATH}?fp=${fp}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  async function postVote(hallId) {
    const fp = await getFingerprint();
    try {
      const res = await fetch(API_PATH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fp, hallId }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (_) { return null; }
  }

  /* ── Effective user vote (server or optimistic) ── */
  function effectiveVote() {
    if (optimistic === '__none__') return null;
    if (optimistic) return optimistic;
    if (serverData?.userVote) return serverData.userVote;
    return getCachedVote();
  }

  function hasVoted() {
    return effectiveVote() !== null;
  }

  /* ── HTML helpers ─────────────────────────────── */
  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  /* ── Venue name lookup ────────────────────────── */
  function hallName(id) {
    if (!global.VENUES) return id;
    const venue = global.VENUES.find(v => v.id === id);
    return venue ? venue.name : id;
  }

  /* ── Vote button HTML (injected into dining rows) */
  function voteButtonHTML(hallId) {
    const voted = effectiveVote() === hallId;
    const cls = voted ? 'dining-vote-btn voted' : 'dining-vote-btn';
    const label = voted ? 'Voted ✓' : 'Vote';
    return `<span class="${cls}" data-vote-hall="${esc(hallId)}" role="button" tabindex="0">${label}</span>`;
  }

  /* ── Results card HTML ────────────────────────── */
  function resultsCardHTML() {
    const voted = hasVoted();
    const data = serverData;
    const total = data?.totalVotes || 0;
    const top = Array.isArray(data?.top) ? data.top : [];
    const dateLabel = todayLabel();

    /* Zero-votes state */
    if (total === 0 && !voted) {
      return `<div class="dining-vote-card">
        <div class="dining-vote-header">
          <span class="dining-vote-title">🗳️ Today's Favorite</span>
          <span class="dining-vote-date">${esc(dateLabel)}</span>
        </div>
        <div class="dining-vote-body dining-vote-empty">
          <span>Be the first to vote! Tap <strong>Vote</strong> on any dining hall above.</span>
        </div>
      </div>`;
    }

    let bodyHTML;
    if (!voted) {
      /* Pre-vote: ranked names, no bars */
      bodyHTML = `<div class="dining-vote-options dining-vote-prestate">
        ${top.map((entry, i) => `<div class="dining-vote-rank-row">
          <span class="dining-vote-rank">${i + 1}.</span>
          <span class="dining-vote-rank-name">${esc(hallName(entry.id))}</span>
        </div>`).join('')}
      </div>`;
    } else {
      /* Post-vote: bars + percentages */
      const userVote = effectiveVote();
      const maxPct = top.length ? Math.round((top[0].votes / total) * 100) : 0;
      bodyHTML = `<div class="dining-vote-options">
        ${top.map((entry, i) => {
          const pct = total > 0 ? Math.round((entry.votes / total) * 100) : 0;
          const isWinner = i === 0 && pct > 0;
          const isUser = entry.id === userVote;
          const cls = ['dining-vote-option',
            isWinner ? 'winner' : '',
            isUser ? 'selected' : '',
          ].filter(Boolean).join(' ');
          const fillCls = isWinner ? 'gold' : isUser ? 'blue' : 'grey';
          return `<div class="${cls}" data-vote-hall="${esc(entry.id)}">
            <div class="dining-vote-fill ${fillCls}" style="width:${pct}%"></div>
            <div class="dining-vote-radio${isUser ? ' checked' : ''}"></div>
            <span class="dining-vote-opt-name">${esc(hallName(entry.id))}${isWinner ? ' 👑' : ''}</span>
            <span class="dining-vote-opt-pct">${pct}%</span>
          </div>`;
        }).join('')}
      </div>`;
    }

    const footerHTML = voted
      ? `<div class="dining-vote-footer">
          <span class="dining-vote-confirmed">✓ You voted for ${esc(hallName(effectiveVote()))}</span>
          <span>Resets at midnight</span>
        </div>`
      : `<div class="dining-vote-footer">
          <span>Vote for your favorite above!</span>
          <span>Resets at midnight</span>
        </div>`;

    return `<div class="dining-vote-card">
      <div class="dining-vote-header">
        <span class="dining-vote-title">🗳️ Today's Favorite</span>
        <span class="dining-vote-date">${esc(dateLabel)} · ${total} vote${total !== 1 ? 's' : ''}</span>
      </div>
      <div class="dining-vote-body">
        ${bodyHTML}
        ${footerHTML}
      </div>
    </div>`;
  }

  /* ── DOM updates ──────────────────────────────── */
  function updateVoteButtons() {
    const buttons = document.querySelectorAll('.dining-vote-btn');
    const vote = effectiveVote();
    buttons.forEach(btn => {
      const hallId = btn.dataset.voteHall;
      const isVoted = hallId === vote;
      btn.classList.toggle('voted', isVoted);
      btn.textContent = isVoted ? 'Voted ✓' : 'Vote';
    });
  }

  function updateResultsCard() {
    const container = document.getElementById('dining-vote-card');
    if (container) container.innerHTML = resultsCardHTML();
  }

  function refresh() {
    updateVoteButtons();
    updateResultsCard();
  }

  /* ── Vote handler ─────────────────────────────── */
  async function handleVote(hallId) {
    if (pending) return;

    const isUnvote = effectiveVote() === hallId;

    pending = true;
    optimistic = isUnvote ? '__none__' : hallId;
    if (isUnvote) clearCachedVote(); else setCachedVote(hallId);
    refresh();

    const result = isUnvote
      ? await postVote(null)   // hallId: null tells the server to remove the vote
      : await postVote(hallId);
    if (result) {
      serverData = result;
      optimistic = null;
    } else {
      /* Revert optimistic state on failure */
      optimistic = null;
      if (isUnvote) {
        /* Restore the vote we tried to remove */
        setCachedVote(hallId);
      } else {
        clearCachedVote();
      }
    }
    pending = false;
    refresh();
  }

  /* ── Init ─────────────────────────────────────── */
  async function init() {
    /* Check for stale cached vote from a previous day */
    try {
      const cachedDate = localStorage.getItem(STORAGE_DATE);
      if (cachedDate && cachedDate !== todayET()) clearCachedVote();
    } catch (_) { /* ok */ }

    /* Fetch server data */
    const data = await fetchResults();
    if (data) {
      serverData = data;
      if (data.userVote) setCachedVote(data.userVote);
    }
    refresh();
  }

  /* ── Click delegation (attached by the page) ──── */
  function attachClickHandler(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('.dining-vote-btn');
      if (btn) {
        e.stopPropagation();
        const hallId = btn.dataset.voteHall;
        if (hallId) handleVote(hallId);
        return;
      }
      const opt = e.target.closest('.dining-vote-option');
      if (opt) {
        const hallId = opt.dataset.voteHall;
        if (hallId) handleVote(hallId);
      }
    });
  }

  /* ── Public API ───────────────────────────────── */
  global.LionHourDiningVote = Object.freeze({
    init,
    voteButtonHTML,
    resultsCardHTML,
    refresh,
    attachClickHandler,
  });
}(globalThis));
