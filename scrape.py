#!/usr/bin/env python3
"""
LionHour Scraper
Fetches current library hours from hours.library.columbia.edu
and writes data.js for the website to consume.

Usage:
    python3 scrape.py            # scrape and write data.js
    python3 scrape.py --dry-run  # print JSON to stdout without writing

Schedule daily with cron:
    0 6 * * * cd /path/to/LionHour && python3 scrape.py >> scrape.log 2>&1
"""

import json
import re
import sys
import os
from datetime import datetime, timedelta
from typing import Optional

import requests
from bs4 import BeautifulSoup

# ── Library definitions ──────────────────────────────────────────────
# slug: the URL path segment on hours.library.columbia.edu
# name: display name on the site

LIBRARIES = [
    {"slug": "butler-24",              "name": "Butler Library"},
    {"slug": "avery",                  "name": "Avery Architectural & Fine Arts Library",
     "note": "Service desk closes 15 min before the library"},
    {"slug": "business",               "name": "Business & Economics Library"},
    {"slug": "business-manhattanville", "name": "S. Steven Pan '88 Business Library",
     "note": "May close 1–2 PM for staff lunch. Geffen Hall access required."},
    {"slug": "science-engineering",    "name": "Science & Engineering Library"},
    {"slug": "lehman",                 "name": "Lehman Social Sciences Library"},
    {"slug": "math",                   "name": "Mathematics Library"},
    {"slug": "journalism",             "name": "Journalism Library"},
    {"slug": "music",                  "name": "Gabe M. Wiener Music & Arts Library",
     "note": "In-person reference Mon–Fri during daytime hours only"},
    {"slug": "social-work",            "name": "Social Work Library"},
    {"slug": "eastasian",              "name": "C. V. Starr East Asian Library"},
    {"slug": "burke",                  "name": "The Burke Library at Union Theological Seminary",
     "note": "Special Collections by appointment"},
]

BASE_URL = "https://hours.library.columbia.edu/locations"
HEADERS = {
    "User-Agent": "LionHour/1.0 (Columbia University student project)"
}


# ── Parsing ──────────────────────────────────────────────────────────

def parse_time(time_str: str) -> Optional[str]:
    """Convert '9:00AM' or '12:30PM' to 24h 'HH:MM' format."""
    time_str = time_str.strip().upper().replace(" ", "")
    m = re.match(r"(\d{1,2}):(\d{2})\s*(AM|PM)", time_str)
    if not m:
        return None
    h, mins, ampm = int(m.group(1)), m.group(2), m.group(3)
    if ampm == "PM" and h != 12:
        h += 12
    elif ampm == "AM" and h == 12:
        h = 0
    return f"{h:02d}:{mins}"


def parse_hours_text(text: str) -> Optional[dict]:
    """
    Parse a cell's text like '9:00AM-5:00PM' into {"open": "09:00", "close": "17:00"}.
    Returns None if closed or unparseable.
    """
    text = text.strip()
    if not text or text.lower() in ("closed", "tbd", ""):
        return None

    # Match pattern like "9:00AM-5:00PM" or "9:00AM - 5:00PM"
    m = re.search(r"(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*[-–]\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])", text)
    if not m:
        return None

    open_time = parse_time(m.group(1))
    close_time = parse_time(m.group(2))
    if open_time and close_time:
        return {"open": open_time, "close": close_time}
    return None


def fetch_library_page(slug: str, date: Optional[str] = None) -> Optional[BeautifulSoup]:
    """Fetch a library's hours page. date format: YYYY-MM-DD."""
    url = f"{BASE_URL}/{slug}"
    if date:
        url += f"?date={date}"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        return BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as e:
        print(f"  [ERROR] Failed to fetch {slug}: {e}", file=sys.stderr)
        return None


