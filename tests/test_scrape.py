import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from bs4 import BeautifulSoup

from scrape import (
    DISPLAYED_LIBRARIES,
    DISPLAYED_LIBRARY_IDS,
    ScheduleParseError,
    build_payload,
    dates_to_weekly_schedule,
    extract_schedule_from_page,
    main,
    parse_hours_text,
    validate_publishable_payload,
)


FIXTURES = Path(__file__).parent / "fixtures"


def current_schedule():
    return {
        "label": "Current",
        "start": "2026-08-16",
        "end": "2026-08-22",
        "hours": {
            "0": None,
            "1": {"open": "09:00", "close": "21:00"},
            "2": {"open": "09:00", "close": "21:00"},
            "3": {"open": "09:00", "close": "21:00"},
            "4": {"open": "09:00", "close": "21:00"},
            "5": {"open": "09:00", "close": "19:00"},
            "6": {"open": "11:00", "close": "18:00"},
        },
    }


def make_complete_payload():
    libraries = []
    for definition in DISPLAYED_LIBRARIES:
        libraries.append({
            "id": definition["id"],
            "name": definition["name"],
            "url": f"https://hours.library.columbia.edu/locations/{definition['slug']}",
            "note": definition.get("note"),
            "temporarilyClosed": False,
            "schedules": [current_schedule()],
        })
    return {
        "schemaVersion": 1,
        "generated": "2026-08-20T12:00:00-04:00",
        "generatedDisplay": "August 20, 2026 at 12:00 PM",
        "libraries": libraries,
    }


class ScraperContractTests(unittest.TestCase):
    def test_explicitly_closed_is_distinct_from_unparseable(self):
        self.assertIsNone(parse_hours_text("Closed"))
        with self.assertRaises(ScheduleParseError):
            parse_hours_text("Hours available at service desk")

    def test_extracts_open_and_closed_days_from_minimal_fixture(self):
        soup = BeautifulSoup((FIXTURES / "butler-august-2026.html").read_text(), "html.parser")
        schedule = extract_schedule_from_page(soup)
        self.assertEqual(schedule["2026-08-20"], {"open": "09:00", "close": "21:00"})
        self.assertIsNone(schedule["2026-08-23"])

    def test_extracts_realistic_calendar_with_adjacent_month_cells(self):
        soup = BeautifulSoup((FIXTURES / "butler-august-2026-full.html").read_text(), "html.parser")
        schedule = extract_schedule_from_page(soup)
        self.assertEqual(schedule["2026-07-31"], {"open": "09:00", "close": "19:00"})
        self.assertEqual(schedule["2026-08-20"], {"open": "09:00", "close": "21:00"})
        self.assertIsNone(schedule["2026-08-23"])

    def test_library_identity_is_explicit_and_unique(self):
        self.assertEqual(
            [(item["id"], item["slug"], item["venue_id"]) for item in DISPLAYED_LIBRARIES],
            [
                ("butler_24", "butler-24", "butler"),
                ("science_engineering", "science-engineering", "noco"),
                ("lehman", "lehman", "lehman"),
                ("business", "business", "uris"),
                ("avery", "avery", "avery"),
                ("math", "math", "math"),
            ],
        )

    def test_builds_exact_current_and_upcoming_week_ranges(self):
        date_hours = {
            "2026-08-16": None,
            "2026-08-17": {"open": "09:00", "close": "21:00"},
            "2026-08-20": {"open": "09:00", "close": "21:00"},
            "2026-08-22": {"open": "11:00", "close": "18:00"},
            "2026-08-23": None,
            "2026-08-24": {"open": "09:00", "close": "21:00"},
        }
        schedules = dates_to_weekly_schedule(date_hours, datetime.fromisoformat("2026-08-20T12:00:00-04:00"))
        self.assertEqual((schedules[0]["start"], schedules[0]["end"]), ("2026-08-16", "2026-08-22"))
        self.assertEqual((schedules[1]["start"], schedules[1]["end"]), ("2026-08-23", "2026-08-29"))

    def test_rejects_snapshot_missing_a_displayed_library(self):
        payload = make_complete_payload()
        payload["libraries"] = payload["libraries"][1:]
        errors = validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS)
        self.assertIn("missing required library: butler_24", errors)

    def test_rejects_scrape_failure_in_required_library(self):
        payload = make_complete_payload()
        payload["libraries"][0]["scrapeFailed"] = True
        errors = validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS)
        self.assertIn("butler_24: scrape failed", errors)

    def test_rejects_unapproved_overnight_library_hours(self):
        payload = make_complete_payload()
        lehman = next(item for item in payload["libraries"] if item["id"] == "lehman")
        lehman["schedules"][0]["hours"]["1"] = {"open": "21:00", "close": "17:00"}
        errors = validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS)
        self.assertIn("lehman: overnight hours are not allowed", errors)

    def test_build_payload_publishes_only_displayed_libraries(self):
        html = (FIXTURES / "butler-august-2026-full.html").read_text()

        def fetcher(slug, date=None):
            self.assertIn(slug, {item["slug"] for item in DISPLAYED_LIBRARIES})
            return BeautifulSoup(html, "html.parser")

        payload = build_payload(datetime.fromisoformat("2026-08-20T12:00:00-04:00"), fetcher=fetcher)
        self.assertEqual({item["id"] for item in payload["libraries"]}, DISPLAYED_LIBRARY_IDS)
        self.assertEqual(len(payload["libraries"]), 6)

    def test_invalid_payload_is_not_written(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "hours.json"
            invalid = make_complete_payload()
            invalid["libraries"] = []
            exit_code = main(["--json-out", str(destination)], builder=lambda _: invalid)
            self.assertEqual(exit_code, 1)
            self.assertFalse(destination.exists())

    def test_valid_payload_is_written_as_json(self):
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "hours.json"
            payload = make_complete_payload()
            exit_code = main(["--json-out", str(destination)], builder=lambda _: payload)
            self.assertEqual(exit_code, 0)
            self.assertEqual(json.loads(destination.read_text()), payload)


if __name__ == "__main__":
    unittest.main()
