"""Tests for scrape_menus.py against the September 2026 LionDine markup.

LionDine was rebuilt in September 2026 and both its URLs and its DOM changed,
which silently emptied data/menus.json for two days. These tests pin the URL
shape and every branch of the parser to a saved fixture so the next redesign
fails a test instead of a day's menus.
"""

import os
import sys
import json
import subprocess

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import scrape_menus  # noqa: E402

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURE = os.path.join(REPO_ROOT, 'tests', 'fixtures',
                       'liondine-meals-2026-09-14.html')


@pytest.fixture(scope='module')
def meal_html():
    with open(FIXTURE, encoding='utf-8') as f:
        return f.read()


@pytest.fixture(scope='module')
def parsed(meal_html):
    return scrape_menus.parse_meal_html(meal_html, 'lunch')


# --- URLs -------------------------------------------------------------------

def test_meal_urls_use_the_meals_prefix():
    """The pre-2026 paths (/lunch) now 404; pages live under /meals/."""
    calls = []

    class FakeResponse:
        status_code = 200
        text = '<div class="hall-card"></div>'

        def raise_for_status(self):
            return None

    class FakeSession:
        def get(self, url, **kwargs):
            calls.append(url)
            return FakeResponse()

    for slug in scrape_menus.MEAL_SLUGS:
        scrape_menus.scrape_meal(FakeSession(), slug)

    assert calls == [
        'https://liondine.com/meals/breakfast',
        'https://liondine.com/meals/lunch',
        'https://liondine.com/meals/dinner',
        'https://liondine.com/meals/latenight',
    ]


# --- Parsing ----------------------------------------------------------------

def test_parses_every_hall_card(parsed):
    assert set(parsed) == {'ferris', 'jjs', 'facultyhouse', 'diana-center-cafe'}


def test_open_venue_has_stations_and_items(parsed):
    jjs = parsed['jjs']
    assert jjs['available'] is True
    assert jjs['status'] is None
    assert jjs['hours'] == {'open': '12:00 PM', 'close': '10:00 AM'}
    assert [s['name'] for s in jjs['stations']] == [
        'Fry Station', 'Grill', 'Main Line',
    ]
    assert jjs['stations'][0]['items'] == [
        'Crinkle Cut Fries', 'Dino Nuggets', 'Mac and Cheese Bites',
    ]
    assert jjs['stations'][2]['items'] == ["Chef's Special"]


def test_station_names_come_from_the_station_header(parsed):
    """Stations moved from flat .food-type siblings to h3.station-header."""
    assert all(s['name'] != 'General' for s in parsed['jjs']['stations'])


def test_closed_venue(parsed):
    ferris = parsed['ferris']
    assert ferris['available'] is False
    assert ferris['hours'] is None
    assert ferris['stations'] == []
    assert ferris['status'] == 'Closed for latenight'


def test_open_venue_with_no_published_menu(parsed):
    """LionDine now writes 'No data available' rather than 'No menu published'."""
    fh = parsed['facultyhouse']
    assert fh['available'] is False
    assert fh['status'] == 'No menu published'
    assert fh['stations'] == []
    assert fh['hours'] == {'open': '7:30 AM', 'close': '11:00 AM'}


def test_midnight_close_time_is_kept(parsed):
    assert parsed['diana-center-cafe']['hours'] == {
        'open': '5:00 PM', 'close': 'midnight',
    }


def test_item_whitespace_is_stripped(parsed):
    items = parsed['diana-center-cafe']['stations'][0]['items']
    assert 'Orange Chicken' in items


def test_unknown_markup_yields_nothing_rather_than_guessing():
    assert scrape_menus.parse_meal_html(
        '<div class="container"><div class="col"><h3>Ferris</h3></div></div>',
        'lunch',
    ) == {}


@pytest.mark.parametrize('text,expected', [
    ('11:00 AM to 5:00 PM', {'open': '11:00 AM', 'close': '5:00 PM'}),
    ('5:00 PM to midnight', {'open': '5:00 PM', 'close': 'midnight'}),
    ('12:00 PM to 10:00 AM', {'open': '12:00 PM', 'close': '10:00 AM'}),
    ('Closed for lunch', None),
    ('', None),
])
def test_parse_hours(text, expected):
    assert scrape_menus.parse_hours(text) == expected


# --- Validation and failure behaviour ---------------------------------------

def test_empty_scrape_is_fatal():
    fatal, _ = scrape_menus.validate_payload(
        {'date': '2026-09-14', 'venues': {}, 'unavailable': []})
    assert fatal


