# Security

## What this plugin does with your data

- **Reads and writes only inside the current repo.** It never touches files outside the directory Claude Code is running in. The only file the audit writes is `aeotester-report.md`.
- **Never writes without asking.** `/aeotester:fix` always shows a diff and waits for your confirmation. Nothing is committed automatically.
- **Network only when you give a URL.** Repo audits and `/aeotester:fix` make no network requests. `/aeotester:audit https://...` sends GET requests to that site only (pages, robots.txt, llms.txt, sitemaps, `/.well-known/` files, a 404 test), with the user agent `AEOTester-Audit/0.2`, a few at a time, respecting robots.txt. See the README for the full list.
- **Nothing is sent to aeotester.com or anywhere else.** Scoring runs locally from the bundled `rubric.json`. There is no telemetry and no analytics.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting on this repo (Security tab -> Report a vulnerability). I aim to reply within 7 days.
