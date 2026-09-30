# Security

## What this plugin does with your data

- **Reads and writes only inside the current repo.** It never touches files outside the directory Claude Code is running in.
- **Never writes without asking.** `/aeotester:fix` and the link fixer always show a diff and wait for your confirmation. Nothing is committed automatically.
- **No network calls, with one exception:** the broken link check (`/aeotester:links`) sends HEAD/GET requests to the URLs it finds in your site, so it can see whether they are alive. It is polite: limited concurrency, a timeout, one retry, and a cap of 2,000 URLs by default.
- **Nothing is sent to aeotester.com or anywhere else.** Scoring runs locally from the bundled `rubric.json`. There is no telemetry and no analytics.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting on this repo (Security tab -> Report a vulnerability). I aim to reply within 7 days.
