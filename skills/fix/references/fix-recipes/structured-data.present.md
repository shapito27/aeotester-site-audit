# Structured Data (`structured-data.present`, 15 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| No structured data (JSON-LD, Microdata or RDFa) (0/15) | Add JSON-LD in the shared head plus page-type blocks |
| Microdata/RDFa only, no parseable JSON-LD (fixed 4) | Add the same entities as JSON-LD |
| JSON-LD block is not valid JSON | Fix the syntax (see `structured-data.valid`) |
| JSON-LD built from template tags (8, inconclusive) | Build the site and re-run the audit |
| `No Organization schema` (+3) | Add Organization in the shared layout |
| `<Type> schema is invalid: ...` | Add the missing required fields (valid types score more) |

Points: 4 for any parseable block, then per type (valid / invalid only): FAQPage 8 / 4; HowTo, Product, Organization 3 / 1; Article family, VideoObject, Dataset 2 / 0.5; BreadcrumbList, ItemList, Person 1 / 0. Capped at 15. WebSite scores 0 but is still worth adding. Nested nodes count (an Article's Person author earns Person).

## Where to edit

| Stack | Shared block (every page) | Page-type blocks |
|---|---|---|
| static-html | `<head>` of every `.html` file (or the shared include, if any) | the flagged page's `<head>` |
| astro | `src/layouts/*.astro` head, as `<script type="application/ld+json" set:html={JSON.stringify(org)} />` | the post layout or `src/pages/**`, from frontmatter |
| hugo | `layouts/partials/head.html` (or `baseof.html`), values from `site.Params` | `layouts/_default/single.html` with `.Title`, `.Date.Format "2006-01-02"` |
| eleventy | `_includes/**` base layout, values from `_data/site.*` | the post layout in `_includes/**` |
| vite-spa | `index.html` `<head>` | route-level head manager, or `index.html` if single-page |
| nextjs (assisted) | `app/layout.tsx`: `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(org) }} />` | `app/**/page.tsx` |

## Steps

1. From `page-facts.mjs` read `site.brand`, `site.baseUrl`, `site.logo`, `socialLinks`, and per page `title`, `h1`, `metaDescription`, `jsonld`, `dates`, `author`, `headings`, `urlPath`.
2. Organization + WebSite go once in the shared head/layout so every page gets them. `logo` from `site.logo` (absolute URL); `sameAs` only from `socialLinks` found in the repo, else omit it.
3. Article/BlogPosting on article pages only: `headline` from `h1`/title, `datePublished` (and `dateModified`) from `dates` as ISO `YYYY-MM-DD`, `author` as a Person with the `author` name. If there is no author or date in the repo, ask; do not guess.
4. BreadcrumbList on nested pages, built from the URL path and real page titles, positions starting at 1.
5. FAQPage only when the page visibly shows questions and answers; copy the text exactly from the page. Never add FAQ content that is not on the page.
6. Skip types already present and valid in `jsonld`; fix invalid ones instead of duplicating.

## Template

```json
{ "@context": "https://schema.org", "@graph": [
  { "@type": "Organization", "@id": "https://example.com/#org", "name": "Brand",
    "url": "https://example.com/", "logo": "https://example.com/logo.png",
    "sameAs": ["https://github.com/brand"] },
  { "@type": "WebSite", "@id": "https://example.com/#website", "name": "Brand",
    "url": "https://example.com/", "publisher": { "@id": "https://example.com/#org" } }
] }
```

```json
{ "@context": "https://schema.org", "@type": "BlogPosting",
  "headline": "Post title", "datePublished": "2026-01-15", "dateModified": "2026-02-01",
  "author": { "@type": "Person", "name": "Author Name" },
  "publisher": { "@id": "https://example.com/#org" },
  "mainEntityOfPage": "https://example.com/blog/post/" }
```

```json
{ "@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
  { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://example.com/" },
  { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://example.com/blog/" } ] }
```

```json
{ "@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [
  { "@type": "Question", "name": "Question as shown on the page?",
    "acceptedAnswer": { "@type": "Answer", "text": "Answer as shown on the page." } } ] }
```

## Rules

- Never invent facts: names, people, logos, social profiles, dates, prices, ratings, addresses or FAQ text. Use page facts or ask the user.
- Never add FAQPage, Product, HowTo or reviews that the visible page does not support.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the layout or source.
- Keep changes minimal: one shared block, page blocks only where they fit.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only structured-data.present`
