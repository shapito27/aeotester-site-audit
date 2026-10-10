# AEOTester: AI SEO audit and fix for Claude Code and Codex

AEOTester checks whether AI search engines can find, read and cite your website, then fixes what it can in your code. It runs inside Claude Code, and as a plugin in OpenAI's Codex and the ChatGPT desktop app. `/aeotester:audit` scores a site on 26 checks for AI search visibility (answer engine optimization, AEO, and generative engine optimization, GEO), either from the site's code in your repository or from a live URL. `/aeotester:fix` then adds the missing pieces in your code, such as JSON-LD schema markup, an llms.txt file, robots.txt rules for AI crawlers, and title, description and Open Graph tags. Every change is shown as a diff before it is written, and nothing is committed for you.

It is built for developers and site owners who want their pages to show up in ChatGPT, Perplexity, Claude, Gemini and Google AI Overviews answers, and who would rather fix the source than paste suggestions from a report.

```
/aeotester:audit                     ->  audit the site code in this repo: score out of 133, file:line for every issue
/aeotester:audit https://site.com    ->  audit the live site, one page per template
/aeotester:fix                       ->  diffs for the fixes, applied after you approve, then a re-audit
```

The checklist is the same one used by the [AEOTester Chrome extension](https://aeotester.com/?utm_source=github&utm_medium=plugin), which checks a page in your browser after JavaScript has run. The plugin checks the HTML the server sends, which is what AI crawlers read.

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

Requires Claude Code and Node 18 or newer. The checks are plain Node scripts with no dependencies, run by Claude Code on your machine.

### Codex and the ChatGPT desktop app

The repo is also an OpenAI plugin: a portable `plugin.json` at the root, the same `skills/` folder, and a marketplace file at `.agents/plugins/marketplace.json`. OpenAI's local and repo marketplaces are read by the ChatGPT desktop app (including Codex there).

```bash
codex plugin marketplace add shapito27/aeotester-site-audit
```

Then open the Plugins Directory in the ChatGPT desktop app, pick the **AEOTester** marketplace and install the plugin. Ask for it by name or mention (`$` in Codex, `@` in ChatGPT Work), for example "audit this site for AI search visibility" or "audit https://example.com". The `/aeotester:audit` and `/aeotester:fix` slash commands are Claude Code syntax; in other hosts you describe the task, and the `fix` skill only runs when you ask for it by name.

Things to know:

- **It needs a host that can run Node.** The skills call local Node 18+ scripts and read or edit files in your project. Codex in the ChatGPT desktop app does this; the Codex CLI and IDE extension are untested. A plain ChatGPT chat has no access to your repository or a shell, so the plugin cannot run there.
- **No MCP server.** This is a skills-only plugin: there is no hosted service, and nothing is sent anywhere except the GET requests to a site you name in URL mode.
- **Diff-then-ask is a skill instruction, not a host guarantee.** In Claude Code the file edits also go through its permission prompts. In Codex, keep its approval mode on so edits are confirmed too.
- **Not yet tested in a live Codex or ChatGPT install.** The manifests follow the [Package your plugin](https://developers.openai.com/plugins/build/plugins) guide. If something fails to load, please open an issue with the host and version.

## Commands

| Command | What it does |
|---|---|
| `/aeotester:audit [site-folder]` | Audits the site code in the repo: detects your stack, checks the pages and root files, writes `aeotester-report.md`, and summarizes the biggest point losses |
| `/aeotester:audit https://site.com` | Audits the live site. The homepage URL audits a sample: the homepage, pages linked from the header, nav and footer, and a listing plus one item from each section, about 25 pages at most. `--pages N` changes the sample size, `--all` audits every page found |
| `/aeotester:audit https://site.com/page` | Audits that one page, plus the site-wide files (robots.txt, llms.txt, sitemap, `/.well-known/`) |
| `/aeotester:fix [check-id ...]` | Fixes the auto-fixable issues in your source files. Shows a diff per file and asks before writing. Never commits. Re-audits at the end |
| `/aeotester:fix --yes` | Same, but you approve up front: diffs are still printed before anything is written |

## Example

On the sample site in [`tests/fixtures/sample-site`](tests/fixtures/sample-site) (three static pages with typical problems):

| | Score |
|---|---|
| Before | **71 / 132** (54%, Not AEO Ready) |
| After `/aeotester:fix --yes` | **100 / 132** (76%, Needs Work) |

Measured with rubric v1.1.0. Rubric v1.2.0 scores out of 127 on this site (Content Signals became advice); the same before state scores **72 / 127** (57%).

The fix run added Organization and WebSite JSON-LD, an llms.txt, titles, descriptions, canonical, Open Graph and Twitter tags, `lang` and viewport, `<main>` and `<nav>`, and repaired the heading hierarchy. It left the robots.txt policy (which AI bots to allow, Content-Signal values) for the owner to decide, and listed the items that need real content: author credentials, publish dates, alt text. Scores can differ between runs because titles and descriptions are written by Claude.

## What it checks

| Category | Points | Examples |
|---|---:|---|
| AI crawler access | 18 | robots.txt rules for GPTBot, ClaudeBot, PerplexityBot and 120+ other AI bots, llms.txt; Content Signals as advice (not scored) |
| Crawlability and indexing | 18 | canonical, noindex conflicts (homepage, or a noindex page in the sitemap), soft 404s, sitemap, HTTPS, real 404s, X-Robots-Tag |
| Structured data | 20 | JSON-LD presence and Schema.org validation: a main type that fits the page (Organization, Article, Product...), breadcrumbs, and FAQPage where the page shows questions |
| Meta and social tags | 22 | title, description, Open Graph, Twitter cards, `lang`, viewport |
| Content structure and quality | 36 | heading hierarchy, content depth, freshness dates, author signals, alt text, internal links, landmarks |
| Agent readiness | 19 | server-rendered content, a linked Markdown copy for agents, agent-usable controls, `/.well-known/` agent protocols (only scored when the site has an API) |

The full rubric, with the exact scoring rules for every check, is in [`skills/audit/references/rubric.json`](skills/audit/references/rubric.json). It is the same checklist the AEOTester extension uses, with the differences listed per check under `divergences`.

Because the plugin scores many pages instead of one, it treats a few things differently from the extension:

- **Pages kept out of search on purpose are not scored.** A page with `noindex` for all crawlers that is not the homepage and not in the sitemap (privacy policy, terms, thank-you pages) is left out of every page check, and the report lists it. noindex still costs points on the homepage, or on a page the sitemap asks engines to index.
- **Advice costs no points.** Things that can be deliberate choices are listed under "Advice" in the report: Content Signals in robots.txt, answering `Accept: text/markdown` when a Markdown copy is already linked, and dates or authors on pages kept out of search.
- **FAQPage is a bonus.** A page passes structured data with a main type that fits it plus breadcrumbs; FAQPage is suggested only where the page shows questions.

## Supported stacks

| Stack | Audit | Fix |
|---|---|---|
| Static HTML | yes | auto |
| Astro, Hugo, Eleventy, Vite | yes (reads the build output) | auto, in the source files |
| Next.js | yes (reads the build output) | assisted: proposed diffs, applied only when you approve each one |
| WordPress and other database-backed CMSs | from the repo: a fix list, no score; from a URL: a full score | none: content lives in the database |
| Any live site | yes, with a URL | fix in the site's code, if you have it |

Repo mode has been tested end to end on static HTML; the framework paths are covered by unit tests but not yet by real-project runs, so please [report an unsupported stack](.github/ISSUE_TEMPLATE/unsupported-stack.md) if something looks off.

For generated sites the audit reads the built HTML, because that is what crawlers and agents receive. If there is no build output yet, it asks before running your build command.

## Repo mode or URL mode

**Repo mode** reads your site's files. Most checks match what a crawler sees on the live site. Things that only exist at runtime (response headers set by your host, Markdown served on request, how unknown URLs are answered) are read from host config (`_headers`, `vercel.json`, `netlify.toml`) where possible and marked "predicted" or "inconclusive" in the report.

**URL mode** fetches the live site and measures those things directly: real response headers, a real 404 test, real `Accept: text/markdown` negotiation, the http to https redirect. It reads the HTML the server sends, before JavaScript runs, which is what most AI crawlers see; a page that only renders in the browser will score lower here than in the Chrome extension.

Why a sample and not every page: almost every AEO issue lives in a template (the article layout, the listing layout, the shared `<head>`), so one page per template finds nearly everything a full crawl would, in about 20 to 40 requests. Sections are grouped by URL path, so on a site where articles sit at the root (`/my-post`) they are treated as static pages, capped at 15.

The best of both: audit the live URL to see what crawlers get, then run `/aeotester:fix` in the site's repo.

## What it runs and what it touches

- **Runs:** the Node scripts in `skills/audit/scripts/` and `skills/fix/scripts/`. The skills pre-approve only those exact scripts and `node --version`; any other command goes through Claude Code's normal permission prompt. No hooks, no MCP servers, no package installs.
- **Reads:** in repo mode, files in the current repository only. In URL mode, the site you named.
- **Writes:** `aeotester-report.md` (audit), and the source files you approve in a diff (fix). File edits are not pre-approved, so Claude Code also asks its usual permission for each one. If your site needs a build before the audit, it asks before running your build command.
- **Network:** repo mode and `/aeotester:fix` make no network requests. URL mode sends GET requests to the site you named, and only to that site: its pages, robots.txt, llms.txt, llms-full.txt, sitemaps, the `/.well-known/` agent discovery files and `/openapi.json`, one made-up URL to test the 404 response, the `http://` version of the homepage to test the redirect, up to 20 pages again with `Accept: text/markdown`, and any Markdown versions the pages advertise. Requests identify themselves with the user agent `AEOTester-Audit/0.2`, run 4 at a time with a 10-second timeout and one retry, and skip pages that robots.txt disallows. Nothing is sent to aeotester.com or anywhere else. No telemetry.
- **Git:** never commits, pushes or changes branches.

See the [privacy policy](https://aeotester.com/privacy/) (a copy is in [PRIVACY.md](PRIVACY.md)) and [SECURITY.md](SECURITY.md).

## Development

```bash
claude --plugin-dir ./aeotester-site-audit   # load the plugin for one session (/reload-plugins after edits)
npm run check                               # rubric build check, rubric validation, no-dash check, unit tests
claude plugin validate --strict .           # manifest and component validation
npm run build:openai-zip                   # dist/aeotester-<version>.zip for the OpenAI plugin portal
claude plugin eval . --scaffold --ablation none --allow-tools "Bash(node:*)" Edit Write   # end-to-end evals (uses your Claude credits)
```

Rubric sources live in `rubric/checks/*.json`; `node scripts/build-rubric.mjs` rebuilds `rubric.json`.

### Publishing to OpenAI

`npm run build:openai-zip` writes `dist/aeotester-<version>.zip`: the portable `plugin.json`, the icon, the skills with their scripts and references, and the licence files. The Claude Code manifests, tests and CI files are left out. Upload it at [platform.openai.com/plugins](https://platform.openai.com/plugins) with **Upload new or existing plugin**, using the **Skills only** path (the package has no MCP server). You need a verified developer identity, and every bundled skill goes through OpenAI's safety scan, which can take up to two hours. Each new upload needs a new `version` in `plugin.json` and `.claude-plugin/plugin.json` (`tests/manifests.test.mjs` keeps them equal). `tests/openai-package.test.mjs` checks the ZIP against the portal's documented rules.

## License

Code: [MIT](LICENSE). Rubric (`rubric.json`): [CC BY 4.0](LICENSE-RUBRIC) - reuse it with attribution to [aeotester.com](https://aeotester.com/?utm_source=github&utm_medium=plugin). The AI bot list comes from [ai.robots.txt](https://github.com/ai-robots-txt/ai.robots.txt) (MIT).
