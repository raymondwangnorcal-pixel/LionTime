#!/usr/bin/env python3
"""Scrape dining menus from LionDine and output structured JSON.

This script scrapes liondine.com (which aggregates Columbia and Barnard dining
menus) for each meal period, producing a JSON file mapping venue IDs to their
menu data (stations and items) for the current day.

When a venue is open but has no published menu on LionDine, it is flagged with
"available": false so the frontend can show "Menu not available" and the
workflow can send a Telegram notification.

LionDine was rebuilt in September 2026. Both the URLs and the markup changed:

    URLs   /breakfast          ->  /meals/breakfast
    Cards  .container > .col   ->  .hall-card (anywhere in the document)
    Name   a > h3              ->  h2.hall-name
    Hours  .timing > .hours    ->  .timing (text sits directly in it)
    Menu   .menu > flat .food-type / .food-name siblings
           ->  .menu > .station > h3.station-header
                              > .food-row > .food-name

Current HTML structure (verified 2026-09-14, server-rendered):

    div.hall-card
      <a class="hall-link"><h2 class="hall-name">Ferris</h2></a>
      div.timing   ("11:00 AM to 5:00 PM" | "5:00 PM to midnight"
                    | "Closed for lunch")
      div.menu
        div.station
          h3.station-header  (station name, e.g. "Main Line")
          div.food-row > div.food-name  (item; title attr carries
                                         allergen/diet info, unused today)
        ...
      (an open venue with no published menu has div.menu = "No data available")

Usage:
    python scrape_menus.py [--out menus.json]

Exits non-zero when the scrape yields no venues or no items at all, and in that
case leaves any existing output file untouched rather than overwriting good
data with an empty payload.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone, timedelta

import requests
from bs4 import BeautifulSoup

ET = timezone(timedelta(hours=-4))  # EDT; adjust to -5 for EST if needed

LIONDINE_BASE = 'https://liondine.com'
MEAL_SLUGS = ['breakfast', 'lunch', 'dinner', 'latenight']
# LionDine moved the meal pages under /meals/ in September 2026.
MEAL_PATH_PREFIX = 'meals'
MEAL_LABELS = {'breakfast': 'breakfast', 'lunch': 'lunch',
               'dinner': 'dinner', 'latenight': 'late-night'}

# Map LionDine display names → LionHour venue IDs
VENUE_NAME_MAP = {
    'ferris':        'ferris',
    'ferris booth commons': 'ferris',
    "jj's":          'jjs',
    "jj's place":    'jjs',
    'john jay':      'johnjay',
    'john jay dining hall': 'johnjay',
    'john jay dining': 'johnjay',
    'grace dodge':   'gracedodge',
    'grace dodge dining hall': 'gracedodge',
    'grace dodge dining': 'gracedodge',
    'faculty house': 'facultyhouse',
    "chef mike's":   'chefmikes',
    "chef mike's subs": 'chefmikes',
    "chef mike's sub shop": 'chefmikes',
    "chef don's":    'chefdons',
    "chef don's pizza pi": 'chefdons',
    "chef don's pizza": 'chefdons',
    'hewitt':        'hewitt',
    'hewitt dining': 'hewitt',
    'diana':         'diana-center-cafe',
    'diana center':  'diana-center-cafe',
    'diana center cafe': 'diana-center-cafe',
    "johnny's":      'johnnys',
    "johnny's food truck": 'johnnys',
    'fac shack':     'facshack',
    'the fac shack': 'facshack',
    'smith':         'smith-dining',
    'smith dining':  'smith-dining',
    'robert f. smith dining hall': 'smith-dining',
}

HEADERS = {
    'User-Agent': 'LionHour-MenuScraper/1.0 (+https://lionhour.com)',
    'Accept': 'text/html,application/xhtml+xml',
}


def resolve_venue_id(name):
    """Map a LionDine venue name to a LionHour venue ID."""
    key = name.strip().lower()
    if key in VENUE_NAME_MAP:
        return VENUE_NAME_MAP[key]
    # Prefix match for slight variations
    for pattern, vid in VENUE_NAME_MAP.items():
        if key.startswith(pattern) or pattern.startswith(key):
            return vid
    return None


# A venue that is open but has no published menu renders this inside .menu.
NO_MENU_RE = re.compile(
    r'no\s+data\s+available|no\s+menu\s+published|'
    r'menu\s+not\s+available|no\s+menu\s+available',
    re.IGNORECASE,
)

# "11:00 AM to 5:00 PM", "5:00 PM to midnight", "12:00 PM to noon"
_TIME = r'(?:\d{1,2}(?::\d{2})?\s*[AP]\.?M\.?|midnight|noon)'
HOURS_RE = re.compile(
    rf'({_TIME})\s*(?:to|-|–|—|until)\s*({_TIME})',
    re.IGNORECASE,
)

CLOSED_RE = re.compile(r'^\s*closed\b', re.IGNORECASE)


def parse_hours(text):
    """Parse a .timing string into {'open': str, 'close': str} or None."""
    match = HOURS_RE.search(text or '')
    if not match:
        return None
    return {
        'open': ' '.join(match.group(1).split()),
        'close': ' '.join(match.group(2).split()),
    }


def parse_stations(menu_div):
    """Parse .menu into [{'name': station, 'items': [str]}].

    Each station is a div.station holding an h3.station-header and one
    div.food-row > div.food-name per item. Items that appear outside any
    station are collected under "General".
    """
    stations = []
    if menu_div is None:
        return stations

    for station_div in menu_div.find_all('div', class_='station'):
        header = station_div.find(class_='station-header')
        name = header.get_text(strip=True) if header else 'General'
        items = []
        for item in station_div.find_all(class_='food-name'):
            text = item.get_text(strip=True)
            if text:
                items.append(text)
        if items:
            stations.append({'name': name or 'General', 'items': items})

    # Any items not wrapped in a .station (defensive: markup varies by venue).
    orphans = [
        item.get_text(strip=True)
        for item in menu_div.find_all(class_='food-name')
        if not item.find_parent('div', class_='station')
        and item.get_text(strip=True)
    ]
    if orphans:
        stations.append({'name': 'General', 'items': orphans})

    return stations


def parse_meal_html(html, slug):
    """Parse one meal page's HTML into {venue_id: data}.

    Split out from scrape_meal so the parser can be tested against a saved
    fixture without touching the network.

    Returns a dict mapping venue_id -> {
        'name': str,          # display name from LionDine
        'meal': str,          # meal label
        'hours': {open, close} | None,
        'available': bool,    # True if menu items are listed
        'stations': [ {name: str, items: [str]} ],
        'status': str | None, # e.g. 'Closed for lunch', 'No menu published'
    }
    """
    meal_label = MEAL_LABELS[slug]
    soup = BeautifulSoup(html, 'html.parser')
    venues = {}

    cards = soup.find_all('div', class_='hall-card')
    if not cards:
        print(f'  [WARN] No .hall-card blocks found on /{slug} — '
              f'LionDine markup may have changed again', file=sys.stderr)
        return {}

    for card in cards:
        name_el = card.find(class_='hall-name') or card.find('h2') or card.find('h3')
        venue_name = name_el.get_text(strip=True) if name_el else ''
        if not venue_name:
            continue

        venue_id = resolve_venue_id(venue_name)
        if not venue_id:
            print(f'  [INFO] Unknown venue: "{venue_name}" on /{slug}',
                  file=sys.stderr)
            continue

        timing_div = card.find('div', class_='timing')
        hours_text = timing_div.get_text(' ', strip=True) if timing_div else ''

        if CLOSED_RE.match(hours_text):
            venues[venue_id] = {
                'name': venue_name,
                'meal': meal_label,
                'hours': None,
                'available': False,
                'stations': [],
                'status': hours_text,
            }
            continue

        hours = parse_hours(hours_text)
        if hours is None and hours_text:
            print(f'  [WARN] Unparsed hours for {venue_name} on /{slug}: '
                  f'"{hours_text}"', file=sys.stderr)

        menu_div = card.find('div', class_='menu')
        no_menu = bool(menu_div and NO_MENU_RE.search(menu_div.get_text(' ', strip=True)))
        stations = [] if no_menu else parse_stations(menu_div)

        venues[venue_id] = {
            'name': venue_name,
            'meal': meal_label,
            'hours': hours,
            'available': bool(stations) and not no_menu,
            'stations': stations,
            'status': 'No menu published' if no_menu else None,
        }

    return venues


def scrape_meal(session, slug):
    """Fetch and parse a single meal period page from LionDine."""
    url = f'{LIONDINE_BASE}/{MEAL_PATH_PREFIX}/{slug}'
    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f'  [WARN] Failed to fetch {url}: {e}', file=sys.stderr)
        return {}

    return parse_meal_html(resp.text, slug)


def scrape_all_menus():
    """Scrape all meal periods and combine into a single payload."""
    now = datetime.now(ET)
    date_str = now.strftime('%Y-%m-%d')

    print(f'Scraping menus for {date_str}...', file=sys.stderr)

    session = requests.Session()

    # Collect menus per venue across all meals
    venue_menus = {}  # venue_id → { meals: { meal_label: data } }
    unavailable = []  # venues with missing menus

    for slug in MEAL_SLUGS:
        label = MEAL_LABELS[slug]
        print(f'  Scraping /{slug}...', file=sys.stderr)
        meal_data = scrape_meal(session, slug)

        for venue_id, data in meal_data.items():
            if venue_id not in venue_menus:
                venue_menus[venue_id] = {'meals': {}}
            venue_menus[venue_id]['meals'][label] = data

            # Track venues that are open but have no menu
            if (data.get('hours') and not data.get('available')
                    and not (data.get('status') or '').lower().startswith('closed')):
                unavailable.append({
                    'venue': venue_id,
                    'name': data['name'],
                    'meal': label,
                    'status': data.get('status') or 'No menu items found',
                })

    # Build the output payload
    payload = {
        'schemaVersion': 1,
        'date': date_str,
        'scrapedAt': now.isoformat(),
        'source': 'liondine.com',
        'venues': {},
        'unavailable': unavailable,
    }

    for venue_id, data in venue_menus.items():
        venue_entry = {'meals': {}}
        for meal_label, meal_data in data['meals'].items():
            venue_entry['meals'][meal_label] = {
                'name': meal_data['name'],
                'hours': meal_data['hours'],
                'available': meal_data['available'],
                'stations': meal_data['stations'],
                'status': meal_data.get('status'),
            }
        payload['venues'][venue_id] = venue_entry

    return payload


def validate_payload(payload):
    """Validate the scraped payload.

    Returns (fatal, warnings). A fatal result means the scrape produced
    nothing usable — almost always because LionDine changed its URLs or
    markup again — and the caller must not overwrite good data with it.
    """
    fatal = []
    warnings = []

    if not payload.get('date'):
        fatal.append('Missing date')

    venues = payload.get('venues', {})
    if not venues:
        fatal.append('No venues scraped (LionDine URLs or markup may have changed)')

    total_items = 0
    for vid, vdata in venues.items():
        for meal, mdata in vdata.get('meals', {}).items():
            if mdata.get('available'):
                items = sum(len(s.get('items', [])) for s in mdata.get('stations', []))
                total_items += items
                if items == 0:
                    warnings.append(f'{vid}/{meal}: marked available but no items')

    if venues and total_items == 0:
        fatal.append('No menu items scraped across all venues')

    return fatal, warnings


def main():
    parser = argparse.ArgumentParser(description='Scrape Columbia dining menus')
    parser.add_argument('--out', default='menus.json',
                        help='Output JSON file path')
    parser.add_argument('--allow-empty', action='store_true',
                        help='Write the payload even if the scrape produced '
                             'no venues or no items (default: fail instead)')
    args = parser.parse_args()

    payload = scrape_all_menus()

    fatal, warnings = validate_payload(payload)
    for warn in warnings:
        print(f'  [WARN] Validation: {warn}', file=sys.stderr)

    # Report unavailable menus
    unavailable = payload.get('unavailable', [])
    if unavailable:
        print(f'\n  {len(unavailable)} menu(s) unavailable:', file=sys.stderr)
        for u in unavailable:
            print(f'    - {u["name"]} ({u["meal"]}): {u["status"]}',
                  file=sys.stderr)

    # Summary
    venues = payload.get('venues', {})
    total_meals = sum(
        1 for v in venues.values()
        for m in v.get('meals', {}).values()
        if m.get('available')
    )
    total_items = sum(
        len(s.get('items', []))
        for v in venues.values()
        for m in v.get('meals', {}).values()
        for s in m.get('stations', [])
    )
    print(f'\n  Summary: {len(venues)} venues, {total_meals} available meals, '
          f'{total_items} total items, {len(unavailable)} unavailable',
          file=sys.stderr)

    # An empty scrape is a scraper failure, not a day with no food. Leave the
    # existing file alone so the site keeps serving the last good menus, and
    # exit non-zero so the workflow fails and alerts instead of going green.
    if fatal and not args.allow_empty:
        print('\n  [ERROR] Scrape produced no usable data:', file=sys.stderr)
        for err in fatal:
            print(f'    - {err}', file=sys.stderr)
        if os.path.exists(args.out):
            print(f'  [ERROR] Leaving {args.out} unchanged.', file=sys.stderr)
        print('  [ERROR] Check https://liondine.com/meals/lunch — the site '
              'may have changed its URLs or markup again.', file=sys.stderr)
        return 1

    if fatal:
        for err in fatal:
            print(f'  [WARN] Validation: {err} (--allow-empty set)',
                  file=sys.stderr)

    # Write output
    out_dir = os.path.dirname(args.out)
    if out_dir:
        os.makedirs(out_dir, exist_ok=True)
    with open(args.out, 'w') as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print(f'  Written to {args.out}', file=sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
