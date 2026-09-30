---
name: audit
description: AI SEO audit of a website - the AEOTester checklist for answer engine optimization (AEO) and generative engine optimization (GEO), 26 checks and 138 points - with a scored report in aeotester-report.md. Audits the site code in the current repo, or a live site when given a URL. Use when the user asks to audit a site or URL for AI search visibility, AI SEO, AEO, GEO, llms.txt, schema markup, AI crawler access or agent readiness.
argument-hint: "[site-folder | https://site.com[/page]] [--pages N] [--all]"
allowed-tools: Read, Glob, Grep, Bash(node --version), Bash(node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs:*)
---

# AEOTester audit

Audits a site against the AEOTester rubric and writes `aeotester-report.md` in the current directory (for a folder: in that folder).

Two ways to run it:

- **Repo mode** (no argument, or a folder): reads the site's files in this repo. No network requests.
- **URL mode** (an `http://` or `https://` URL): fetches the live site, the way an AI crawler sees it.
  - A page URL (`https://site.com/blog/post`) audits that one page, plus the site-wide files (robots.txt, llms.txt, sitemap, `/.well-known/`).
  - The homepage (`https://site.com`) audits a sample: the homepage, the pages linked from the header, nav and footer, and a listing page plus one item from each section (blog, docs, products...), about 25 pages at most. One page per template finds nearly every issue without crawling the whole site.
  - `--pages N` changes the sample size. `--all` audits every page found (up to 500, or `--pages N`).
  - Requests go to that site only, are polite (a few at a time, with timeouts) and skip pages that robots.txt disallows. The README lists exactly what is fetched.

## Rules

- Read-only. The only file written is the report, and the script writes it. Never edit site files here; fixes belong to `/aeotester:fix`.
- Repo mode stays inside the current repo and makes no network requests.
- URL mode only fetches the site the user named. Use it only when the user gave a URL or asked for the live site.

## Steps

1. **Check Node.** Run `node --version`. The scripts need Node 18 or newer. If Node is missing, tell the user the audit needs Node 18+ and stop.

2. **Run the audit.** Pass the user's arguments through (`$ARGUMENTS`, default `.`):

   ```bash
   node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs $ARGUMENTS
   ```

   It prints a short summary and writes `aeotester-report.md`.

3. **Handle the mode the summary reports:**
   - **"No build output found"** (Astro, Next.js, Hugo, Eleventy, Vite): the audit reads built HTML because that is what crawlers and agents receive. Ask the user whether to run the build command it names. Only run it if they say yes, then run the audit again. If they say no, offer URL mode on the deployed site instead.
   - **Report-only** (WordPress or another database-backed CMS): page content lives in the database, so the repo cannot be scored. Say so plainly and offer to audit the live site with `/aeotester:audit https://their-site.com`. Do not try to edit anything.
   - **No pages found**: in repo mode, ask where the site's HTML lives; in URL mode, say the site could not be fetched and show the status from the summary (it may block automated requests).

4. **Summarize in chat** in a few lines, not the whole report:
   - the score, percentage and grade, and in URL mode how many pages were audited,
   - the three to five issues that lose the most points, each marked auto-fix or assisted,
   - checks marked "predicted from config" or "inconclusive" that the user should confirm,
   - the next step: in repo mode, `/aeotester:fix` applies the auto-fixable items, always with a diff and a confirmation first; in URL mode, open the site's code and run `/aeotester:fix` there.

   Link the report file. Do not paste it.

## Reference

- `references/rubric.json` holds every check: weight, scoring rules, how it is detected, and where results from source can differ from a live page (`parity`). Look up a single check by `id` when the user asks why something scored the way it did; do not load the whole file into the conversation.
- `audit.mjs ... --json -` prints the full machine-readable result, which is useful for answering detailed questions.
- Repo mode: `--base-url https://site.com` sets the production URL when the repo does not reveal it (used to tell internal from external links and to check canonical URLs).
- URL mode: `--ignore-robots` also audits pages that robots.txt disallows. Only use it when the user owns the site and asks for it.
