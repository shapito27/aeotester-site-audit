# AEOTester: AI SEO audit and fix for Claude Code

AEOTester checks whether AI search engines can find, read and cite your website, then fixes what it can in your code. It runs inside Claude Code on your site's repository: `/aeotester:audit` scores the site on 26 checks for AI search visibility (answer engine optimization, AEO, and generative engine optimization, GEO), and `/aeotester:fix` adds the missing pieces, such as JSON-LD schema markup, an llms.txt file, robots.txt rules for AI crawlers, and title, description and Open Graph tags. Every change is shown as a diff before it is written, and nothing is committed for you.

It is built for developers and site owners who want their pages to show up in ChatGPT, Perplexity, Claude, Gemini and Google AI Overviews answers, and who would rather fix the source than paste suggestions from a report.

```
/aeotester:audit   ->  score out of 138, a report with file:line for every issue
/aeotester:fix     ->  diffs for the fixes, applied after you approve, then a re-audit
```

The checklist is the same one used by the [AEOTester Chrome extension](https://aeotester.com/?utm_source=github&utm_medium=plugin), which checks a live page in the browser.

## Install

```bash
claude plugin marketplace add shapito27/aeotester-site-audit
claude plugin install aeotester@aeotester
```

Or inside a Claude Code session:

```
/plugin marketplace add shapito27/aeotester-site-audit
/plugin install aeotester@aeotester
```

Requires Claude Code and Node 18 or newer. The checks are plain Node scripts with no dependencies. The plugin works on a local copy of your site's code, so it is meant for Claude Code rather than chat.

## Commands

| Command | What it does |
|---|---|
| `/aeotester:audit [site-root]` | Detects your stack, audits the pages and root files, writes `aeotester-report.md`, and summarizes the biggest point losses |
| `/aeotester:fix [check-id ...]` | Fixes the auto-fixable issues in your source files. Shows a diff per file and asks before writing. Never commits. Re-audits at the end |
| `/aeotester:fix --yes` | Same, but you approve up front: diffs are still printed before anything is written |

## Example

On the sample site in [`tests/fixtures/sample-site`](tests/fixtures/sample-site) (three static pages with typical problems):

| | Score |
|---|---|
| Before | **71 / 132** (54%, Not AEO Ready) |
| After `/aeotester:fix --yes` | **100 / 132** (76%, Needs Work) |

The fix run added Organization and WebSite JSON-LD, an llms.txt, titles, descriptions, canonical, Open Graph and Twitter tags, `lang` and viewport, `<main>` and `<nav>`, and repaired the heading hierarchy. It left the robots.txt policy (which AI bots to allow, Content-Signal values) for the owner to decide, and listed the items that need real content: author credentials, publish dates, alt text. Scores can differ between runs because titles and descriptions are written by Claude.

## What it checks

| Category | Points | Examples |
|---|---:|---|
| AI crawler access | 21 | robots.txt rules for GPTBot, ClaudeBot, PerplexityBot and 120+ other AI bots, llms.txt, Content Signals |
| Crawlability and indexing | 18 | canonical, noindex, soft 404s, sitemap, HTTPS, real 404s, X-Robots-Tag |
| Structured data | 20 | JSON-LD presence and Schema.org validation (Organization, Article, FAQPage, Product, BreadcrumbList...) |
| Meta and social tags | 22 | title, description, Open Graph, Twitter cards, `lang`, viewport |
| Content structure and quality | 36 | heading hierarchy, content depth, freshness dates, author signals, alt text, internal links, landmarks |
| Agent readiness | 21 | server-rendered content, Markdown for agents, agent-usable controls, `/.well-known/` agent protocols (only scored when the site has an API) |

The full rubric, with the exact scoring rules for every check, is in [`skills/audit/references/rubric.json`](skills/audit/references/rubric.json). It is the same checklist the AEOTester extension uses, with the differences listed per check under `divergences`.

## Supported stacks

| Stack | Audit | Fix |
|---|---|---|
| Static HTML | yes | auto |
| Astro, Hugo, Eleventy, Vite | yes (reads the build output) | auto, in the source files |
| Next.js | yes (reads the build output) | assisted: proposed diffs, applied only when you approve each one |
| WordPress and other database-backed CMSs | fix list only, no score | none: content lives in the database |

v0.1 has been tested end to end on static HTML; the framework paths are covered by unit tests but not yet by real-project runs, so please [report an unsupported stack](.github/ISSUE_TEMPLATE/unsupported-stack.md) if something looks off.

For generated sites the audit reads the built HTML, because that is what crawlers and agents receive. If there is no build output yet, it asks before running your build command.

## How the scoring works from source

The audit reads your repo, not a live page. Most checks match what the extension sees on the live site. Things that only exist at runtime (response headers set by your host, Markdown served on request, JavaScript-injected tags) are read from host config (`_headers`, `vercel.json`, `netlify.toml`) where possible and marked "predicted" or "inconclusive" in the report. Confirm those on the live site: [check a live URL](https://aeotester.com/?utm_source=github&utm_medium=plugin) or use the Chrome extension.

## What it runs and what it touches

- **Runs:** the Node scripts in `skills/audit/scripts/` and `skills/fix/scripts/`, from the skills, with your approval as Claude Code asks for it. No hooks, no MCP servers, no package installs.
- **Reads:** files in the current repository only.
- **Writes:** `aeotester-report.md` (audit), and the source files you approve in a diff (fix). If your site needs a build before the audit, it asks before running your build command.
- **Network:** none. Nothing is sent to aeotester.com or anywhere else. No telemetry.
- **Git:** never commits, pushes or changes branches.

See [SECURITY.md](SECURITY.md).

## Development

```bash
claude --plugin-dir ./aeotester-site-audit   # load the plugin for one session (/reload-plugins after edits)
npm run check                               # rubric build check, rubric validation, no-dash check, unit tests
claude plugin validate --strict .           # manifest and component validation
claude plugin eval . --scaffold --ablation none --allow-tools "Bash(node:*)" Edit Write   # end-to-end evals (uses your Claude credits)
```

Rubric sources live in `rubric/checks/*.json`; `node scripts/build-rubric.mjs` rebuilds `rubric.json`.

## License

Code: [MIT](LICENSE). Rubric (`rubric.json`): [CC BY 4.0](LICENSE-RUBRIC) - reuse it with attribution to [aeotester.com](https://aeotester.com/?utm_source=github&utm_medium=plugin). The AI bot list comes from [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) (MIT).
