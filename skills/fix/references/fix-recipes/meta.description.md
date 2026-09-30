# Meta Description (`meta.description`, 5 pts, auto)

## What the audit flags

| Finding | Change |
|---|---|
| Missing `<meta name="description">` | Add one per page (0 pts until it exists) |
| Empty `<meta name="description">` | Fill the `content` attribute |
| Too short (under 70 chars, -2) or could be longer (70-119, -1) | Rewrite to 120-160 chars |
| Too long (over 170, -1) or slightly long (161-170, -0.5) | Trim to 160 or fewer |
| Looks generic or placeholder ("Welcome to...", "This is a...", "Lorem ipsum", "Home page"...) | Rewrite so the first words say what the page covers (-2) |
| Identical to the title | Write a summary that adds to the title (-1) |
| May be keyword-stuffed (a word over 3 letters used more than 3 times) | Vary the wording (-0.5) |

The engine floors the score, so any half-point deduction still costs a whole point. Full marks means 120-160 chars, specific, not the title, no repetition.

## Where to edit

| Stack | Where the description comes from |
|---|---|
| static-html | `<meta name="description">` in the `<head>` of each flagged `.html` file |
| astro | a `description` prop passed from `src/pages/**` to the layout in `src/layouts/*.astro`, which renders the meta tag; add the prop and tag if missing |
| hugo | `description` in the content file's front matter; the tag in `layouts/partials/head.html` or `layouts/_default/baseof.html` (`{{ with .Description }}...{{ else }}{{ .Site.Params.description }}{{ end }}`) |
| eleventy | `description` in front matter or a directory data file; the tag in the `_includes/**` base layout |
| vite-spa | `<meta name="description">` in `index.html`; per-route updates in the router or head manager if the app has one |
| nextjs (assisted) | `metadata.description` or `generateMetadata` in `app/**/page.tsx`; a site default in `app/layout.tsx` |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `title`, `h1`, `firstParagraph`, `metaDescription` and `site.brand`.
2. Write one or two plain sentences that summarize what the page offers, using facts already on the page. Target 140-160 characters; count them.
3. Do not open with "Welcome to", "This is a", "This page" or the brand name alone. Lead with the topic.
4. Keep every description unique. If a template sets one sitewide default, keep it only as a fallback and set page-level values for the flagged pages.
5. If the layout lacks a description tag or prop, add it once in the shared head and pass values from each page.

## Template

```html
<meta name="description" content="Save, tag and search visual bookmarks from any browser. InsightPins keeps research screenshots organized by project and shareable with your team.">
```

## Rules

- Never invent facts (features, prices, numbers, names, dates, ratings). Summarize what the page actually says; ask the user if the page is too thin to summarize.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: one tag or front matter field per page, no restyling.
- Do not copy the title into the description. Do not repeat a keyword to pad length.
- No em or en dashes in the text.

## Verify

`node ${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs --no-report --only meta.description`
