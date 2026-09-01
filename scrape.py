#!/usr/bin/env python3
"""Scrape the seven LionHour library cards from their official hours sources."""

from __future__ import annotations

import argparse
import json
import re
import sys
import tempfile
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Callable, Optional
from zoneinfo import ZoneInfo

import requests
from bs4 import BeautifulSoup

BASE_URL = "https://hours.library.columbia.edu/locations"
BARNARD_HOLIDAY_URL = "https://library.barnard.edu/visit/hours"
EASTERN = ZoneInfo("America/New_York")
HEADERS = {"User-Agent": "LionHour/1.0 (Columbia University student project)"}

# These identifiers are deliberately independent. id joins scraped data to the
# existing frontend card; slug belongs to Columbia; venue_id belongs to LionHour.
DISPLAYED_LIBRARIES = [
    {"id": "butler_24", "slug": "butler-24", "venue_id": "butler", "name": "Butler Library"},
    {"id": "science_engineering", "slug": "science-engineering", "venue_id": "noco", "name": "NoCo Library"},
    {"id": "lehman", "slug": "lehman", "venue_id": "lehman", "name": "Lehman Social Sciences Library"},
    {"id": "business", "slug": "business", "venue_id": "uris", "name": "Uris Library"},
    {
        "id": "avery",
        "slug": "avery",
        "venue_id": "avery",
        "name": "Avery Library",
        "note": "Service desk closes 15 min before the library",
    },
    {"id": "math", "slug": "math", "venue_id": "math", "name": "Mathematics Library"},
    {
        "id": "barnard",
        "slug": "barnard",
        "venue_id": "milstein",
        "name": "Milstein Library",
        "holiday_url": BARNARD_HOLIDAY_URL,
        "note": "CU/BC ID swipe required; holiday closures come from Barnard Library",
    },
]
DISPLAYED_LIBRARY_IDS = {library["id"] for library in DISPLAYED_LIBRARIES}
EMBEDDED_FALLBACK_LIBRARY_IDS = {"lehman", "business"}
EMBEDDED_FALLBACK_REASON = "unapproved-overnight-hours"
LEHMAN_MERIDIEM_ANOMALY = {"open": "21:00", "close": "17:00"}
LEHMAN_CORRECTED_HOURS = {"open": "09:00", "close": "17:00"}

TIME_RE = re.compile(r"^(\d{1,2}):(\d{2})\s*([AaPp][Mm])$")
RANGE_RE = re.compile(
    r"(\d{1,2}:\d{2}\s*[AaPp][Mm])\s*[-–—]\s*(\d{1,2}:\d{2}\s*[AaPp][Mm])"
)
ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
CANONICAL_TIME_RE = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class ScheduleParseError(ValueError):
    """Raised when source markup contains hours that are not understood."""


def parse_time(value: str) -> str:
    """Convert a 12-hour clock value to canonical 24-hour HH:MM."""
    match = TIME_RE.fullmatch(value.strip())
    if not match:
        raise ScheduleParseError(f"unrecognized time: {value!r}")
    hour, minute, meridiem = int(match.group(1)), int(match.group(2)), match.group(3).upper()
    if hour < 1 or hour > 12 or minute > 59:
        raise ScheduleParseError(f"invalid time: {value!r}")
    if meridiem == "AM":
        hour = 0 if hour == 12 else hour
    elif hour != 12:
        hour += 12
    return f"{hour:02d}:{minute:02d}"


def parse_hours_text(text: str) -> Optional[dict[str, str]]:
    """Parse hours text, distinguishing a real closure from a parse failure."""
    normalized = " ".join(text.split())
    if normalized.casefold() == "closed":
        return None
    if normalized.casefold() == "tbd":
        return None
    if re.match(r"(?i)open\s+24\s+hours", normalized):
        return {"open": "00:00", "close": "00:00"}
    match = RANGE_RE.search(normalized)
    if not match:
        raise ScheduleParseError(f"unrecognized hours text: {normalized!r}")
    return {"open": parse_time(match.group(1)), "close": parse_time(match.group(2))}


