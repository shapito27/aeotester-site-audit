# Indexability (`crawlability.indexability`, 8 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| `<meta name="robots"> blocks indexing (noindex)` (critical, 0/8) | Remove `noindex` / `none` from robots or `*bot` meta tags in production |
| `X-Robots-Tag header blocks indexing (noindex)` (critical, predicted) | Remove noindex/none from the header rule covering this path |
| `Canonical points to a different domain` (critical, 0/8) | Point the canonical at this page on the production host (www vs apex counts) |
| Looks like a soft 404 (critical, 0/8) | Assisted: see step 6 |
| `Multiple canonical tags found` / `Duplicate canonical link` (-3) | Keep exactly one canonical |
| `Canonical points to a different URL` (-2) | Make it self-referencing |
| `No canonical tag found` / `Canonical tag has no valid href` (-1) | Add one absolute canonical |
| nofollow (-2) | Remove `nofollow` / `none` |

Full points: one absolute, self-referencing canonical on the production host, no noindex/nofollow/none, not a soft 404.

## Where to edit

| Stack | Canonical and robots meta |
|---|---|
| static-html | `<head>` of each flagged `.html` file |
| astro | the shared layout in `src/layouts/*.astro`: `<link rel="canonical" href={new URL(Astro.url.pathname, Astro.site)} />`; needs `site` in `astro.config.*`; check SEO components (`astro-seo`) for a second canonical |
| hugo | `layouts/_default/baseof.html` or `layouts/partials/head.html`: `<link rel="canonical" href="{{ .Permalink }}">`; `baseURL` in `hugo.toml` |
| eleventy | `_includes/**` layout: `<link rel="canonical" href="{{ site.url }}{{ page.url }}">` with `site.url` in `_data/site.*` |
| vite-spa | `index.html`, plus the router's head manager (e.g. `@unhead/vue`, `react-helmet-async`) so each route sets its own URL |
| nextjs (assisted) | `metadataBase` in `app/layout.tsx`, `alternates: { canonical: '/path' }` per `page.tsx`; `metadata.robots` (`index: false` renders noindex) |

X-Robots-Tag rules: `_headers`, `netlify.toml` `[[headers]]`, `vercel.json` `headers`, `next.config.js` `headers()`, `.htaccess`.

## Steps

1. From `page-facts.mjs`, read each flagged page's `canonical`, `url`, `urlPath`, and `site.baseUrl`.
2. If `site.baseUrl` is unknown, ask the user for the production host (with or without www) before writing absolute URLs.
3. Put one canonical in the shared layout, built from the base URL and the page path, and remove per-page or plugin duplicates.
4. Remove `noindex`, `nofollow`, `none` from robots meta and header rules for production. If they are env-conditional (preview builds), keep the condition and make sure production is indexable; confirm with the user if the noindex looks deliberate (thank-you pages, drafts).
5. Keep parameters like `max-image-preview:large`; they are not flagged.
6. Soft 404 (assisted): the page has 2 of: error words in the title, under 200 words of main content (`wordCount`), "404" / "page not found" near the top. If it is a real error page, it should return 404 (see `crawlability.http-behavior`). If it is a real page, ask the user for content; Claude may draft copy clearly marked as a draft for review.

## Template

```html
<link rel="canonical" href="https://example.com/current-path/">
<meta name="robots" content="index, follow, max-image-preview:large">
```

## Rules

- Never invent the production domain; use `site.baseUrl` or ask.
- Never remove a noindex the user put there on purpose without asking.
- Never invent page content to beat the soft-404 heuristic.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the layout or source.
- Keep changes minimal.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only crawlability.indexability`
