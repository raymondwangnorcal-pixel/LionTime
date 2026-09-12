import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from discover_prospects import (  # noqa: E402
    Fetcher,
    Prospect,
    classify_email,
    contact_links,
    dedupe,
    extract_emails,
    normalize_address,
    normalize_email,
    normalize_name,
    parse_overpass_elements,
    qualify,
    registrable_domain,
    write_outputs,
)


class NormalizationTests(unittest.TestCase):
    def test_name_drops_legal_suffix_and_article(self):
        self.assertEqual(normalize_name("The Hungarian Pastry Shop, LLC"), "hungarian pastry shop")
        self.assertEqual(normalize_name("Cafe Amrita"), "cafe amrita")

    def test_name_strips_accents_and_punctuation(self):
        self.assertEqual(normalize_name("Cafe  Amrite!"), "cafe amrite")

    def test_address_normalizes_directions_and_types(self):
        self.assertEqual(normalize_address("2955", "Broadway"), "2955 broadway")
        self.assertEqual(normalize_address("1123", "West 116th Street"), "1123 w 116th st")
        self.assertEqual(
            normalize_address("1123", "W 116th St"),
            normalize_address("1123", "West 116th Street"),
        )

    def test_email_lowercases_and_strips_plus_tag(self):
        self.assertEqual(normalize_email("Info+Ads@Example.COM"), "info@example.com")

    def test_email_strips_gmail_dots_only_for_gmail(self):
        self.assertEqual(normalize_email("first.last@gmail.com"), "firstlast@gmail.com")
        self.assertEqual(normalize_email("first.last@cafe.com"), "first.last@cafe.com")

    def test_registrable_domain(self):
        self.assertEqual(registrable_domain("www.example.com"), "example.com")
        self.assertEqual(registrable_domain("shop.example.co.uk"), "example.co.uk")


class OverpassParseTests(unittest.TestCase):
    ELEMENTS = [
        {"type": "node", "id": 1, "lat": 40.806, "lon": -73.963,
         "tags": {"name": "Cafe Amrita", "amenity": "cafe", "addr:housenumber": "1123",
                  "addr:street": "Amsterdam Avenue", "website": "https://amrita.com"}},
        {"type": "way", "id": 2, "center": {"lat": 40.807, "lon": -73.962},
         "tags": {"name": "Corner Deli", "shop": "deli", "contact:website": "cornerdeli.com",
                  "contact:email": "info@cornerdeli.com"}},
        {"type": "node", "id": 3, "tags": {"amenity": "restaurant"}},  # unnamed
        {"type": "node", "id": 4, "tags": {"name": "Gone", "amenity": "restaurant",
                                           "disused:amenity": "restaurant"}},
        {"type": "node", "id": 5, "lat": 40.808, "lon": -73.961,
         "tags": {"name": "Chain Co", "amenity": "fast_food", "brand": "Chain Co"}},
    ]

    def test_parses_named_open_businesses_only(self):
        out = parse_overpass_elements(self.ELEMENTS)
        self.assertEqual([p.name for p in out], ["Cafe Amrita", "Corner Deli", "Chain Co"])

    def test_reads_center_for_ways(self):
        deli = parse_overpass_elements(self.ELEMENTS)[1]
        self.assertEqual(deli.osm_id, "way/2")
        self.assertAlmostEqual(deli.lat, 40.807)

    def test_falls_back_to_contact_prefixed_tags(self):
        deli = parse_overpass_elements(self.ELEMENTS)[1]
        self.assertEqual(deli.website, "cornerdeli.com")
        self.assertEqual(deli.osm_email, "info@cornerdeli.com")

    def test_carries_brand_for_chain_detection(self):
        chain = parse_overpass_elements(self.ELEMENTS)[2]
        self.assertEqual(chain.brand, "Chain Co")


class ExtractionTests(unittest.TestCase):
    HTML = """
    <html><body>
      <a href="mailto:info@cafe.com?subject=hi">Email us</a>
      <p>Catering: events@cafe.com</p>
      <img src="logo@2x.png"><span>noreply@sentry.io</span>
      <a href="/about-us">About</a>
      <a href="/contact">Contact</a>
      <a href="/menu">Menu</a>
      <a href="https://facebook.com/cafe/contact">Facebook</a>
    </body></html>
    """

    def test_extract_emails_finds_mailto_and_text(self):
        found = extract_emails(self.HTML, "https://cafe.com/")
        self.assertIn("info@cafe.com", found)
        self.assertIn("events@cafe.com", found)

    def test_extract_emails_filters_junk(self):
        found = extract_emails(self.HTML, "https://cafe.com/")
        self.assertNotIn("noreply@sentry.io", found)
        self.assertFalse([e for e in found if "2x.png" in e])

    def test_contact_links_same_host_only(self):
        links = contact_links(self.HTML, "https://cafe.com/")
        self.assertIn("https://cafe.com/contact", links)
        self.assertIn("https://cafe.com/about-us", links)
        self.assertFalse([l for l in links if "facebook" in l])

    def test_classify_email(self):
        self.assertEqual(classify_email("info@cafe.com"), "role")
        self.assertEqual(classify_email("raymond@cafe.com"), "personal")


