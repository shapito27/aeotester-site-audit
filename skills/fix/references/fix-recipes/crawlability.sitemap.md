# Sitemap Detection (`crawlability.sitemap`, 5 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| No sitemap at /sitemap.xml, /sitemap_index.xml, /sitemap-index.xml or /sitemap1.xml (0/5) | Add a sitemap (generator preferred) |
| No robots.txt, so the sitemap is not declared (-3: -1 missing file, -2 no directive) | Create robots.txt with a `Sitemap:` line |
| robots.txt has no Sitemap: directive (-2) | Add `Sitemap: https://<domain>/sitemap.xml` |
| Sitemap has no `<loc>` entries (-2) | List every page as `<url><loc>...</loc></url>` |

Full points: a sitemap at a probed path (or a configured generator) with at least one `<loc>`, declared in robots.txt with a `Sitemap:` line. A generated robots.txt skips the robots penalties (inconclusive).

## Where to edit

| Stack | Sitemap source | robots.txt |
|---|---|---|
| static-html | `sitemap.xml` in the served root | `robots.txt` in the served root |
| astro | `@astrojs/sitemap` in `integrations` plus `site` in `astro.config.*` (emits `/sitemap-index.xml`) | `public/robots.txt` |
| hugo | built in (`/sitemap.xml`); make sure `disableKinds` does not list `sitemap` and `baseURL` is set | `static/robots.txt` or `layouts/robots.txt` |
| eleventy | a `sitemap.njk` template with `permalink: /sitemap.xml` over `collections.all` | passthrough `robots.txt` (add `eleventyConfig.addPassthroughCopy("robots.txt")` if missing) |
| vite-spa | `public/sitemap.xml`, or `vite-plugin-sitemap` | `public/robots.txt` |
| nextjs (assisted) | `app/sitemap.ts` returning `MetadataRoute.Sitemap` | `sitemap` field in `app/robots.ts`, or `public/robots.txt` |

## Steps

1. Get the production domain from `site.baseUrl`; if unknown, ask. Sitemap URLs must be absolute.
2. Prefer the framework generator (table). For static-html and vite-spa, write `sitemap.xml` from `site.pages` (`url` of each page), skipping 404 and noindex pages.
3. Add `lastmod` only from real dates (`dates.modified` or `dates.published` in page facts); otherwise omit it.
4. Add `Sitemap: https://<domain>/<sitemap path>` to robots.txt (use `/sitemap-index.xml` for Astro). Create robots.txt with `User-agent: *` / `Allow: /` if missing.
5. For a hand-written sitemap, tell the user it must be updated when pages change, or offer a generator.

## Template

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/</loc></url>
  <url><loc>https://example.com/about/</loc></url>
</urlset>
```

```
Sitemap: https://example.com/sitemap.xml
```

## Rules

- Never invent the domain or `lastmod` dates; use page facts or ask.
- Only list pages that exist and are indexable.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source or config.
- Adding a dependency (`@astrojs/sitemap`, `vite-plugin-sitemap`) needs the user's OK; keep changes minimal.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only crawlability.sitemap`
