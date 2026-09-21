# LionHour

LionHour shows Columbia campus venue hours and dining menus at
[lionhour.com](https://lionhour.com). The static frontend is backed by Vercel
functions and scheduled GitHub Actions that scrape, validate, publish, and audit
live data.

## Local development

Requires Node.js 22 or newer.

```bash
npm install
npm run test:setup
npm test
npm run build
python3 -m unittest discover -s tests -p 'test_*.py'
```

`index.html` contains the canonical `VENUES` catalog. Run `npm run build` after
changing it; the build regenerates venue pages, catalogs, preview data, robots,
and the sitemap.

## Operations and project context

- [Decision ledger](docs/decisions.md)
- [Current handoff](handoff.md)
- [Dining hours operations](docs/dining-hours-operations.md)
- [Dining menus operations](docs/dining-menus-operations.md)
- [Recreation hours operations](docs/recreation-hours-operations.md)
- [Student services operations](docs/student-services-hours-operations.md)

Production publishing credentials belong in Vercel or GitHub secrets. Never
commit local environment files, scrape evidence, credentials, or personal
documents.
