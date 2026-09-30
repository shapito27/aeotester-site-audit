# AI Bot Crawlability (`ai-access.bot-crawlability`, 12 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| No robots.txt in the served root (8/12) | Add a robots.txt that explicitly allows crawlers |
| robots.txt is generated, rules could not be read (8/12, inconclusive) | Fix the generator's rules, then build and re-run the audit to confirm |
| `"Disallow: /..." blocks AI crawlers from /: GPTBot, ...` | Remove that rule for AI bots, or give the bots their own `Allow: /` group |
| Blocked major bot (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot, Perplexity-User, Google-Extended, Applebot-Extended) caps the score at 9 | Allow every major bot the user wants to be cited by |
| `Crawl-delay Ns (over 5s) slows AI crawlers` (-2) | Lower Crawl-delay to 5 or less, or remove it |

Full points: an empty robots.txt, or one where all listed AI bots may crawl `/` and no allowed bot has Crawl-delay over 5.

## Where to edit

| Stack | Where robots.txt comes from |
|---|---|
| static-html | `robots.txt` in the served root (same folder as `index.html`) |
| astro | `public/robots.txt`; or `src/pages/robots.txt.ts` / `astro-robots-txt` options in `astro.config.*` if a generator exists |
| hugo | `static/robots.txt`; with `enableRobotsTXT = true`, the template `layouts/robots.txt` |
| eleventy | a `robots.txt` passthrough file (add `eleventyConfig.addPassthroughCopy("robots.txt")` if missing), or `robots.njk` / `robots.11ty.js` |
| vite-spa | `public/robots.txt` |
| nextjs (assisted) | `app/robots.ts` (`rules` array), else `public/robots.txt`; `next-sitemap.config.js` `robotsTxtOptions` if that package writes it |

Never create a second robots.txt next to an existing generator; edit the generator.

## Steps

1. Find the robots.txt source for the stack (table above). Read every group and its line numbers from the audit findings.
2. Ask the user which AI crawlers they want to allow. Proposed default: allow all, including the ten major bots. If they want to opt out of training only, block training-only bots (e.g. `CCBot`, `Bytespider`) but keep the search and assistant bots allowed.
3. Remove `Disallow: /` (or other rules matching `/`) under groups that name AI bots the user wants allowed. If a `User-agent: *` group blocks `/`, give the allowed AI bots their own group with `Allow: /` (a bot with its own group ignores the `*` group).
4. Remove or lower any `Crawl-delay` above 5.
5. If there is no robots.txt and no generator, create one from the template below.
6. Keep existing `Sitemap:` and `Content-Signal:` lines and unrelated private-path rules (e.g. `Disallow: /admin/`).

## Template

```
User-agent: *
Allow: /

Sitemap: https://example.com/sitemap.xml
```

Only add the `Sitemap:` line with the real production URL (`site.baseUrl`); otherwise ask.

For an explicit AI group, one `User-agent` line per bot, sharing the rules:

```
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: PerplexityBot
Allow: /
```

## Rules

- Which bots to allow is a policy choice: propose the default and ask. Never block or allow bots the user did not agree to.
- Never invent the domain in `Sitemap:`; use `site.baseUrl` or ask.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source file or generator.
- Keep changes minimal: do not reorder or drop unrelated rules.
- A generated robots.txt stays inconclusive (8) until the site is built; say so in the summary.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only ai-access.bot-crawlability`