def fetch_library_page(slug: str, date_value: Optional[str] = None) -> Optional[BeautifulSoup]:
    url = f"{BASE_URL}/{slug}"
    if date_value:
        url = f"{url}?date={date_value}"
    try:
        response = requests.get(url, headers=HEADERS, timeout=20)
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"[ERROR] Failed to fetch {slug}: {exc}", file=sys.stderr)
        return None
    return BeautifulSoup(response.text, "html.parser")


def fetch_barnard_holiday_page() -> Optional[BeautifulSoup]:
    try:
        response = requests.get(BARNARD_HOLIDAY_URL, headers=HEADERS, timeout=20)
        response.raise_for_status()
    except requests.RequestException as exc:
        print(f"[ERROR] Failed to fetch Barnard holiday hours: {exc}", file=sys.stderr)
        return None
    return BeautifulSoup(response.text, "html.parser")


def extract_schedule_from_page(soup: BeautifulSoup) -> dict[str, Optional[dict[str, str]]]:
    """Extract ISO-dated calendar cells from Columbia's location page."""
    schedule: dict[str, Optional[dict[str, str]]] = {}
    for cell in soup.select("td"):
        date_element = cell.select_one(".fulldate")
        date_value = date_element.get_text(strip=True) if date_element else cell.get("data-date")
        if not date_value or not ISO_DATE_RE.fullmatch(date_value):
            continue
        hours_element = cell.select_one(".day-hours")
        if hours_element is None:
            raise ScheduleParseError(f"{date_value}: missing .day-hours")
        schedule[date_value] = parse_hours_text(hours_element.get_text(" ", strip=True))
    if not schedule:
        raise ScheduleParseError("no dated calendar cells found")
    return schedule


def extract_barnard_holiday_closures(
    soup: BeautifulSoup,
    reference_date: datetime,
) -> set[str]:
    """Return exact ISO closure dates from Barnard's year-bounded holiday table."""
    holiday_heading = next(
        (
            heading
            for heading in soup.find_all(["h2", "h3"])
            if re.search(
                r"\bUpcoming\s+Holidays\s+and\s+Library\s+Closures\b",
                heading.get_text(" ", strip=True),
                re.IGNORECASE,
            )
        ),
        None,
    )
    if holiday_heading is None:
        raise ScheduleParseError("Barnard holiday closure heading is missing")

    schedule_heading = holiday_heading.find_previous(["h2", "h3"])
    years = {
        int(value)
        for value in re.findall(r"\b20\d{2}\b", schedule_heading.get_text(" ", strip=True) if schedule_heading else "")
    }
    reference_year = reference_date.astimezone(EASTERN).year
    if not years or not any(abs(year - reference_year) <= 1 for year in years):
        raise ScheduleParseError("Barnard holiday closures are not bounded to the current schedule year")

    table = holiday_heading.find_next("table")
    if table is None:
        raise ScheduleParseError("Barnard holiday closure table is missing")
    headers = [cell.get_text(" ", strip=True).casefold() for cell in table.find_all("th")]
    if "library closed" not in headers:
        raise ScheduleParseError("Barnard holiday closure table identity is missing")

    closures: set[str] = set()
    for row in table.find_all("tr"):
        cells = row.find_all("td")
        if not cells:
            continue
        label = " ".join(cells[0].get_text(" ", strip=True).split())
        match = re.fullmatch(
            r"(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+"
            r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+"
            r"(\d{1,2})",
            label,
            re.IGNORECASE,
        )
        if not match:
            raise ScheduleParseError(f"unrecognized Barnard holiday date: {label!r}")
        weekday, month, day_value = match.groups()
        candidates = []
        for year in years:
            try:
                candidate = datetime.strptime(
                    f"{month} {day_value} {year}",
                    "%B %d %Y",
                ).date()
            except ValueError as exc:
                raise ScheduleParseError(f"invalid Barnard holiday date: {label!r}") from exc
            if candidate.strftime("%A").casefold() == weekday.casefold():
                candidates.append(candidate)
        if len(candidates) != 1:
            raise ScheduleParseError(f"Barnard holiday weekday is ambiguous or incorrect: {label!r}")
        closures.add(candidates[0].isoformat())
    return closures


