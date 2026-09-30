# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `rubric.json`: 26 checks, 138 points, extracted from the AEOTester extension v1.3.1, with per-check scoring rules, source-file detection steps, parity notes and fix class. Plus `rubric.schema.json`, `scripts/validate-rubric.mjs` and `docs/rubric-review.md`.
- Plugin scaffold: `plugin.json`, `marketplace.json`, and stub skills for `/aeotester:audit`, `/aeotester:fix` and `/aeotester:links`.
- `link-fixer` agent stub.
- MIT license for code, CC BY 4.0 for the rubric.
- CI: `claude plugin validate --strict` and a no-em-dash check.