def make(name, **kw):
    base = dict(osm_id=f"node/{abs(hash(name)) % 10000}", name=name, category="restaurant",
                housenumber="2955", street="Broadway")
    base.update(kw)
    return Prospect(**base)


class QualifyTests(unittest.TestCase):
    def test_brand_tag_excludes_as_chain(self):
        p = make("Chain Cafe", brand="Chain Cafe", website="https://chain.com",
                 email="info@chain.com", email_kind="role")
        qualify(p)
        self.assertEqual(p.status, "excluded")
        self.assertTrue(p.status_reason.startswith("chain_brand"))

    def test_missing_website_excluded(self):
        p = make("No Site Deli")
        qualify(p)
        self.assertEqual(p.status, "excluded")
        self.assertEqual(p.status_reason, "no_website")

    def test_role_inbox_on_own_domain_is_ready(self):
        p = make("Good Cafe", website="https://goodcafe.com", email="info@goodcafe.com",
                 email_kind="role")
        qualify(p)
        self.assertEqual(p.status, "ready")

    def test_personal_address_needs_review(self):
        p = make("Solo Cafe", website="https://solo.com", email="maria@solo.com",
                 email_kind="personal")
        qualify(p)
        self.assertEqual(p.status, "review")

    def test_off_domain_address_needs_review(self):
        p = make("Gmail Cafe", website="https://gm.com", email="gmcafe@gmail.com",
                 email_kind="role", flags=["email_off_domain"])
        qualify(p)
        self.assertEqual(p.status, "review")

    def test_no_email_needs_review_not_exclusion(self):
        p = make("Quiet Cafe", website="https://quiet.com", flags=["no_email_found"])
        qualify(p)
        self.assertEqual(p.status, "review")


class DedupeTests(unittest.TestCase):
    def test_same_name_and_address_is_duplicate(self):
        a = make("Cafe Amrita", website="https://a.com", email="info@a.com", email_kind="role")
        b = make("Cafe  Amrita!", website="https://a.com", email="hello@a.com", email_kind="role")
        for p in (a, b):
            qualify(p)
        dedupe([a, b])
        self.assertEqual(a.status, "ready")
        self.assertEqual(b.status, "excluded")
        self.assertEqual(b.duplicate_of, a.osm_id)

    def test_shared_inbox_blocks_second_location(self):
        a = make("Group One", housenumber="100", street="Broadway",
                 website="https://g.com", email="info@g.com", email_kind="role")
        b = make("Group Two", housenumber="200", street="Broadway",
                 website="https://g.com", email="INFO@g.com", email_kind="role")
        for p in (a, b):
            qualify(p)
        dedupe([a, b])
        self.assertEqual(a.status, "ready")
        self.assertEqual(b.status, "excluded")
        self.assertIn("blocked_by_shared_contact", b.flags)

    def test_distinct_businesses_both_survive(self):
        a = make("One", housenumber="100", street="Broadway",
                 website="https://one.com", email="info@one.com", email_kind="role")
        b = make("Two", housenumber="200", street="Broadway",
                 website="https://two.com", email="info@two.com", email_kind="role")
        for p in (a, b):
            qualify(p)
        dedupe([a, b])
        self.assertEqual([a.status, b.status], ["ready", "ready"])


class SsrfGuardTests(unittest.TestCase):
    def test_private_and_loopback_hosts_are_rejected(self):
        for host in ("localhost", "127.0.0.1", "169.254.169.254", "10.0.0.1"):
            self.assertFalse(Fetcher._public_host(host), host)

    def test_unresolvable_host_is_rejected(self):
        self.assertFalse(Fetcher._public_host("no-such-host.invalid"))


class OutputTests(unittest.TestCase):
    def test_writes_csv_and_json(self):
        p = make("Good Cafe", website="https://goodcafe.com", email="info@goodcafe.com",
                 email_kind="role")
        qualify(p)
        dedupe([p])
        with tempfile.TemporaryDirectory() as tmp:
            csv_path, json_path = write_outputs([p], Path(tmp))
            text = csv_path.read_text(encoding="utf-8")
            self.assertIn("status,status_reason,name", text.splitlines()[0])
            self.assertIn("Good Cafe", text)
            self.assertIn("2955 Broadway", text)
            data = json.loads(json_path.read_text(encoding="utf-8"))
            self.assertEqual(len(data["prospects"]), 1)
            self.assertIn("OpenStreetMap", data["seed_source"])


if __name__ == "__main__":
    unittest.main()
