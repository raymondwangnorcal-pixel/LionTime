#!/usr/bin/env python3
"""Find independent Morningside Heights restaurants for LionHour ad outreach.

Stage 1  seed from OpenStreetMap (Overpass), bounded by the target zone.
Stage 2  fetch each business's own site and pull a contact address from it.
Stage 3  flag chains, non-first-party sites, missing data.
Stage 4  deduplicate by business identity and by contact address.

Output is a reviewable CSV plus a JSON file carrying per-page provenance.
Nothing here sends mail or writes to Redis; every row is a candidate for
manual qualification, per docs/ad-sales-outreach-plan.md section 3.1.

Usage:
    python3 scripts/discover_prospects.py --dry-run      # seed only, no site fetches
    python3 scripts/discover_prospects.py                # full run
    python3 scripts/discover_prospects.py --limit 10 -v  # small verbose run

OpenStreetMap data is ODbL-licensed; attribution is recorded in the JSON output.
"""

from __future__ import annotations

import argparse
import csv
import ipaddress
import json
import re
import socket
import sys
import time
import unicodedata
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Optional
from urllib.parse import urljoin, urlparse
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

# --- Target zone -------------------------------------------------------------
# Morningside Heights: W 110th to W 125th, Riverside Drive to Morningside Drive.
# Approximate bounding box; eyeball it on a map before trusting the edges.
# Columbia's main gate (116th & Broadway) is 40.8075, -73.9626.
DEFAULT_BBOX = (40.8000, -73.9700, 40.8165, -73.9520)  # south, west, north, east

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
OVERPASS_QUERY = """
[out:json][timeout:90];
(
  nwr["amenity"~"^(restaurant|cafe|fast_food|ice_cream)$"]({bbox});
  nwr["shop"~"^(bakery|deli|coffee)$"]({bbox});
);
out center tags;
"""

USER_AGENT = (
    "LionHourOutreach/0.1 (+https://lionhour.com; Columbia University student project; "
    "contact info@gaplesslabs.com)"
)
HEADERS = {"User-Agent": USER_AGENT}

REQUEST_TIMEOUT = 10          # seconds per request
MAX_RESPONSE_BYTES = 2_000_000
MAX_REDIRECTS = 3
PER_HOST_DELAY = 1.0          # seconds between requests to the same host
MAX_PAGES_PER_SITE = 4

CONTACT_HINTS = ("contact", "about", "reach", "connect", "info", "location", "hours")

# Sites that are not the business's own: aggregators, directories, socials.
NOT_FIRST_PARTY = {
    "facebook.com", "m.facebook.com", "instagram.com", "twitter.com", "x.com",
    "yelp.com", "tripadvisor.com", "opentable.com", "resy.com",
    "doordash.com", "ubereats.com", "grubhub.com", "seamless.com", "postmates.com",
    "linktr.ee", "google.com", "sites.google.com", "beacons.ai", "allmenus.com",
    "menupages.com", "slice.com", "chownow.com", "yellowpages.com",
}
# The business's own site, hosted on a restaurant platform. Allowed, but flagged.
PLATFORM_HOSTED = {
    "toasttab.com", "square.site", "clover.com", "popmenu.com", "bentobox.com",
    "wixsite.com", "squarespace.com", "weebly.com", "godaddysites.com",
}

ROLE_LOCALPARTS = {
    "info", "hello", "contact", "hi", "orders", "order", "eat", "mail", "email",
    "management", "manager", "owner", "admin", "office", "catering", "events",
    "marketing", "ads", "advertising",
}

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
EMAIL_JUNK = (
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", "@2x", "@3x",
    "example.com", "domain.com", "yourdomain", "email.com", "sentry.io",
    "wixpress.com", "squarespace.com", "godaddy.com", "shopify.com",
    "cloudflare", "schema.org", "w3.org", "sentry-next",
)

LEGAL_SUFFIXES = {"llc", "inc", "corp", "co", "ltd", "lp", "llp", "incorporated", "company"}
STREET_ABBREV = {
    "street": "st", "avenue": "ave", "boulevard": "blvd", "drive": "dr",
    "place": "pl", "road": "rd", "court": "ct", "terrace": "ter", "parkway": "pkwy",
    "west": "w", "east": "e", "north": "n", "south": "s",
}


