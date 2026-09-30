# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.1.0] - Unreleased

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
