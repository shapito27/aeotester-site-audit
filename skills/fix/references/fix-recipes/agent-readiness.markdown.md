# Markdown for Agents (`agent-readiness.markdown`, 5 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| No markdown alternate, Link header or .md file for this page | Publish a `.md` copy and advertise it (0 pts) |
| Markdown version `/page.md` exists but is not advertised | Add `<link rel="alternate" type="text/markdown">` or a Link header (2 pts until then) |
| Markdown alternate advertised, but no `Accept: text/markdown` handling found | Enable content negotiation at the host or edge (3 pts until then) |

Tiers: negotiation code in the repo = 5, advertised alternate (`<link>` or Link header) = 3, unadvertised `.md` file = 2, nothing = 0. The `.md` path for `/guide/` is `/guide.md` or `/guide/index.md`; for `/` it is `/index.md`; for `/page.html` it is `/page.md`. Every result below 5 is inconclusive, because a host toggle (Cloudflare Markdown for Agents) is invisible in the repo.

## Where to edit

| Stack | Where the .md copies, link tag and header go |
|---|---|
| static-html | `.md` files next to each `.html` in the served root; `<link>` in each `<head>`; Link header in `_headers` (Cloudflare Pages / Netlify) in the served root, or `vercel.json` `headers` |
| astro | an endpoint `src/pages/[...slug].md.ts` that returns the collection entry body with `Content-Type: text/markdown`; `<link>` in `src/layouts/*.astro`; `public/_headers` |
| hugo | a custom output format (`[outputFormats.markdown] mediaType = "text/markdown"`, `outputs.page = ["HTML", "markdown"]`) with `layouts/_default/single.markdown.md`; `<link>` via `{{ with .OutputFormats.Get "markdown" }}` in the head partial; `static/_headers` |
| eleventy | a second template or pagination that writes `permalink: "/{{ page.fileSlug }}.md"` from the same source; `<link>` in the `_includes/**` base layout; `_headers` via passthrough copy |
| vite-spa | `.md` files in `public/`; `<link>` in `index.html`; `public/_headers` |
| nextjs (assisted) | `app/[...slug].md/route.ts` or `middleware.ts` returning `text/markdown` when `Accept` contains it; `metadata.alternates.types = { 'text/markdown': '/page.md' }`; `vercel.json` headers |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `urlPath`, `title`, `file` and `site.hostConfig`, `site.stack`.
2. Generate `.md` copies (auto part): for Markdown-sourced stacks, output the existing source body with a `# Title` line at the top; for HTML-only pages, convert the main content to clean Markdown. Serve them as `text/markdown`, not HTML.
3. Advertise (auto part): add one `<link rel="alternate" type="text/markdown" href="...">` per page in the head template, pointing at a path that really exists. Optionally add a Link header rule on the detected host.
4. Negotiation (assisted part): explain the options and let the user choose: turn on Cloudflare "Markdown for Agents" in the dashboard (no code), or add edge middleware (Cloudflare Pages `functions/_middleware.js`, Netlify edge function, Next.js `middleware.ts`) that returns the `.md` file when `Accept` includes `text/markdown`. Write middleware only after the user's OK.
5. Verify live after deploy: `curl -sI -H "Accept: text/markdown" <page url>` should show `content-type: text/markdown`.

## Template

```html
<link rel="alternate" type="text/markdown" href="/guide.md">
```

```
/guide/
  Link: </guide.md>; rel="alternate"; type="text/markdown"
/*.md
  Content-Type: text/markdown; charset=utf-8
```

## Rules

- Never invent facts. The `.md` copy carries the same content as the page, nothing new.
- Never advertise a `.md` URL that does not exist; the link must resolve.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: one generator and one head tag, not a hand-copied `.md` per page when the stack can generate them.
- Hosting changes (dashboard toggles, new middleware) are the user's decision.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only agent-readiness.markdown`
