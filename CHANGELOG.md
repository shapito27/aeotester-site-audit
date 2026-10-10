# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [0.3.0] - Unreleased

Rubric v1.2.0: scoring changes for sites audited across many pages. Each change is recorded as a plugin divergence in the check's `divergences` list; the extension is unchanged.

### Changed

- Pages kept out of search on purpose (`noindex` for all crawlers, not the homepage, not in the sitemap, more than one page audited) are left out of every page check average and listed in the report as "Not scored". Their missing dates and author attribution are reported as advice. Sitemap indexes are followed to their child sitemaps. A noindex for one crawler only (googlebot, GPTBot) is still scored.
- Indexability: deliberate noindex scores full. noindex is still critical on the homepage, on the only audited page, and on a page the sitemap lists (a new conflict finding).
- Content Signals is advisory: reported under "Advice (no points)" and left out of the total. A missing `Content-Signal` line places no restriction on AI crawlers. Max score is now 133.
- Structured data: the first valid main type (Organization, Article, Product, HowTo, VideoObject, Dataset) earns 7 and each further one 2, so Organization plus BreadcrumbList on inner pages, or Organization plus WebSite on the homepage, passes. WebSite now counts as a supporting type. FAQPage stays worth 8 as a bonus and is only recommended on pages that show two or more questions.
- The report no longer calls itself a Claude Code plugin. Every slash command is paired with the skill name ("the AEOTester fix skill (`/aeotester:fix` in Claude Code)"), so it reads correctly in Codex and ChatGPT too.
- Markdown for agents is worth 3 instead of 5. A working Markdown copy the page links to earns full points; answering `Accept: text/markdown` on top is advice. An unlinked `.md` file earns 1; an advertised alternate whose target is missing earns 0, as it does in URL mode.

### Added

- Codex and ChatGPT desktop app support. A portable `plugin.json` at the root, `.agents/plugins/marketplace.json` and `skills/fix/agents/openai.yaml` make the repo an OpenAI plugin next to the Claude Code one. Both `SKILL.md` files say how to resolve script paths and ask questions in hosts without Claude Code's plugin variables and `AskUserQuestion`.
- `npm run build:openai-zip` builds `dist/aeotester-<version>.zip` for the "Skills only" upload at platform.openai.com/plugins. `tests/openai-package.test.mjs` checks it against the portal's documented rules.
- A privacy policy, published at https://aeotester.com/privacy/ with a copy in `PRIVACY.md`, linked from both manifests.
- The report has an "Advice (no points)" section and lists excluded pages in the summary. The JSON output has `excludedPages`, and each check has `advice` and `excludedPages`.
- Rubric checks can be `advisory: true`; their weight is left out of `max_score` and the category max.

## [0.2.0] - Unreleased

### Added

- URL mode: `/aeotester:audit https://site.com` audits a live site. The homepage URL audits a sample, one page per template: the homepage, the pages linked from the header, nav and footer, and a listing plus one item from each section (about 25 pages at most). A page URL audits just that page. `--pages N` changes the sample size and `--all` audits every page found (up to 500).
- In URL mode, response headers, the 404 response, the http to https redirect, Markdown negotiation and `/.well-known/` files are measured on the live site instead of predicted from config. Anything the site blocks or rate-limits is marked inconclusive, never scored down.
- WordPress and other CMS sites can now get a full score through their live URL.

### Changed

- The plugin makes network requests in URL mode, to the named site only. README and SECURITY.md list exactly what is fetched.

## [0.1.0] - 2026-09-30

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
