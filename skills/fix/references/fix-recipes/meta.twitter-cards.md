# Twitter Cards (`meta.twitter-cards`, 3 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| No `twitter:*` tags (X falls back to Open Graph) | Scores 2/3; add the four tags below for 3/3 |
| Missing or empty `twitter:card`, `twitter:title` or `twitter:description` | Add each with a real value (-0.75 each) |
| Missing `twitter:image` | Add it, same absolute URL as `og:image` (-0.5) |
| Invalid `twitter:card` type | Use `summary_large_image` (or `summary`, `app`, `player`) (-0.25) |

The engine floors the score, so any single deduction costs a whole point. Full marks needs `twitter:card`, `twitter:title`, `twitter:description` and `twitter:image`, with a valid card type.

## Where to edit

| Stack | Where the tags come from |
|---|---|
| static-html | `<meta name="twitter:...">` in the `<head>` of each flagged `.html` file, next to the OG tags |
| astro | the head of `src/layouts/*.astro`, from the same props as `<title>` and the OG tags |
| hugo | `{{ template "_internal/twitter_cards.html" . }}` in `layouts/partials/head.html` (uses `images` front matter or `params.images`), or hand-written tags |
| eleventy | the `_includes/**` base layout head |
| vite-spa | `index.html` (tags must be in the static HTML) |
| nextjs (assisted) | `metadata.twitter` in `app/layout.tsx` and per page (`card: 'summary_large_image'`, `title`, `description`, `images`) |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `twitter {}`, `og {}`, `title`, `metaDescription` and `site.logo`.
2. Add the tags once in the shared head layout, next to the Open Graph tags, fed from the same variables. Do not duplicate values by hand per page.
3. `twitter:image`: reuse the `og:image` value (absolute URL). If there is no OG image, fix `meta.open-graph` first or use `site.logo`.
4. Use `summary_large_image` when the image is a wide social card, `summary` when only a square logo exists.
5. Add `twitter:site` only if the repo already contains the X/Twitter handle (`socialLinks`); otherwise skip it.

## Template

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Visual bookmarks for research | InsightPins">
<meta name="twitter:description" content="Save, tag and search visual bookmarks from any browser.">
<meta name="twitter:image" content="https://example.com/images/social-card.png">
```

## Rules

- Never invent facts, including X/Twitter handles. Use handles found in the repo or ask the user.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: reuse the title, description and OG image variables already in the layout.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only meta.twitter-cards`
