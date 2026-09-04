/* ══════════════════════════════════════════════════
   DINING MENUS — fetch & render LionDine menu data
   Companion to dining-hours.js; loaded by index.html.

   Exposes window.LionHourDiningMenus with:
     hydrate()          — fetch menu JSON, then re-render
     toggleBarHTML()     — Hours / Menus pill toggle
     menusScreenHTML()   — full menus view (meal tabs + hall cards)
     activeView          — 'hours' | 'menus'
   ══════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Config ──────────────────────────────────────── */
  var MENU_DATA_URL = 'data/menus.json';
  var MEAL_SLUGS    = ['breakfast', 'lunch', 'dinner', 'late-night'];
  var MEAL_LABELS   = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', 'late-night': 'Late Night' };
  var MEAL_LABELS_M = { breakfast: 'Brkfst',    lunch: 'Lunch',  dinner: 'Dinner', 'late-night': 'Late Nite' };

  /* ── State ───────────────────────────────────────── */
  var menuData   = null;
  var activeMeal = null;   // auto-detected or user-selected
  var activeView = 'hours'; // 'hours' | 'menus'

  /* ── Helpers ─────────────────────────────────────── */
  function escHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /** Determine the current meal period from ET clock. */
  function currentMeal() {
    try {
      var h = parseInt(new Date().toLocaleString('en-US', {
        hour: 'numeric', hour12: false, timeZone: 'America/New_York'
      }), 10);
      if (h >= 5  && h < 11) return 'breakfast';
      if (h >= 11 && h < 16) return 'lunch';
      if (h >= 16 && h < 21) return 'dinner';
      return 'late-night';
    } catch (_) {
      return 'lunch'; // safe fallback
    }
  }

  /* ── Data fetching ───────────────────────────────── */
  function hydrate() {
    fetch(MENU_DATA_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        menuData = data;
        if (!activeMeal) activeMeal = currentMeal();
        if (activeView === 'menus') renderMenusView();
      })
      .catch(function (e) {
        console.warn('[DiningMenus] fetch failed:', e);
      });
  }

  /* ── HTML builders ───────────────────────────────── */

  /** The Hours / Menus pill toggle bar. */
  function toggleBarHTML() {
    return '<div class="view-toggle-bar">' +
      '<div class="view-toggle">' +
        '<button class="view-toggle-btn' + (activeView === 'hours' ? ' active' : '') +
          '" data-view="hours" type="button">Hours</button>' +
        '<button class="view-toggle-btn' + (activeView === 'menus' ? ' active' : '') +
          '" data-view="menus" type="button">Menus</button>' +
      '</div></div>';
  }

  /** Meal-period tab bar. */
  function mealTabsHTML() {
    if (!activeMeal) activeMeal = currentMeal();
    var isMobile = window.innerWidth <= 620;
    var labels = isMobile ? MEAL_LABELS_M : MEAL_LABELS;
    return '<div class="meal-period-bar">' + MEAL_SLUGS.map(function (s) {
      return '<button class="meal-period-tab' + (s === activeMeal ? ' active' : '') +
        '" data-meal="' + s + '" type="button">' + labels[s] + '</button>';
    }).join('') + '</div>';
  }

  /** A single venue's menu card. */
  function menuHallHTML(meal, venue) {
    if (!meal) return '';

    var isOpen   = meal.hours !== null;
    var isClosed = !isOpen && (meal.status || '').toLowerCase().indexOf('closed') === 0;
    var dotCls   = isClosed ? 'closed' : 'open';
    var badgeCls = isClosed ? 'closed' : 'open';
    var badgeTxt = isClosed ? 'Closed' : 'Open';
    var nameAttr = isClosed ? ' style="color:var(--text-secondary);font-weight:500"' : '';
    var hrsTxt   = meal.hours
      ? escHTML(meal.hours.open + ' – ' + meal.hours.close)
      : (isClosed ? escHTML(meal.status || 'Closed') : '');

    /* body: stations with items, OR "Menu not available", OR nothing (closed) */
    var body = '';
    if (meal.available && meal.stations && meal.stations.length) {
      body = '<div class="menu-hall-body">' + meal.stations.map(function (s) {
        var items = s.items || [];
        return '<div class="station">' +
          '<div class="station-header">' +
            '<span class="station-name">' + escHTML(s.name) + '</span>' +
            '<span class="station-count">' + items.length + '</span>' +
          '</div>' +
          '<div class="menu-items">' + items.map(function (it) {
            return '<span class="menu-item">' + escHTML(it) + '</span>';
          }).join('') + '</div></div>';
      }).join('') + '</div>';
    } else if (!isClosed && !meal.available) {
      body = '<div class="menu-empty">Menu not available</div>';
    }

    return '<div class="menu-hall">' +
      '<div class="menu-hall-header">' +
        '<span class="dot ' + dotCls + '" style="width:8px;height:8px"></span>' +
        '<span class="menu-hall-name"' + nameAttr + '>' + escHTML(venue.name) + '</span>' +
        (hrsTxt ? '<span class="menu-hall-hours">' + hrsTxt + '</span>' : '') +
        '<span class="menu-hall-badge ' + badgeCls + '">' + badgeTxt + '</span>' +
      '</div>' + body + '</div>';
  }

  /** Full menus screen: tabs + hall cards. */
  function menusScreenHTML() {
    if (!activeMeal) activeMeal = currentMeal();

    var html = mealTabsHTML();

    if (!menuData) {
      html += '<div class="menu-empty" style="margin:1.5rem 0">Loading menus…</div>';
      return '<div class="menus-screen" id="dining-menus-screen"' +
        (activeView === 'menus' ? '' : ' hidden') + '>' + html + '</div>';
    }

    var diningVenues = (window.VENUES || []).filter(function (v) { return v.cat === 'dining'; });
    var venues = menuData.venues || {};
    var mealKey = activeMeal; // keys in JSON match our slugs

    /* Build sortable list: venues with menus first, open-no-menu, then closed */
    var items = diningVenues.map(function (v) {
      var vd = venues[v.id];
      var m  = vd && vd.meals ? vd.meals[mealKey] || null : null;
      return { venue: v, meal: m };
    });

    items.sort(function (a, b) {
      function score(x) {
        if (!x.meal) return 3;
        if (x.meal.available) return 0;
        if ((x.meal.status || '').toLowerCase().indexOf('closed') === 0) return 2;
        return 1;
      }
      return score(a) - score(b);
    });

    var anyCard = false;
    for (var i = 0; i < items.length; i++) {
      if (!items[i].meal) continue;
      html += menuHallHTML(items[i].meal, items[i].venue);
      anyCard = true;
    }
    if (!anyCard) {
      html += '<div class="menu-empty" style="margin:1.5rem 0">No menu data available for this meal period.</div>';
    }

    return '<div class="menus-screen" id="dining-menus-screen"' +
      (activeView === 'menus' ? '' : ' hidden') + '>' + html + '</div>';
  }

  /* ── View switching ──────────────────────────────── */

  function renderMenusView() {
    var container = document.getElementById('dining-menus-screen');
    if (!container) return;
    var wrapper = document.createElement('div');
    wrapper.innerHTML = menusScreenHTML();
    var fresh = wrapper.firstElementChild;
    if (fresh) container.innerHTML = fresh.innerHTML;
    container.hidden = (activeView !== 'menus');
  }

  function switchView(view) {
    activeView = view;

    /* toggle buttons */
    var btns = document.querySelectorAll('.view-toggle-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-view') === view);
    }

    /* list container gets a class so CSS can hide cols/entries */
    var list = document.getElementById('list-dining');
    var menus = document.getElementById('dining-menus-screen');
    if (list) {
      if (view === 'menus') {
        list.classList.add('menus-active');
      } else {
        list.classList.remove('menus-active');
      }
    }
    if (menus) {
      menus.hidden = (view !== 'menus');
      if (view === 'menus') renderMenusView();
    }
  }

  function switchMeal(meal) {
    activeMeal = meal;
    var tabs = document.querySelectorAll('.meal-period-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('active', tabs[i].getAttribute('data-meal') === meal);
    }
    renderMenusView();
  }

  /* ── Event delegation (click on toggle or meal tab) ─ */
  document.addEventListener('click', function (e) {
    var toggleBtn = e.target.closest('.view-toggle-btn');
    if (toggleBtn && toggleBtn.getAttribute('data-view')) {
      switchView(toggleBtn.getAttribute('data-view'));
      return;
    }
    var mealTab = e.target.closest('.meal-period-tab');
    if (mealTab && mealTab.getAttribute('data-meal')) {
      switchMeal(mealTab.getAttribute('data-meal'));
      return;
    }
  });

  /* ── Public API ──────────────────────────────────── */
  window.LionHourDiningMenus = {
    hydrate:          hydrate,
    toggleBarHTML:     toggleBarHTML,
    menusScreenHTML:   menusScreenHTML,
    switchView:       switchView,
    get activeView()  { return activeView; },
    get menuData()    { return menuData; }
  };
})();
