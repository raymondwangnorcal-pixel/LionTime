#!/usr/bin/env python3
"""Scrape dining menus from LionDine and output structured JSON.

This script scrapes liondine.com (which aggregates Columbia and Barnard dining
menus) for each meal period, producing a JSON file mapping venue IDs to their
menu data (stations and items) for the current day.

When a venue is open but has no published menu on LionDine, it is flagged with
"available": false so the frontend can show "Menu not available" and the
workflow can send a Telegram notification.

HTML structure of liondine.com (discovered via browser inspection):
    .container > .col (one per venue)
      <a href="..."><h3>Venue Name</h3></a>
      div.timing > div.hours  ("10:00 AM to 4:00 PM" | "Closed this week")
      div.menu >
        div.food-type  (station name, e.g. "Main Line")
        div.food-name  (item, e.g. "Scrambled Eggs")
        div.food-type  (next station)
        div.food-name  ...

Usage:
    python scrape_menus.py [--out menus.json]
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


def scrape_meal(session, slug):
    """Scrape a single meal period page from LionDine.

    Returns a dict mapping venue_id → {
        'name': str,          # display name from LionDine
        'meal': str,          # meal label
        'hours': {open, close} | None,
        'available': bool,    # True if menu items are listed
        'stations': [ {name: str, items: [str]} ],
        'status': str | None, # e.g. 'Closed this week', 'No menu published'
    }
    """
    url = f'{LIONDINE_BASE}/{slug}'
    meal_label = MEAL_LABELS[slug]
    try:
        resp = session.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
    except requests.RequestException as e:
        print(f'  [WARN] Failed to fetch {url}: {e}', file=sys.stderr)
        return {}

    soup = BeautifulSoup(resp.text, 'html.parser')
    venues = {}

    container = soup.find('div', class_='container')
    if not container:
        print(f'  [WARN] No .container found on /{slug}', file=sys.stderr)
        return {}

    cols = container.find_all('div', class_='col', recursive=False)

    for col in cols:
        # Venue name from h3 inside anchor
        h3 = col.find('h3')
        if not h3:
            continue
        venue_name = h3.get_text(strip=True)
        if not venue_name:
            continue

        venue_id = resolve_venue_id(venue_name)
        if not venue_id:
            print(f'  [INFO] Unknown venue: "{venue_name}" on /{slug}',
                  file=sys.stderr)
            continue

        # Hours from div.timing > div.hours
        timing_div = col.find('div', class_='timing')
        hours_div = timing_div.find('div', class_='hours') if timing_div else None
        hours_text = hours_div.get_text(strip=True) if hours_div else ''

        # Check if closed
        is_closed = bool(re.match(r'closed', hours_text, re.IGNORECASE))
        if is_closed:
            venues[venue_id] = {
                'name': venue_name,
                'meal': meal_label,
                'hours': None,
                'available': False,
                'stations': [],
                'status': hours_text,
            }
            continue

        # Parse hours
        hours = None
        hours_match = re.match(
            r'(\d{1,2}(?::\d{2})?\s*[AP]M)\s*to\s*(\d{1,2}(?::\d{2})?\s*[AP]M)',
            hours_text, re.IGNORECASE,
        )
        if hours_match:
            hours = {
                'open': hours_match.group(1).strip(),
                'close': hours_match.group(2).strip(),
            }

        # Menu from div.menu
        menu_div = col.find('div', class_='menu')
        stations = []
        no_menu = False

        if menu_div:
            # Check for "No menu published" text directly in .menu
            menu_text = menu_div.get_text(strip=True)
            if re.search(r'no\s+menu\s+published|menu\s+not\s+available',
                         menu_text, re.IGNORECASE):
                no_menu = True
            else:
                # Parse food-type (station) and food-name (item) divs
                current_station = None
                for child in menu_div.children:
                    if not hasattr(child, 'get') or not child.name:
                        continue
                    cls = child.get('class', [])
                    text = child.get_text(strip=True)
                    if not text:
                        continue

                    if 'food-type' in cls:
                        current_station = {'name': text, 'items': []}
                        stations.append(current_station)
                    elif 'food-name' in cls:
                        if current_station is None:
                            current_station = {'name': 'General', 'items': []}
                            stations.append(current_station)
                        current_station['items'].append(text)

        # Filter out empty stations
        stations = [s for s in stations if s['items']]

        venues[venue_id] = {
            'name': venue_name,
            'meal': meal_label,
            'hours': hours,
            'available': bool(stations) and not no_menu,
            'stations': stations,
            'status': 'No menu published' if no_menu else None,
        }

    return venues


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
    """Basic validation of the scraped payload."""
    errors = []

    if not payload.get('date'):
        errors.append('Missing date')

    if not payload.get('venues'):
        errors.append('No venues scraped')

    venues = payload.get('venues', {})
    total_items = 0
    for vid, vdata in venues.items():
        for meal, mdata in vdata.get('meals', {}).items():
            if mdata.get('available'):
                items = sum(len(s.get('items', [])) for s in mdata.get('stations', []))
                total_items += items
                if items == 0:
                    errors.append(f'{vid}/{meal}: marked available but no items')

    if total_items == 0 and venues:
        errors.append('No menu items scraped across all venues')

    return errors


def main():
    parser = argparse.ArgumentParser(description='Scrape Columbia dining menus')
    parser.add_argument('--out', default='menus.json',
                        help='Output JSON file path')
    args = parser.parse_args()

    payload = scrape_all_menus()

    # Validate
    errors = validate_payload(payload)
    if errors:
        for err in errors:
            print(f'  [WARN] Validation: {err}', file=sys.stderr)

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