def _sunday_on_or_before(value: date) -> date:
    return value - timedelta(days=(value.weekday() + 1) % 7)


def _week_block(date_hours: dict, start: date, label: str) -> dict:
    return {
        "label": label,
        "start": start.isoformat(),
        "end": (start + timedelta(days=6)).isoformat(),
        "hours": {
            str(index): date_hours.get((start + timedelta(days=index)).isoformat())
            for index in range(7)
        },
    }


def dates_to_weekly_schedule(date_hours: dict, reference_date: datetime) -> list[dict]:
    """Create exact Sunday–Saturday current and, when present, upcoming blocks."""
    if not date_hours:
        return []
    current_start = _sunday_on_or_before(reference_date.date())
    schedules = [_week_block(date_hours, current_start, "Current")]
    next_start = current_start + timedelta(days=7)
    next_dates = {(next_start + timedelta(days=index)).isoformat() for index in range(7)}
    if any(day in date_hours for day in next_dates):
        schedules.append(_week_block(date_hours, next_start, "Upcoming"))
    return schedules


def _normalize_known_source_anomalies(
    library_id: str,
    date_hours: dict[str, Optional[dict[str, str]]],
) -> dict[str, Optional[dict[str, str]]]:
    """Apply only explicitly approved, source-specific corrections."""
    if library_id != "lehman":
        return date_hours
    return {
        date_value: (
            LEHMAN_CORRECTED_HOURS.copy()
            if interval == LEHMAN_MERIDIEM_ANOMALY
            else interval
        )
        for date_value, interval in date_hours.items()
    }


def _fallback_entry(definition: dict, reference_date: datetime) -> dict:
    start = _sunday_on_or_before(reference_date.date())
    entry = {
        "id": definition["id"],
        "name": definition["name"],
        "url": f"{BASE_URL}/{definition['slug']}",
        "note": definition.get("note") or "Hours unavailable — check Columbia Libraries website",
        "temporarilyClosed": False,
        "schedules": [_week_block({}, start, "Unknown")],
        "scrapeFailed": True,
    }
    if definition.get("holiday_url"):
        entry["holidayUrl"] = definition["holiday_url"]
    return entry


def _embedded_fallback_entry(definition: dict) -> dict:
    """Tell clients to retain the checked-in schedule for a known source anomaly."""
    return {
        "id": definition["id"],
        "name": definition["name"],
        "url": f"{BASE_URL}/{definition['slug']}",
        "note": definition.get("note"),
        "temporarilyClosed": False,
        "useEmbeddedFallback": True,
        "fallbackReason": EMBEDDED_FALLBACK_REASON,
        "schedules": [],
    }


def _has_unapproved_overnight(library_id: str, schedules: list[dict]) -> bool:
    if library_id == "butler_24":
        return False
    return any(
        interval is not None and interval["close"] <= interval["open"]
        for schedule in schedules
        for interval in schedule["hours"].values()
    )