# --- Normalization (mirrors plan section 3.1) --------------------------------

def _strip_accents(value: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", value) if not unicodedata.combining(c))


def normalize_name(name: str) -> str:
    value = _strip_accents(name or "").lower()
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    words = [w for w in value.split() if w not in LEGAL_SUFFIXES]
    if words and words[0] == "the":
        words = words[1:]
    return " ".join(words)


def normalize_address(housenumber: str, street: str) -> str:
    value = _strip_accents(f"{housenumber or ''} {street or ''}").lower()
    value = re.sub(r"[^a-z0-9\s]", " ", value)
    words = [STREET_ABBREV.get(w, w) for w in value.split()]
    return " ".join(words).strip()


def normalize_email(address: str) -> str:
    address = (address or "").strip().lower()
    if "@" not in address:
        return ""
    local, _, domain = address.rpartition("@")
    try:
        domain = domain.encode("idna").decode("ascii")
    except (UnicodeError, UnicodeDecodeError):
        pass
    if domain in {"gmail.com", "googlemail.com"}:
        local = local.split("+", 1)[0].replace(".", "")
    else:
        local = local.split("+", 1)[0]
    return f"{local}@{domain}"


def registrable_domain(host: str) -> str:
    parts = (host or "").lower().lstrip(".").split(".")
    if len(parts) >= 3 and parts[-2] in {"co", "com", "org", "net"} and len(parts[-1]) == 2:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


# --- Guarded fetching --------------------------------------------------------

class Fetcher:
    """HTTP with an SSRF guard, size and redirect bounds, and per-host pacing."""

    def __init__(self, cache_dir: Optional[Path] = None, verbose: bool = False):
        self.session = requests.Session()
        self.last_hit: dict[str, float] = {}
        self.robots: dict[str, Optional[RobotFileParser]] = {}
        self.cache_dir = cache_dir
        self.verbose = verbose
        if cache_dir:
            cache_dir.mkdir(parents=True, exist_ok=True)

    def _log(self, *args) -> None:
        if self.verbose:
            print("   ", *args, file=sys.stderr)

    @staticmethod
    def _public_host(host: str) -> bool:
        try:
            infos = socket.getaddrinfo(host, None)
        except socket.gaierror:
            return False
        for info in infos:
            ip = ipaddress.ip_address(info[4][0])
            if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
                return False
        return bool(infos)

    def _pace(self, host: str) -> None:
        elapsed = time.monotonic() - self.last_hit.get(host, 0.0)
        if elapsed < PER_HOST_DELAY:
            time.sleep(PER_HOST_DELAY - elapsed)
        self.last_hit[host] = time.monotonic()

    def _cache_path(self, url: str) -> Optional[Path]:
        if not self.cache_dir:
            return None
        import hashlib
        return self.cache_dir / (hashlib.sha256(url.encode()).hexdigest()[:32] + ".html")

    def get(self, url: str, allow_redirects: bool = True) -> Optional[tuple[str, str]]:
        """Return (final_url, text) or None. Redirects are checked hop by hop."""
        cached = self._cache_path(url)
        if cached and cached.exists():
            self._log("cache", url)
            return url, cached.read_text(encoding="utf-8", errors="replace")

        seen = 0
        current = url
        while True:
            parsed = urlparse(current)
            if parsed.scheme not in {"http", "https"} or not parsed.hostname:
                return None
            if not self._public_host(parsed.hostname):
                self._log("blocked non-public host", parsed.hostname)
                return None
            self._pace(parsed.hostname)
            try:
                resp = self.session.get(
                    current, headers=HEADERS, timeout=REQUEST_TIMEOUT,
                    allow_redirects=False, stream=True,
                )
            except requests.RequestException as exc:
                self._log("error", current, exc)
                return None

            if resp.is_redirect or resp.is_permanent_redirect:
                if not allow_redirects or seen >= MAX_REDIRECTS:
                    return None
                location = resp.headers.get("Location")
                resp.close()
                if not location:
                    return None
                current = urljoin(current, location)
                seen += 1
                continue

            if resp.status_code != 200:
                resp.close()
                return None
            body = b""
            for chunk in resp.iter_content(16384):
                body += chunk
                if len(body) > MAX_RESPONSE_BYTES:
                    break
            resp.close()
            text = body.decode(resp.encoding or "utf-8", errors="replace")
            if cached:
                cached.write_text(text, encoding="utf-8")
            return current, text

    def allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        host = parsed.hostname or ""
        if host not in self.robots:
            robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
            parser = RobotFileParser()
            result = self.get(robots_url, allow_redirects=True)
            if result:
                try:
                    parser.parse(result[1].splitlines())
                except Exception:
                    parser = None
            else:
                parser = None
            self.robots[host] = parser
        parser = self.robots[host]
        if parser is None:
            return True  # no robots.txt served: not a disallow
        return parser.can_fetch(USER_AGENT, url)


# --- Records -----------------------------------------------------------------

@dataclass
class Prospect:
    osm_id: str
    name: str
    category: str
    housenumber: str = ""
    street: str = ""
    postcode: str = ""
    lat: Optional[float] = None
    lon: Optional[float] = None
    website: str = ""
    osm_email: str = ""
    phone: str = ""
    brand: str = ""
    cuisine: str = ""
    # enrichment
    site_final_url: str = ""
    email: str = ""
    email_source_url: str = ""
    email_kind: str = ""          # role | personal | unknown
    pages_fetched: list[dict] = field(default_factory=list)
    all_emails: list[str] = field(default_factory=list)
    # qualification
    flags: list[str] = field(default_factory=list)
    status: str = "review"        # ready | review | excluded
    status_reason: str = ""
    # dedup
    identity_key: str = ""
    normalized_email: str = ""
    duplicate_of: str = ""

    @property
    def address(self) -> str:
        return " ".join(x for x in (self.housenumber, self.street) if x)


# --- Stage 1: seed -----------------------------------------------------------

def parse_overpass_elements(elements: Iterable[dict]) -> list[Prospect]:
    """Turn Overpass elements into prospects. Pure: no network, so it is testable."""
    prospects: list[Prospect] = []
    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name", "").strip()
        if not name:
            continue
        if any(k.startswith(("disused:", "was:", "abandoned:")) for k in tags):
            continue
        center = el.get("center") or {}
        prospects.append(Prospect(
            osm_id=f"{el.get('type')}/{el.get('id')}",
            name=name,
            category=tags.get("amenity") or tags.get("shop") or "",
            housenumber=tags.get("addr:housenumber", ""),
            street=tags.get("addr:street", ""),
            postcode=tags.get("addr:postcode", ""),
            lat=el.get("lat", center.get("lat")),
            lon=el.get("lon", center.get("lon")),
            website=(tags.get("website") or tags.get("contact:website") or "").strip(),
            osm_email=(tags.get("email") or tags.get("contact:email") or "").strip(),
            phone=(tags.get("phone") or tags.get("contact:phone") or "").strip(),
            brand=tags.get("brand", ""),
            cuisine=tags.get("cuisine", ""),
        ))
    return prospects


def seed_from_overpass(bbox: tuple[float, float, float, float], verbose: bool = False) -> list[Prospect]:
    query = OVERPASS_QUERY.format(bbox=",".join(str(x) for x in bbox))
    print(f"Querying Overpass for {bbox} ...", file=sys.stderr)
    resp = requests.post(OVERPASS_URL, data={"data": query}, headers=HEADERS, timeout=120)
    resp.raise_for_status()
    prospects = parse_overpass_elements(resp.json().get("elements", []))
    print(f"  {len(prospects)} named food businesses in the zone", file=sys.stderr)
    return prospects


# --- Stage 2: enrich ---------------------------------------------------------

def extract_emails(html: str, page_url: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    found: list[str] = []
    for link in soup.find_all("a", href=True):
        href = link["href"].strip()
        if href.lower().startswith("mailto:"):
            addr = href[7:].split("?", 1)[0].strip()
            if addr:
                found.append(addr)
    for match in EMAIL_RE.findall(soup.get_text(" ", strip=True)):
        found.append(match)
    cleaned = []
    for addr in found:
        low = addr.lower()
        if any(junk in low for junk in EMAIL_JUNK):
            continue
        if low not in cleaned:
            cleaned.append(low)
    return cleaned


def contact_links(html: str, base_url: str) -> list[str]:
    soup = BeautifulSoup(html, "html.parser")
    base_host = urlparse(base_url).hostname or ""
    out: list[str] = []
    for link in soup.find_all("a", href=True):
        href = urljoin(base_url, link["href"].strip())
        if urlparse(href).hostname != base_host:
            continue
        blob = (link.get_text(" ", strip=True) + " " + href).lower()
        if any(hint in blob for hint in CONTACT_HINTS):
            if href not in out:
                out.append(href.split("#", 1)[0])
    return out


def classify_email(address: str) -> str:
    local = address.split("@", 1)[0]
    return "role" if local in ROLE_LOCALPARTS else "personal"


def enrich(prospect: Prospect, fetcher: Fetcher) -> None:
    if not prospect.website:
        prospect.flags.append("no_website")
        return
    url = prospect.website
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    host = urlparse(url).hostname or ""
    domain = registrable_domain(host)

    if domain in NOT_FIRST_PARTY:
        prospect.flags.append(f"not_first_party:{domain}")
        return
    if domain in PLATFORM_HOSTED:
        prospect.flags.append(f"platform_hosted:{domain}")

    if not fetcher.allowed(url):
        prospect.flags.append("robots_disallowed")
        return

    result = fetcher.get(url)
    if not result:
        prospect.flags.append("site_unreachable")
        return
    final_url, html = result
    prospect.site_final_url = final_url
    prospect.pages_fetched.append({
        "url": final_url, "fetched_at": datetime.now(timezone.utc).isoformat()
    })

    emails = extract_emails(html, final_url)
    sources = {e: final_url for e in emails}

    pages = [p for p in contact_links(html, final_url) if p != final_url]
    for page in pages[: MAX_PAGES_PER_SITE - 1]:
        if not fetcher.allowed(page):
            continue
        sub = fetcher.get(page)
        if not sub:
            continue
        sub_url, sub_html = sub
        prospect.pages_fetched.append({
            "url": sub_url, "fetched_at": datetime.now(timezone.utc).isoformat()
        })
        for addr in extract_emails(sub_html, sub_url):
            if addr not in sources:
                sources[addr] = sub_url
                emails.append(addr)

    prospect.all_emails = emails
    if not emails:
        prospect.flags.append("no_email_found")
        return

    # Prefer a role inbox on the business's own domain.
    def rank(addr: str) -> tuple[int, int]:
        same_domain = registrable_domain(addr.split("@", 1)[1]) == domain
        is_role = classify_email(addr) == "role"
        return (0 if (same_domain and is_role) else 1 if same_domain else 2,
                0 if is_role else 1)

    best = sorted(emails, key=rank)[0]
    prospect.email = best
    prospect.email_source_url = sources[best]
    prospect.email_kind = classify_email(best)
    if registrable_domain(best.split("@", 1)[1]) != domain:
        prospect.flags.append("email_off_domain")
    if prospect.osm_email and normalize_email(prospect.osm_email) != normalize_email(best):
        prospect.flags.append("osm_email_differs")


# --- Stage 3 & 4: qualify and dedupe ----------------------------------------

def qualify(prospect: Prospect) -> None:
    if prospect.brand:
        prospect.flags.append(f"chain_brand:{prospect.brand}")
    if not prospect.street:
        prospect.flags.append("no_street_address")
    # enrich() normally sets this; re-check so --dry-run and direct calls agree.
    if not prospect.website and "no_website" not in prospect.flags:
        prospect.flags.append("no_website")

    hard = [f for f in prospect.flags
            if f.startswith(("not_first_party", "chain_brand"))
            or f in {"no_website", "robots_disallowed"}]
    if hard:
        prospect.status = "excluded"
        prospect.status_reason = hard[0]
        return
    if not prospect.email:
        prospect.status = "review"
        prospect.status_reason = "no contact address found; check the site by hand"
        return
    if prospect.email_kind == "personal" or "email_off_domain" in prospect.flags:
        prospect.status = "review"
        prospect.status_reason = "contact address needs human qualification"
        return
    if not prospect.street:
        prospect.status = "review"
        prospect.status_reason = "address not confirmed"
        return
    prospect.status = "ready"
    prospect.status_reason = "role inbox on own domain, address present"


def dedupe(prospects: list[Prospect]) -> None:
    by_identity: dict[str, Prospect] = {}
    by_email: dict[str, Prospect] = {}
    for p in prospects:
        p.identity_key = f"{normalize_name(p.name)}|{normalize_address(p.housenumber, p.street)}"
        p.normalized_email = normalize_email(p.email) if p.email else ""

        if p.identity_key in by_identity and normalize_address(p.housenumber, p.street):
            first = by_identity[p.identity_key]
            p.duplicate_of = first.osm_id
            p.status = "excluded"
            p.status_reason = "duplicate business record"
            continue
        by_identity[p.identity_key] = p

        if p.normalized_email:
            if p.normalized_email in by_email:
                first = by_email[p.normalized_email]
                p.duplicate_of = first.osm_id
                p.flags.append("blocked_by_shared_contact")
                p.status = "excluded"
                p.status_reason = f"shared contact address with {first.name}"
                continue
            by_email[p.normalized_email] = p


# --- Output ------------------------------------------------------------------

CSV_COLUMNS = [
    "status", "status_reason", "name", "address", "postcode", "category",
    "email", "email_kind", "email_source_url", "website", "site_final_url",
    "phone", "cuisine", "flags", "osm_id", "duplicate_of",
]


def write_outputs(prospects: list[Prospect], out_dir: Path) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    csv_path = out_dir / "prospects.csv"
    json_path = out_dir / "prospects.json"

    order = {"ready": 0, "review": 1, "excluded": 2}
    rows = sorted(prospects, key=lambda p: (order.get(p.status, 3), p.name.lower()))

    with csv_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for p in rows:
            record = asdict(p)
            record["address"] = p.address
            record["flags"] = "; ".join(p.flags)
            writer.writerow({k: record.get(k, "") for k in CSV_COLUMNS})

    json_path.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "zone": "Morningside Heights (W 110th-W 125th, Riverside-Morningside)",
        "seed_source": "OpenStreetMap via Overpass API, ODbL; (c) OpenStreetMap contributors",
        "note": "Candidates for manual qualification. Not a send list.",
        "prospects": [asdict(p) for p in rows],
    }, indent=2), encoding="utf-8")
    return csv_path, json_path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--bbox", help="south,west,north,east", default=None)
    parser.add_argument("--limit", type=int, default=0, help="stop after N seeds (testing)")
    parser.add_argument("--dry-run", action="store_true", help="seed only; do not fetch business sites")
    parser.add_argument("--out", default="data/outreach", help="output directory")
    parser.add_argument("--cache-dir", default=".cache/outreach", help="page cache directory")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()

    bbox = DEFAULT_BBOX
    if args.bbox:
        parts = [float(x) for x in args.bbox.split(",")]
        if len(parts) != 4:
            parser.error("--bbox needs south,west,north,east")
        bbox = tuple(parts)  # type: ignore[assignment]

    prospects = seed_from_overpass(bbox, args.verbose)
    if args.limit:
        prospects = prospects[: args.limit]

    if not args.dry_run:
        fetcher = Fetcher(cache_dir=Path(args.cache_dir), verbose=args.verbose)
        for i, p in enumerate(prospects, 1):
            print(f"[{i}/{len(prospects)}] {p.name}", file=sys.stderr)
            try:
                enrich(p, fetcher)
            except Exception as exc:  # one bad site must not end the run
                p.flags.append(f"enrich_error:{type(exc).__name__}")

    for p in prospects:
        qualify(p)
    dedupe(prospects)

    csv_path, json_path = write_outputs(prospects, Path(args.out))

    counts: dict[str, int] = {}
    for p in prospects:
        counts[p.status] = counts.get(p.status, 0) + 1
    print("\n--- summary ---", file=sys.stderr)
    for status in ("ready", "review", "excluded"):
        print(f"  {status:9} {counts.get(status, 0)}", file=sys.stderr)
    print(f"\nwrote {csv_path}\nwrote {json_path}", file=sys.stderr)
    print("Every row still needs manual qualification before enrollment.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
