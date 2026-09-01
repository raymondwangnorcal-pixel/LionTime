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
    extract_barnard_holiday_closures,
    extract_schedule_from_page,
    main,
    parse_hours_text,
    scrape_library,
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
        if definition["id"] == "barnard":
            libraries[-1]["holidayUrl"] = "https://library.barnard.edu/visit/hours"
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
                ("barnard", "barnard", "milstein"),
            ],
        )

    def test_extracts_only_year_bounded_barnard_holiday_closures(self):
        soup = BeautifulSoup(
            (FIXTURES / "barnard-library-holidays.html").read_text(),
            "html.parser",
        )
        closures = extract_barnard_holiday_closures(
            soup,
            datetime.fromisoformat("2026-08-20T12:00:00-04:00"),
        )
        self.assertEqual(
            closures,
            {"2026-05-25", "2026-06-19", "2026-09-07"},
        )

    def test_rejects_barnard_holiday_rows_without_a_valid_year_and_weekday(self):
        missing_year = BeautifulSoup(
            """
            <h2>Summer Hours</h2>
            <h2>Upcoming Holidays and Library Closures</h2>
            <table><tr><th>Library Closed</th></tr><tr><td>Monday, September 7</td></tr></table>
            """,
            "html.parser",
        )
        with self.assertRaises(ScheduleParseError):
            extract_barnard_holiday_closures(
                missing_year,
                datetime.fromisoformat("2026-08-20T12:00:00-04:00"),
            )

        wrong_weekday = BeautifulSoup(
            """
            <h2>Summer 2026 Hours</h2>
            <h2>Upcoming Holidays and Library Closures</h2>
            <table><tr><th>Library Closed</th></tr><tr><td>Tuesday, September 7</td></tr></table>
            """,
            "html.parser",
        )
        with self.assertRaises(ScheduleParseError):
            extract_barnard_holiday_closures(
                wrong_weekday,
                datetime.fromisoformat("2026-08-20T12:00:00-04:00"),
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

    def test_corrects_known_lehman_meridiem_anomaly_and_preserves_closed_days(self):
        html = """
        <table><tr>
          <td>
            <div class="fulldate">2026-08-23</div>
            <div class="day-hours">Closed</div>
          </td>
          <td>
            <div class="fulldate">2026-08-24</div>
            <div class="day-hours">9:00PM-5:00PM</div>
          </td>
        </tr></table>
        """
        definition = next(item for item in DISPLAYED_LIBRARIES if item["id"] == "lehman")
        entry = scrape_library(
            definition,
            datetime.fromisoformat("2026-08-23T12:00:00-04:00"),
            fetcher=lambda slug, date=None: BeautifulSoup(html, "html.parser"),
        )
        current_hours = entry["schedules"][0]["hours"]
        self.assertNotIn("useEmbeddedFallback", entry)
        self.assertIsNone(current_hours["0"])
        self.assertEqual(current_hours["1"], {"open": "09:00", "close": "17:00"})

    def test_marks_other_suspicious_lehman_hours_for_embedded_fallback(self):
        html = """
        <table><tr><td>
          <div class="fulldate">2026-08-20</div>
          <div class="day-hours">8:00PM-5:00PM</div>
        </td></tr></table>
        """
        definition = next(item for item in DISPLAYED_LIBRARIES if item["id"] == "lehman")
        entry = scrape_library(
            definition,
            datetime.fromisoformat("2026-08-20T12:00:00-04:00"),
            fetcher=lambda slug, date=None: BeautifulSoup(html, "html.parser"),
        )
        self.assertTrue(entry["useEmbeddedFallback"])
        self.assertEqual(entry["fallbackReason"], "unapproved-overnight-hours")
        self.assertEqual(entry["schedules"], [])
        self.assertNotIn("scrapeFailed", entry)

    def test_accepts_explicit_lehman_embedded_fallback(self):
        payload = make_complete_payload()
        lehman = next(item for item in payload["libraries"] if item["id"] == "lehman")
        lehman.update({
            "useEmbeddedFallback": True,
            "fallbackReason": "unapproved-overnight-hours",
            "schedules": [],
        })
        self.assertEqual(validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS), [])

    def test_rejects_embedded_fallback_for_other_libraries(self):
        payload = make_complete_payload()
        avery = next(item for item in payload["libraries"] if item["id"] == "avery")
        avery.update({
            "useEmbeddedFallback": True,
            "fallbackReason": "unapproved-overnight-hours",
            "schedules": [],
        })
        errors = validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS)
        self.assertIn("avery: embedded fallback is not allowed", errors)

    def test_build_payload_publishes_only_displayed_libraries(self):
        html = (FIXTURES / "butler-august-2026-full.html").read_text()
        holiday_html = (FIXTURES / "barnard-library-holidays.html").read_text()

        def fetcher(slug, date=None):
            self.assertIn(slug, {item["slug"] for item in DISPLAYED_LIBRARIES})
            return BeautifulSoup(html, "html.parser")

        payload = build_payload(
            datetime.fromisoformat("2026-08-20T12:00:00-04:00"),
            fetcher=fetcher,
            holiday_fetcher=lambda: BeautifulSoup(holiday_html, "html.parser"),
        )
        self.assertEqual({item["id"] for item in payload["libraries"]}, DISPLAYED_LIBRARY_IDS)
        self.assertEqual(len(payload["libraries"]), 7)

    def test_barnard_holiday_closure_overrides_primary_open_hours(self):
        primary = BeautifulSoup(
            """
            <table><tr><td>
              <div class="fulldate">2026-09-07</div>
              <div class="day-hours">9:00AM-9:00PM</div>
            </td></tr></table>
            """,
            "html.parser",
        )
        holiday = BeautifulSoup(
            (FIXTURES / "barnard-library-holidays.html").read_text(),
            "html.parser",
        )
        definition = next(item for item in DISPLAYED_LIBRARIES if item["id"] == "barnard")
        entry = scrape_library(
            definition,
            datetime.fromisoformat("2026-09-07T12:00:00-04:00"),
            fetcher=lambda slug, date=None: primary,
            holiday_fetcher=lambda: holiday,
        )
        self.assertIsNone(entry["schedules"][0]["hours"]["1"])
        self.assertEqual(entry["holidayUrl"], "https://library.barnard.edu/visit/hours")

    def test_barnard_holiday_source_failure_fails_closed(self):
        primary = BeautifulSoup(
            """
            <table><tr><td>
              <div class="fulldate">2026-09-07</div>
              <div class="day-hours">9:00AM-9:00PM</div>
            </td></tr></table>
            """,
            "html.parser",
        )
        definition = next(item for item in DISPLAYED_LIBRARIES if item["id"] == "barnard")
        entry = scrape_library(
            definition,
            datetime.fromisoformat("2026-09-07T12:00:00-04:00"),
            fetcher=lambda slug, date=None: primary,
            holiday_fetcher=lambda: None,
        )
        self.assertTrue(entry["scrapeFailed"])

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

    def test_parses_open_24_hours_text(self):
        result = parse_hours_text("Open 24 hours on 09/08/2026")
        self.assertEqual(result, {"open": "00:00", "close": "00:00"})

    def test_parses_open_24_hours_without_date(self):
        result = parse_hours_text("Open 24 hours")
        self.assertEqual(result, {"open": "00:00", "close": "00:00"})

    def test_parses_tbd_as_closed(self):
        self.assertIsNone(parse_hours_text("TBD"))

    def test_parses_tbd_case_insensitive(self):
        self.assertIsNone(parse_hours_text("tbd"))
        self.assertIsNone(parse_hours_text("Tbd"))

    def test_business_overnight_hours_are_approved(self):
        html = """
        <table><tr><td>
          <div class="fulldate">2026-08-20</div>
          <div class="day-hours">10:00AM - 2:00AM</div>
        </td></tr></table>
        """
        definition = next(item for item in DISPLAYED_LIBRARIES if item["id"] == "business")
        entry = scrape_library(
            definition,
            datetime.fromisoformat("2026-08-20T12:00:00-04:00"),
            fetcher=lambda slug, date=None: BeautifulSoup(html, "html.parser"),
        )
        self.assertNotIn("useEmbeddedFallback", entry)
        self.assertNotIn("fallbackReason", entry)
        schedule = entry["schedules"][0]
        self.assertEqual(schedule["hours"]["4"], {"open": "10:00", "close": "02:00"})

    def test_accepts_explicit_business_embedded_fallback(self):
        payload = make_complete_payload()
        business = next(item for item in payload["libraries"] if item["id"] == "business")
        business.update({
            "useEmbeddedFallback": True,
            "fallbackReason": "unapproved-overnight-hours",
            "schedules": [],
        })
        self.assertEqual(validate_publishable_payload(payload, DISPLAYED_LIBRARY_IDS), [])


if __name__ == "__main__":
    unittest.main()
