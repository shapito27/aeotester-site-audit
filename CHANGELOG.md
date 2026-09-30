# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `/aeotester:audit`: zero-dependency Node audit of the site in the repo. Detects the stack (static HTML, Astro, Hugo, Eleventy, Next.js, Vite, WordPress and other CMSs), reads built HTML plus robots.txt, llms.txt, sitemaps, /.well-known/ and host config (`_headers`, `_redirects`, `vercel.json`, `netlify.toml`), runs all 26 checks and writes `aeotester-report.md`.
- WordPress and other database-backed CMSs get a fix list instead of a score, and nothing is edited.
- Rubric v1.1.0: fixes bugs found in the extension's checks (robots.txt grouping and precedence, status vs score mismatches, false positives) and records every difference from the extension in a `divergences` list per check.
- `rubric.json`: 26 checks, 138 points, extracted from the AEOTester extension v1.3.1, with per-check scoring rules, source-file detection steps, parity notes and fix class. Plus `rubric.schema.json`, `scripts/validate-rubric.mjs` and `docs/rubric-review.md`.
- Plugin scaffold: `plugin.json`, `marketplace.json`, and stub skills for `/aeotester:audit`, `/aeotester:fix` and `/aeotester:links`.
- `link-fixer` agent stub.
- MIT license for code, CC BY 4.0 for the rubric.
- CI: `claude plugin validate --strict` and a no-em-dash check.
