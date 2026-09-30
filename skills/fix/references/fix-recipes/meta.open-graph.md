# Open Graph (`meta.open-graph`, 3 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| Missing or empty `og:title`, `og:description` or `og:image` | Add each with a real value (-0.75 each) |
| Missing `og:url` | Add it, equal to the page's canonical URL (-0.25) |
| Missing `og:type` | Add `website` (homepage, general pages) or `article` (posts) (-0.25) |
| `og:url` does not match the canonical URL | Make both resolve to the same absolute URL (-0.25) |
| `og:image` is not an absolute URL | Use `https://...` (reported, not scored, but social previews break) |

The engine floors the score: even one missing `og:url` or `og:type` drops the check to 2/3. Full marks needs all five tags, and `og:url` equal to the canonical.

## Where to edit

| Stack | Where the tags come from |
|---|---|
| static-html | `<meta property="og:...">` in the `<head>` of each flagged `.html` file |
| astro | the head of `src/layouts/*.astro`, built from the layout's `title`/`description`/`image` props and `new URL(Astro.url.pathname, Astro.site)` |
| hugo | `{{ template "_internal/opengraph.html" . }}` in `layouts/partials/head.html` (needs `images` in front matter or `params.images` in `hugo.toml`), or hand-written tags using `.Permalink` |
| eleventy | the `_includes/**` base layout head, using `title`, `description` and `site.url + page.url` |
| vite-spa | `index.html` (crawlers do not run JS, so tags must be in the static HTML) |
| nextjs (assisted) | `metadata.openGraph` in `app/layout.tsx` and per page; needs `metadataBase` for absolute URLs |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `og {}`, `title`, `metaDescription`, `canonical`, `url` and `site.baseUrl`, `site.logo`.
2. Put the tags in the shared head layout once, fed from the same variables as `<title>` and the meta description. Do not hard-code per page where a layout exists.
3. `og:url`: same value the canonical tag uses. If there is no canonical, use `site.baseUrl` + `urlPath`. If `site.baseUrl` is unknown, ask the user for the production domain.
4. `og:image`: an existing image in the repo (hero image, social card, or `site.logo` as a fallback), as an absolute URL. Do not create a new image file.
5. `og:type`: `article` for blog posts and articles, `website` for everything else.

## Template

```html
<meta property="og:type" content="website">
<meta property="og:title" content="Visual bookmarks for research | InsightPins">
<meta property="og:description" content="Save, tag and search visual bookmarks from any browser.">
<meta property="og:url" content="https://example.com/">
<meta property="og:image" content="https://example.com/images/social-card.png">
<meta property="og:site_name" content="InsightPins">
```

## Rules

- Never invent facts. Titles and descriptions come from the page; the domain comes from repo config (`site`, `baseURL`, `metadataBase`) or the user.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: reuse existing title, description and canonical variables.
- Use `property=`, not `name=`, for `og:*` tags.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only meta.open-graph`
