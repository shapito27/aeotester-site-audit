---
name: audit
description: Run the AEOTester 138-point AEO (Answer Engine Optimization) checklist on the website source in the current repo and write a scored report to aeotester-report.md. Use when the user asks to audit a site for AI search visibility, AEO, llms.txt, schema markup or AI crawler access.
argument-hint: "[path-to-site-root]"
allowed-tools: Read, Glob, Grep, Write, Bash(node:*)
---

# AEOTester audit

> Status: v0.1 scaffold. The checklist runner lands in phase 3.

Target: `$ARGUMENTS` (default: the repo root).

When this skill is complete it will:

1. Detect the site stack (static HTML, Astro, Hugo, Eleventy, Next.js, Vite/SPA, WordPress and other CMSs).
2. Evaluate every check in `${CLAUDE_SKILL_DIR}/references/rubric.json`, using the bundled scripts in `${CLAUDE_SKILL_DIR}/scripts/` where a check is deterministic and judgment only where the rubric says so.
3. Write `aeotester-report.md` with the overall score, per-category scores and failed checks sorted by points lost, each with file:line and fixable status.
4. Print a short summary in chat.

Rules: read-only. Never write anything other than `aeotester-report.md`. Never make network calls.

For now, tell the user the audit is not implemented yet and stop.