def scrape_library(
    definition: dict,
    reference_date: datetime,
    fetcher: Callable = fetch_library_page,
    holiday_fetcher: Callable = fetch_barnard_holiday_page,
) -> dict:
    """Fetch and parse one configured library without publishing guessed hours."""
    soup = fetcher(definition["slug"], reference_date.date().isoformat())
    if soup is None:
        return _fallback_entry(definition, reference_date)
    page_text = soup.get_text(" ", strip=True).casefold()
    temporarily_closed = any(
        phrase in page_text
        for phrase in ("currently closed", "temporarily closed", "closed for renovation", "closed for upgrades")
    )
    try:
        date_hours = extract_schedule_from_page(soup)
    except ScheduleParseError as exc:
        if not temporarily_closed:
            print(f"[ERROR] Failed to parse {definition['slug']}: {exc}", file=sys.stderr)
            return _fallback_entry(definition, reference_date)
        date_hours = {}
    date_hours = _normalize_known_source_anomalies(definition["id"], date_hours)
    if definition.get("holiday_url"):
        holiday_soup = holiday_fetcher()
        if holiday_soup is None:
            return _fallback_entry(definition, reference_date)
        try:
            holiday_closures = extract_barnard_holiday_closures(holiday_soup, reference_date)
        except ScheduleParseError as exc:
            print(f"[ERROR] Failed to parse Barnard holiday hours: {exc}", file=sys.stderr)
            return _fallback_entry(definition, reference_date)
        date_hours = {
            date_value: None if date_value in holiday_closures else interval
            for date_value, interval in date_hours.items()
        }
    start = _sunday_on_or_before(reference_date.date())
    schedules = (
        [_week_block({}, start, "Temporarily Closed")]
        if temporarily_closed and not date_hours
        else dates_to_weekly_schedule(date_hours, reference_date)
    )
    if not schedules:
        return _fallback_entry(definition, reference_date)
    if (
        definition["id"] in EMBEDDED_FALLBACK_LIBRARY_IDS
        and _has_unapproved_overnight(definition["id"], schedules)
    ):
        return _embedded_fallback_entry(definition)
    entry = {
        "id": definition["id"],
        "name": definition["name"],
        "url": f"{BASE_URL}/{definition['slug']}",
        "note": definition.get("note"),
        "temporarilyClosed": temporarily_closed,
        "schedules": schedules,
    }
    if definition.get("holiday_url"):
        entry["holidayUrl"] = definition["holiday_url"]
    return entry


def build_payload(
    reference_date: datetime,
    fetcher: Callable = fetch_library_page,
    holiday_fetcher: Callable = fetch_barnard_holiday_page,
) -> dict:
    if reference_date.tzinfo is None:
        reference_date = reference_date.replace(tzinfo=EASTERN)
    reference_date = reference_date.astimezone(EASTERN)
    return {
        "schemaVersion": 1,
        "generated": reference_date.isoformat(timespec="seconds"),
        "generatedDisplay": reference_date.strftime("%B %-d, %Y at %-I:%M %p"),
        "libraries": [
            scrape_library(item, reference_date, fetcher, holiday_fetcher)
            for item in DISPLAYED_LIBRARIES
        ],
    }


