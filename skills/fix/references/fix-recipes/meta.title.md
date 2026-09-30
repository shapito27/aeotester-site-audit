# Meta Title (`meta.title`, 5 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| Missing or empty `<title>` | Add a title |
| Too short (under 50 chars), generic ("Home", "Blog"...), or no page context | Rewrite as "Page Topic \| Brand", 50-60 chars |
| Too long (over 60 chars) | Shorten the topic part, keep the brand suffix |
| More than 3 separators | Keep one separator between topic and brand |

## Where to edit

| Stack | Where the title comes from |
|---|---|
| static-html | `<title>` in each flagged `.html` file |
| astro | the `title` prop passed to the layout from `src/pages/**` (frontmatter or `<Layout title="...">`); the brand suffix lives in `src/layouts/*.astro` |
| hugo | `title` in the content file's front matter; the suffix pattern in `layouts/_default/baseof.html` or `layouts/partials/head.html` |
| eleventy | `title` in the page's front matter or data file; the suffix in `_includes/**` layout |
| vite-spa | `<title>` in `index.html`, plus any runtime `document.title` updates in the router |
| nextjs (assisted) | `metadata.title` / `generateMetadata` in `app/**/page.tsx`; `title.template` in `app/layout.tsx` |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's current title, `h1`, first paragraph, meta description, and the site brand (`site.brand`).
2. Write a title that names what the page is about, using words already on the page. Format: `Page Topic | Brand`. Aim for 50-60 characters, never over 60.
3. The homepage title leads with what the site does, not "Home": `Visual bookmarks for research | InsightPins`.
4. If a shared template adds the brand suffix, change only the page-specific part.

## Rules

- Use facts from the page. Do not invent product claims, numbers or keywords the page does not support.
- Keep titles unique across pages.
- Do not use em or en dashes as separators; use `|` or a hyphen.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only meta.title`
