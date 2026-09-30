---
name: fix
description: Apply AEOTester fixes in the current repo - schema markup, llms.txt, heading hierarchy, robots.txt AI crawler rules, meta tags. Always shows a diff and asks before writing.
argument-hint: "[check-id ...]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(node:*)
---

# AEOTester fix

> Status: v0.1 scaffold. Fixes land in phase 5.

Target checks: `$ARGUMENTS` (default: every auto-fixable failure in the latest `aeotester-report.md`).

When this skill is complete it will:

1. Read the latest `aeotester-report.md` (run `/aeotester:audit` first if it is missing).
2. For each auto-fixable failure, follow the recipe in `${CLAUDE_SKILL_DIR}/references/fix-recipes/` for the detected stack.
3. Show the full diff and ask for confirmation before writing any file.
4. Never commit. Never touch files outside the current repo.
5. On database-backed CMSs (WordPress etc.) output a fix list instead of editing files.

For now, tell the user fixes are not implemented yet and stop.