def extract_schedule_from_page(soup: BeautifulSoup) -> dict:
    """
    Parse the hours table and return a dict mapping ISO date strings
    to their hours: { "2026-08-18": {"open": "09:00", "close": "17:00"}, ... }
    Dates with no hours or 'Closed' map to None.
    """
    schedule = {}

    # The calendar table contains <td> cells with date info and hours.
    # Strategy: find all <td> elements that contain a date pattern (YYYY-MM-DD)
    # in their text or data attributes, then extract the hours text.

    # Approach 1: Look for cells with ISO dates in text content
    all_tds = soup.find_all("td")
    for td in all_tds:
        cell_text = td.get_text(separator=" ", strip=True)

        # Look for ISO date pattern
        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", cell_text)
        if not date_match:
            continue

        date_str = date_match.group(1)
        # Remove the date from the text to find the hours
        hours_text = cell_text.replace(date_str, "").strip()
        # Also remove day numbers that might be in the cell
        hours_text = re.sub(r"^\d{1,2}\s*", "", hours_text).strip()

        schedule[date_str] = parse_hours_text(hours_text)

    # Approach 2: If no ISO dates found, try data attributes
    if not schedule:
        for td in all_tds:
            date_attr = td.get("data-date") or td.get("data-day")
            if date_attr and re.match(r"\d{4}-\d{2}-\d{2}", date_attr):
                hours_text = td.get_text(separator=" ", strip=True)
                hours_text = re.sub(r"^\d{1,2}\s*", "", hours_text).strip()
                schedule[date_attr] = parse_hours_text(hours_text)

    # Approach 3: Try anchor tags or spans with dates
    if not schedule:
        for el in soup.find_all(["a", "span", "div"]):
            text = el.get_text(strip=True)
            date_match = re.match(r"(\d{4}-\d{2}-\d{2})", text)
            if date_match:
                parent_td = el.find_parent("td")
                if parent_td:
                    full_text = parent_td.get_text(separator=" ", strip=True)
                    hours_text = full_text.replace(date_match.group(1), "").strip()
                    hours_text = re.sub(r"^\d{1,2}\s*", "", hours_text).strip()
                    schedule[date_match.group(1)] = parse_hours_text(hours_text)

    return schedule


def dates_to_weekly_schedule(date_hours: dict, reference_date: datetime) -> list:
    """
    Convert a dict of {date_str: hours} into a weekly schedule structure.
    Looks at the current week and next week to determine the pattern,
    then builds schedule blocks with start/end dates.
    """
    if not date_hours:
        return []

    # Sort dates
    sorted_dates = sorted(date_hours.keys())
    if not sorted_dates:
        return []

    # Group into weekly patterns
    # Build a day-of-week → hours mapping for each contiguous stretch
    # For simplicity, compute one weekly pattern from the current week's data

    today = reference_date.date()
    # Find the Sunday of the current week
    week_start = today - timedelta(days=today.weekday() + 1)  # Monday=0, so +1 for Sunday
    if today.weekday() == 6:  # If today is Sunday
        week_start = today

    # Collect hours for this week (Sun-Sat)
    current_week = {}
    for i in range(7):
        d = week_start + timedelta(days=i)
        ds = d.isoformat()
        if ds in date_hours:
            current_week[i] = date_hours[ds]
        # i: 0=Sun, 1=Mon, ..., 6=Sat

    # Also look at next week to see if the pattern changes
    next_week_start = week_start + timedelta(days=7)
    next_week = {}
    for i in range(7):
        d = next_week_start + timedelta(days=i)
        ds = d.isoformat()
        if ds in date_hours:
            next_week[i] = date_hours[ds]

    schedules = []

    # Build a schedule block for the current data range
    first_date = sorted_dates[0]
    last_date = sorted_dates[-1]

    # Use current week as the primary pattern
    hours_map = {}
    for dow in range(7):
        if dow in current_week:
            hours_map[str(dow)] = current_week[dow]
        else:
            hours_map[str(dow)] = None

    schedules.append({
        "label": "Current",
        "start": first_date,
        "end": last_date,
        "hours": hours_map
    })

    # If next week has a different pattern, add it as a separate block
    if next_week and next_week != current_week:
        next_first = (next_week_start).isoformat()
        next_hours_map = {}
        for dow in range(7):
            if dow in next_week:
                next_hours_map[str(dow)] = next_week[dow]
            else:
                next_hours_map[str(dow)] = None
        # Only add if meaningfully different
        if next_hours_map != hours_map:
            schedules.insert(0, {
                "label": "Upcoming",
                "start": next_first,
                "end": last_date,
                "hours": next_hours_map
            })

    return schedules


