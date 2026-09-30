# Server-Rendered Content (`agent-readiness.server-rendered`, 6 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| Empty app container (`#root`, `#app`, `#__next`...) with almost no text (under 50 words) | Render the page to HTML at build or request time (0 pts until then) |
| Empty app container next to little server text (under 150 words) | Move the main content out of the client-only mount into server HTML (3 pts) |
| HTML has almost no text (under 30 words) and loads scripts | Same: prerender the content (3 pts, inconclusive) |
| No `<h1>` in the server HTML (only when the page looks client-rendered) | Put the `<h1>` in the static markup (-1) |
| No `<title>` in the server HTML (only when the page looks client-rendered) | Put `<title>` in the static head (-1) |

Full marks: the built HTML contains the page's real text (150+ words, or no empty mount point), plus `<h1>` and `<title>`. The audit reads the built HTML, which is what a non-JS agent receives.

## Where to edit

| Stack | How to get content into the HTML |
|---|---|
| static-html | already server HTML; if text is injected by a script (`fetch` + `innerHTML`), move that text into the `.html` file |
| astro | remove `client:only` from components that hold main content (use `client:load`/`client:visible` or no directive, which renders at build); avoid fetching page text in client scripts |
| hugo | already static; check for content loaded by JS widgets in `layouts/**` or `assets/js/**` and render it with templates or `data/` files instead |
| eleventy | already static; move client-fetched content into `_data/` files rendered by templates |
| vite-spa | add prerendering: `vite-plugin-ssr`/`vike` prerender, `vite-ssg` (Vue), `@sveltejs/kit` static adapter, or a prerender plugin; at minimum put the `<title>`, `<h1>` and a text summary in `index.html` |
| nextjs (assisted) | use server components or `generateStaticParams`/`getStaticProps` instead of `useEffect` data fetching; remove `dynamic(..., { ssr: false })` from content components; `'use client'` only on interactive leaves; `metadata` export for the title |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `wordCount`, `title`, `h1` and `file`, and open the built HTML to see what an agent receives (`curl -s <url>` on a live site shows the same).
2. Find why the text is missing: an empty mount div, a client-only component, or a runtime `fetch`. Name the exact component or script.
3. Quick wins Claude can apply (auto part): a static `<title>` and meta description in the head; an `<h1>` and short intro paragraph in the static shell when the page has fixed wording; removing a `client:only` or `ssr: false` from a content component that has no browser-only code.
4. Architectural changes (assisted part): adding SSR, SSG or a prerender step, or restructuring data fetching. Outline the plan (packages, config changes, files touched) and wait for the user's approval before editing.
5. Rebuild and re-run the audit; check the built HTML now contains the main text.

## Template

```html
<!-- vite-spa index.html: minimal static shell until prerendering is in place -->
<title>Visual bookmarks for research | InsightPins</title>
<div id="root"><main><h1>Visual bookmarks for research</h1><p>Save, tag and search screenshots from any browser.</p></main></div>
```

## Rules

- Never invent facts. Static shell text must come from the page's own copy.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal. Do not migrate frameworks or add dependencies without the user's explicit OK.
- Do not add hidden text or crawler-only content that differs from what users see.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only agent-readiness.server-rendered`
