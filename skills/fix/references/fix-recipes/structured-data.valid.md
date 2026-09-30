# Schema Validation (`structured-data.valid`, 5 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| No JSON-LD structured data to validate (0/5) | Add JSON-LD first (see `structured-data.present`) |
| JSON-LD block is not valid JSON (-0.5 each) | Fix the syntax: trailing commas, unescaped quotes, missing brackets, comments |
| `<Type> schema: <issue>` (-0.5 under 100% valid, -1 under 80%, -2 under 50%) | Add the missing required fields below |
| JSON-LD built from template tags (3, inconclusive) | Build the site and re-run the audit |

Full points: every block parses and every validated node passes. Required fields (anything else is a warning only):

| Type | Required |
|---|---|
| Organization (and subtypes) | `name` |
| Article, BlogPosting, NewsArticle, TechArticle | `headline`; `author` (object needs `name`); `datePublished` as ISO `YYYY-MM-DD` (optional time) |
| Person | `name` |
| FAQPage | `mainEntity` array of `Question` with `name` and `acceptedAnswer` `{ "@type": "Answer", "text" }` |
| HowTo | `name`; `step` array of 2+ `HowToStep` with `text` or `name` |
| Product | `name`, `image`, `description`, `offers` with `price` (or `priceRange` / `lowPrice`) and `priceCurrency`; `aggregateRating.ratingValue` if rating present |
| BreadcrumbList | `itemListElement` array; each item `position` (from 1) and `name` or `item.name` |
| ItemList | `itemListElement` array |
| VideoObject | `name`, `description`, `thumbnailUrl`, `uploadDate` (ISO) |
| Dataset | `name`, `description` |

## Where to edit

| Stack | Where the JSON-LD comes from |
|---|---|
| static-html | the `<script type="application/ld+json">` at the finding's line in each `.html` file |
| astro | the object passed to `set:html={JSON.stringify(...)}` in `src/layouts/**` or `src/components/**` |
| hugo | the partial that emits the block (`layouts/partials/*.html`); use `jsonify` for values so quotes are escaped |
| eleventy | the block in `_includes/**`; use the `dump` / `json` filter for values |
| vite-spa | `index.html`, or the head manager in `src/**` |
| nextjs (assisted) | the object in `app/**/layout.tsx` / `page.tsx` rendered with `JSON.stringify` |

For generated stacks, fix the template that produced the block, never the built HTML.

## Steps

1. Take each finding's file, line and issue. Map built-output lines back to the template that emits them.
2. JSON syntax: prefer building the object in code and serializing it (`JSON.stringify`, `jsonify`, `dump`) over hand-written JSON with interpolated strings.
3. Missing fields: fill them from page facts (`title`, `h1`, `metaDescription`, `dates`, `author`, `site.brand`, `site.logo`). Convert dates to ISO `YYYY-MM-DD`.
4. `@id` references (`{ "@id": "#org" }`) are fine if a node on the same page defines that `@id`; make sure it does.
5. If a required value does not exist in the repo (author name, price, currency, answer text), ask the user. If the page does not really show that thing (no price, no Q&A), remove the node instead of filling it.

## Rules

- Never invent facts: names, authors, dates, prices, currencies, ratings, answers or images. Use page facts or ask.
- Removing an unsupported node is better than faking a field.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source template.
- Keep changes minimal: fix the flagged fields, do not restructure working blocks.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only structured-data.valid`
