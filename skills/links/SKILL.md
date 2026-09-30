---
name: links
description: Find broken internal and external links in the site source, map each dead URL back to the file(s) that contain it, and offer to replace, remove or add a redirect rule for the detected stack.
argument-hint: "[path-to-site-root] [--max-urls N]"
disable-model-invocation: true
allowed-tools: Read, Glob, Grep, Edit, Write, Bash(node:*)
---

# AEOTester broken links

> Status: v0.1 scaffold. The link checker lands in phase 4.

Target: `$ARGUMENTS` (default: the repo root).

When this skill is complete it will:

1. Extract links from the site source and check them with `${CLAUDE_SKILL_DIR}/scripts/check-links.mjs` (concurrency limit, timeout, one retry, max 2,000 URLs by default).
2. Add a broken links table to `aeotester-report.md`: URL, status code, found in (file:line), suggested action.
3. Hand each dead URL to the `link-fixer` agent, which proposes a replacement, removal or redirect rule (`_redirects`, `vercel.json`, `next.config.js`, ...) and shows a diff before writing.

The only network calls this plugin makes are HEAD/GET requests to URLs found in the site.

For now, tell the user the link check is not implemented yet and stop.
