# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.2.0] - Unreleased

### Added

- URL mode: `/aeotester:audit https://site.com` audits a live site. The homepage URL audits a sample, one page per template: the homepage, the pages linked from the header, nav and footer, and a listing plus one item from each section (about 25 pages at most). A page URL audits just that page. `--pages N` changes the sample size and `--all` audits every page found (up to 500).
- In URL mode, response headers, the 404 response, the http to https redirect, Markdown negotiation and `/.well-known/` files are measured on the live site instead of predicted from config. Anything the site blocks or rate-limits is marked inconclusive, never scored down.
- WordPress and other CMS sites can now get a full score through their live URL.

### Changed

- The plugin makes network requests in URL mode, to the named site only. README and SECURITY.md list exactly what is fetched.

## [0.1.0] - 2026-09-30

First public release.

### Added

- `/aeotester:audit`: audits the site in the repo against the AEOTester rubric (26 checks, 138 points) and writes `aeotester-report.md` with the score, per-category scores, and every issue sorted by points lost with file:line.
  - Detects static HTML, Astro, Hugo, Eleventy, Vite, Next.js, WordPress and other database-backed CMSs.
  - Reads built HTML plus robots.txt, llms.txt, sitemaps, `/.well-known/` and host config (`_headers`, `_redirects`, `vercel.json`, `netlify.toml`).
  - WordPress and other CMSs get a fix list instead of a score, and nothing is edited.
- `/aeotester:fix`: fixes auto-fixable issues in the source files with a recipe per check. Shows a diff per file and asks before writing (`--yes` approves up front, diffs are still shown), never commits, and re-audits at the end.
- `page-facts.mjs` and `generate-llms-txt.mjs` so fixes use real site data.
- `rubric.json` (CC BY 4.0), built from `rubric/checks/*.json`. Rubric v1.1.0 fixes bugs found in the extension's checks and records every difference in a `divergences` list per check, including major-bot weighting for AI crawler access.
- Unit tests for every check, end-to-end tests on fixture sites, and `claude plugin eval` cases for audit and fix.
- CI: plugin validation, rubric build and validation, tests, and a no-em-dash check.

### Not in this release

- Broken link checking and repair. Planned for a later version.