def scrape_library(lib_def: dict, reference_date: datetime) -> dict:
    """Scrape a single library and return its data structure."""
    slug = lib_def["slug"]
    name = lib_def["name"]
    note = lib_def.get("note")

    print(f"  Scraping {name} ({slug})...", file=sys.stderr)

    # Fetch current month
    soup = fetch_library_page(slug)
    if not soup:
        return make_fallback_entry(lib_def)

    date_hours = extract_schedule_from_page(soup)

    # Check if library is marked as temporarily closed
    page_text = soup.get_text().lower()
    temporarily_closed = (
        "currently closed" in page_text
        or "temporarily closed" in page_text
        or "closed for renovation" in page_text
        or "closed for upgrades" in page_text
    )

    if temporarily_closed and not date_hours:
        # Get the note from the page if we don't have one
        if not note:
            for p in soup.find_all("p"):
                text = p.get_text(strip=True)
                if "closed" in text.lower() and len(text) < 200:
                    note = text
                    break
        return {
            "id": slug.replace("-", "_"),
            "name": name,
            "url": f"{BASE_URL}/{slug}",
            "note": note,
            "temporarilyClosed": True,
            "schedules": [{
                "label": "Temporarily Closed",
                "start": "2026-01-01",
                "end": "2026-12-31",
                "hours": {str(d): None for d in range(7)}
            }]
        }

    # If we got date-hours, convert to weekly schedule
    if date_hours:
        schedules = dates_to_weekly_schedule(date_hours, reference_date)
    else:
        # Couldn't parse — check next month too
        next_month = reference_date + timedelta(days=35)
        next_date = next_month.strftime("%Y-%m-%d")
        soup2 = fetch_library_page(slug, date=next_date)
        if soup2:
            date_hours2 = extract_schedule_from_page(soup2)
            date_hours.update(date_hours2)
        schedules = dates_to_weekly_schedule(date_hours, reference_date) if date_hours else []

    if not schedules:
        return make_fallback_entry(lib_def)

    return {
        "id": slug.replace("-", "_"),
        "name": name,
        "url": f"{BASE_URL}/{slug}",
        "note": note,
        "temporarilyClosed": False,
        "schedules": schedules
    }


def make_fallback_entry(lib_def: dict) -> dict:
    """Return a minimal entry when scraping fails — marks hours as unknown."""
    return {
        "id": lib_def["slug"].replace("-", "_"),
        "name": lib_def["name"],
        "url": f"{BASE_URL}/{lib_def['slug']}",
        "note": lib_def.get("note", "Hours unavailable — check Columbia Libraries website"),
        "temporarilyClosed": False,
        "schedules": [{
            "label": "Unknown",
            "start": "2026-01-01",
            "end": "2026-12-31",
            "hours": {str(d): None for d in range(7)}
        }],
        "scrapeFailed": True
    }


# ── Main ─────────────────────────────────────────────────────────────

def main():
    dry_run = "--dry-run" in sys.argv
    now = datetime.now()

    print(f"LionHour Scraper — {now.strftime('%Y-%m-%d %H:%M:%S')}", file=sys.stderr)
    print(f"Scraping {len(LIBRARIES)} libraries...\n", file=sys.stderr)

    results = []
    failed = []

    for lib_def in LIBRARIES:
        entry = scrape_library(lib_def, now)
        results.append(entry)
        if entry.get("scrapeFailed"):
            failed.append(entry["name"])

    # Build the JS output
    timestamp = now.strftime("%B %d, %Y at %I:%M %p")
    data_obj = {
        "generated": now.isoformat(),
        "generatedDisplay": timestamp,
        "libraries": results
    }

    js_content = (
        "// Auto-generated by scrape.py — do not edit by hand\n"
        f"// Last updated: {timestamp}\n"
        f"const LIONHOUR_DATA = {json.dumps(data_obj, indent=2)};\n"
    )

    if dry_run:
        print(js_content)
    else:
        out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data.js")
        with open(out_path, "w") as f:
            f.write(js_content)
        print(f"\nWrote {out_path} ({len(js_content)} bytes)", file=sys.stderr)

    # Summary
    ok = len(results) - len(failed)
    print(f"\nDone: {ok}/{len(results)} libraries scraped successfully.", file=sys.stderr)
    if failed:
        print(f"Failed: {', '.join(failed)}", file=sys.stderr)
        print("(Failed libraries show 'Hours unavailable' on the site)", file=sys.stderr)

    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