def test_venues_without_any_items_is_fatal():
    payload = {
        'date': '2026-09-14',
        'venues': {'ferris': {'meals': {'lunch': {
            'available': False, 'stations': [], 'status': 'Closed for lunch',
        }}}},
    }
    fatal, _ = scrape_menus.validate_payload(payload)
    assert fatal


def test_good_payload_is_not_fatal(parsed):
    payload = {
        'date': '2026-09-14',
        'venues': {vid: {'meals': {'lunch': data}}
                   for vid, data in parsed.items()},
    }
    fatal, _ = scrape_menus.validate_payload(payload)
    assert fatal == []


def test_failed_scrape_exits_nonzero_and_keeps_existing_file(tmp_path, monkeypatch):
    """A broken scrape must not overwrite the last good menus.json."""
    out = tmp_path / 'menus.json'
    good = {'schemaVersion': 1, 'date': '2026-09-13', 'venues': {'ferris': {}}}
    out.write_text(json.dumps(good))

    script = os.path.join(REPO_ROOT, 'scrape_menus.py')
    env = dict(os.environ, LIONHOUR_TEST_FORCE_EMPTY='1')

    result = subprocess.run(
        [sys.executable, '-c', (
            'import sys, json;'
            f'sys.path.insert(0, {REPO_ROOT!r});'
            'import scrape_menus;'
            'scrape_menus.scrape_all_menus = lambda: '
            '{"schemaVersion":1,"date":"2026-09-14","venues":{},"unavailable":[]};'
            f'sys.argv = ["scrape_menus.py", "--out", {str(out)!r}];'
            'sys.exit(scrape_menus.main())'
        )],
        capture_output=True, text=True, env=env, cwd=REPO_ROOT,
    )

    assert result.returncode != 0, result.stderr
    assert 'no usable data' in result.stderr.lower()
    assert json.loads(out.read_text()) == good


def test_allow_empty_opt_out_still_writes(tmp_path):
    out = tmp_path / 'menus.json'
    result = subprocess.run(
        [sys.executable, '-c', (
            'import sys;'
            f'sys.path.insert(0, {REPO_ROOT!r});'
            'import scrape_menus;'
            'scrape_menus.scrape_all_menus = lambda: '
            '{"schemaVersion":1,"date":"2026-09-14","venues":{},"unavailable":[]};'
            f'sys.argv = ["scrape_menus.py", "--out", {str(out)!r}, "--allow-empty"];'
            'sys.exit(scrape_menus.main())'
        )],
        capture_output=True, text=True, cwd=REPO_ROOT,
    )
    assert result.returncode == 0, result.stderr
    assert out.exists()


# --- Whole-page sanity check against the real /meals/lunch markup -----------

LUNCH_FIXTURE = os.path.join(REPO_ROOT, 'tests', 'fixtures',
                             'liondine-lunch-2026-09-14.html')

EXPECTED_LUNCH_VENUES = {
    'ferris', 'jjs', 'facultyhouse', 'gracedodge', 'johnnys', 'facshack',
    'johnjay', 'hewitt', 'chefmikes', 'diana-center-cafe', 'chefdons',
}


@pytest.fixture(scope='module')
def lunch():
    with open(LUNCH_FIXTURE, encoding='utf-8') as f:
        return scrape_menus.parse_meal_html(f.read(), 'lunch')


def test_every_liondine_venue_resolves_to_a_lionhour_id(lunch):
    """Every hall LionDine lists must map onto a LionHour venue."""
    assert set(lunch) == EXPECTED_LUNCH_VENUES


def test_every_open_venue_has_hours_and_a_menu(lunch):
    for vid, data in lunch.items():
        assert data['hours'] is not None, f'{vid} lost its hours'
        assert data['available'] is True, f'{vid} parsed with no menu'
        assert data['stations'], f'{vid} parsed with no stations'
        for station in data['stations']:
            assert station['items'], f'{vid}/{station["name"]} has no items'


def test_station_named_after_a_venue_is_not_mistaken_for_one(lunch):
    """John Jay lists a 'Chef Mike's Kitchen' station; it is not a venue."""
    names = [s['name'] for s in lunch['johnjay']['stations']]
    assert "Chef Mike's Kitchen" in names
    assert lunch['chefmikes']['stations'][0]['name'] == 'Build Your Own - Counter'


def test_html_entities_are_decoded(lunch):
    items = lunch['facultyhouse']['stations'][0]['items']
    assert 'Beef & Broccoli' in items
