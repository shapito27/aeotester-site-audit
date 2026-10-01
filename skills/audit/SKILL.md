---
name: audit
description: AI SEO audit of the website in the current repo - the AEOTester checklist for answer engine optimization (AEO) and generative engine optimization (GEO), 26 checks and 138 points - with a scored report in aeotester-report.md. Use when the user asks to audit a site for AI search visibility, AI SEO, AEO, GEO, llms.txt, schema markup, AI crawler access or agent readiness.
argument-hint: "[site-root] [--max-pages N] [--base-url https://example.com]"
allowed-tools: Read, Glob, Grep, Bash(node --version), Bash(node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs:*)
---

# AEOTester audit

Audits the site in this repo against the AEOTester rubric and writes `aeotester-report.md` at the site root you pass (default: the repo root).

## Rules

- Read-only. The only file you write is the report, and the script writes it. Never edit site files here; fixes belong to `/aeotester:fix`.
- No network calls. Everything is read from disk.
- Stay inside the current repo.

## Steps

1. **Check Node.** Run `node --version`. The scripts need Node 18 or newer. If Node is missing, tell the user the audit needs Node 18+ and stop.

2. **Run the audit.** Pass the user's arguments through (`$ARGUMENTS`, default `.`):

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs $ARGUMENTS
   ```

   It detects the stack, finds the pages, runs every check, writes `aeotester-report.md` and prints a short summary.

3. **Handle the mode the summary reports:**
   - **"No build output found"** (Astro, Next.js, Hugo, Eleventy, Vite): the audit reads built HTML because that is what crawlers and agents receive. Ask the user whether to run the build command it names. Only run it if they say yes, then run the audit again. If they say no, stop and explain why a build is needed.
   - **Report-only** (WordPress or another database-backed CMS): page content lives in the database, so only repo files were checked. Say so plainly and suggest checking a live page with the AEOTester Chrome extension or https://aeotester.com/?utm_source=plugin&utm_medium=report. Do not try to edit anything.
   - **No pages found**: say so and ask where the site's HTML lives.

4. **Summarize in chat** in a few lines, not the whole report:
   - the score, percentage and grade,
   - the three to five issues that lose the most points (see "Writing each issue" below),
   - checks marked "predicted from config" or "inconclusive" that the user should confirm on the live site (see "Live checks" below),
   - the next step: `/aeotester:fix` applies the auto-fixable items, always with a diff and a confirmation first.

   Link the report file. Do not paste it.

   **Writing each issue.** Write for someone who has never seen the rubric:
   - Say what the check looks for and why it matters to AI search or agents, in one plain sentence, before the finding.
   - Show a short concrete example of what is missing or what the fix adds, such as the exact tag or line. For Content Signals, for example: "`robots.txt` sets rules for GPTBot and ClaudeBot, but has no `Content-Signal:` line. That line tells AI companies whether they may use your pages for search results, as answer input, or for training, for example `Content-Signal: search=yes, ai-input=yes, ai-train=no`."
   - Never show bare rubric labels such as "auto-fix", "assisted" or "inconclusive". Say what they mean instead: "`/aeotester:fix` can change this for you" (auto-fix), "needs your input, such as dates or copy, so the fix will guide you" (assisted), "can't be confirmed from the files, check the live site" (inconclusive or predicted from config).
   - Name the affected pages as Markdown links to the page on the live site: the page's canonical URL if it has one, otherwise the base URL plus the served path. Without a known base URL, link the file path instead. List up to 10 pages inline, then say "and N other pages". Get the full list from `--json`, because the printed report shortens it.

   **Live checks.** You make no network calls, so ask the user to run the check and show them how: give the exact command with the `!` prefix (for example `! curl -sI -H "Accept: text/markdown" https://example.com/`) so the output lands in the conversation. Say what a pass looks like (here, `Content-Type: text/markdown` in the response headers), and once they run it, read the output and tell them the result.

## Reference

- `references/rubric.json` holds every check: weight, scoring rules, how it is detected from source, and where source-based results can differ from a live page (`parity`). Look up a single check by `id` when the user asks why something scored the way it did; do not load the whole file into the conversation.
- `scripts/audit.mjs --json -` prints the full machine-readable result, which is useful for answering detailed questions.
- `--base-url` sets the production URL when the repo does not reveal it (it is used to tell internal from external links and to check canonical URLs).