def validate_publishable_payload(payload: object, required_ids: set[str]) -> list[str]:
    """Return validation errors; an empty list means the snapshot is safe to publish."""
    errors: list[str] = []
    if not isinstance(payload, dict):
        return ["payload must be an object"]
    if payload.get("schemaVersion") != 1:
        errors.append("schemaVersion must be 1")
    try:
        generated = datetime.fromisoformat(payload.get("generated", ""))
        if generated.tzinfo is None:
            raise ValueError
        generated_day = generated.astimezone(EASTERN).date()
    except (TypeError, ValueError):
        errors.append("generated must be a timezone-aware ISO timestamp")
        generated_day = None

    libraries = payload.get("libraries")
    if not isinstance(libraries, list):
        return errors + ["libraries must be an array"]
    seen: set[str] = set()
    for library in libraries:
        if not isinstance(library, dict):
            errors.append("library must be an object")
            continue
        library_id = library.get("id")
        if not isinstance(library_id, str):
            errors.append("library id must be a string")
            continue
        if library_id in seen:
            errors.append(f"duplicate library: {library_id}")
        seen.add(library_id)
        if library.get("scrapeFailed") is True:
            errors.append(f"{library_id}: scrape failed")
        if not isinstance(library.get("temporarilyClosed"), bool):
            errors.append(f"{library_id}: temporarilyClosed must be boolean")
        url = library.get("url", "")
        if not isinstance(url, str) or not url.startswith(f"{BASE_URL}/"):
            errors.append(f"{library_id}: invalid Columbia hours URL")
        holiday_url = library.get("holidayUrl")
        if library_id == "barnard":
            if url != f"{BASE_URL}/barnard":
                errors.append("barnard: invalid primary hours URL")
            if holiday_url != BARNARD_HOLIDAY_URL:
                errors.append("barnard: invalid holiday hours URL")
        elif "holidayUrl" in library:
            errors.append(f"{library_id}: only barnard may use holidayUrl")
        use_embedded_fallback = library.get("useEmbeddedFallback", False)
        if not isinstance(use_embedded_fallback, bool):
            errors.append(f"{library_id}: useEmbeddedFallback must be boolean")
            use_embedded_fallback = False
        if use_embedded_fallback:
            if library_id not in EMBEDDED_FALLBACK_LIBRARY_IDS:
                errors.append(f"{library_id}: embedded fallback is not allowed")
            if library.get("fallbackReason") != EMBEDDED_FALLBACK_REASON:
                errors.append(f"{library_id}: invalid fallback reason")
            if library.get("temporarilyClosed") is not False:
                errors.append(f"{library_id}: fallback cannot be temporarily closed")
            if library.get("schedules") != []:
                errors.append(f"{library_id}: fallback schedules must be empty")
            continue
        if "fallbackReason" in library:
            errors.append(f"{library_id}: fallback reason requires embedded fallback")
        schedules = library.get("schedules")
        if not isinstance(schedules, list) or not schedules:
            errors.append(f"{library_id}: schedules must be a non-empty array")
            continue
        active = None
        for schedule in schedules:
            if not isinstance(schedule, dict):
                continue
            try:
                start = date.fromisoformat(schedule.get("start", ""))
                end = date.fromisoformat(schedule.get("end", ""))
            except (TypeError, ValueError):
                errors.append(f"{library_id}: invalid schedule date range")
                continue
            hours = schedule.get("hours")
            if not isinstance(hours, dict) or set(hours) != {str(index) for index in range(7)}:
                errors.append(f"{library_id}: hours must contain days 0 through 6")
                continue
            for day, interval in hours.items():
                if interval is None:
                    continue
                valid_interval = (
                    isinstance(interval, dict)
                    and set(interval) == {"open", "close"}
                    and all(
                        isinstance(interval.get(key), str)
                        and CANONICAL_TIME_RE.fullmatch(interval[key])
                        for key in ("open", "close")
                    )
                )
                if not valid_interval:
                    errors.append(f"{library_id}: invalid hours for day {day}")
                elif library_id != "butler_24" and interval["close"] <= interval["open"]:
                    error = f"{library_id}: overnight hours are not allowed"
                    if error not in errors:
                        errors.append(error)
            if generated_day is not None and start <= generated_day <= end:
                active = schedule
        if active is None:
            errors.append(f"{library_id}: no schedule covers generated date")
        elif library.get("temporarilyClosed") and any(active["hours"].values()):
            errors.append(f"{library_id}: temporarily closed schedule must contain only closed days")

    for library_id in sorted(required_ids - seen):
        errors.append(f"missing required library: {library_id}")
    for library_id in sorted(seen - required_ids):
        errors.append(f"unexpected library: {library_id}")
    return errors


def _atomic_write(destination: Path, content: str) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=destination.parent, delete=False) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    temporary.replace(destination)


def main(argv: Optional[list[str]] = None, builder: Callable[[datetime], dict] = build_payload) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="print generated data.js")
    parser.add_argument("--json-out", type=Path, help="write the validated JSON snapshot")
    args = parser.parse_args(argv)
    payload = builder(datetime.now(EASTERN))
    errors = validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS)
    if errors:
        for error in errors:
            print(f"[VALIDATION] {error}", file=sys.stderr)
        return 1
    serialized = json.dumps(payload, indent=2) + "\n"
    if args.json_out:
        _atomic_write(args.json_out, serialized)
    else:
        js = "// Auto-generated by scrape.py — do not edit by hand\n"
        js += f"const LIONHOUR_DATA = {json.dumps(payload, indent=2)};\n"
        if args.dry_run:
            print(js, end="")
        else:
            _atomic_write(Path(__file__).with_name("data.js"), js)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
