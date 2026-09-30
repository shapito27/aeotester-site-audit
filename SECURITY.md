# Security

## What this plugin does with your data

- **Reads and writes only inside the current repo.** It never touches files outside the directory Claude Code is running in.
- **Never writes without asking.** `/aeotester:fix` always shows a diff and waits for your confirmation. Nothing is committed automatically.
- **No network calls.** The audit and the fixes read and write local files only.
- **Nothing is sent to aeotester.com or anywhere else.** Scoring runs locally from the bundled `rubric.json`. There is no telemetry and no analytics.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private vulnerability reporting on this repo (Security tab -> Report a vulnerability). I aim to reply within 7 days.
