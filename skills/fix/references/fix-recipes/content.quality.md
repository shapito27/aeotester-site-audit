# Content Quality (`content.quality`, 5 pts, assisted)

## What the audit flags

| Finding | Change |
|---|---|
| Very thin content (under 33% of the page-type minimum) | Expand the page (-3) |
| Thin content (under 66% of the minimum) | Expand the page (-2) |
| Content could be more substantial (under the minimum) | Expand the page (-1) |
| Poor paragraph structure (fewer than 3 `<p>` over 50 chars, when over 200 words) | Split text into 3+ real `<p>` paragraphs (-0.5, floored to a full point) |
| Page has minimal content (under 50 words) | Score capped at 1; likely an empty shell or JS-only page |
| No `<main>` or `<article>` wrapper | Wrap the primary content so nav/footer text is not counted |

Page-type minimums (words): homepage 150, product 150, contact 50, about 200, general 200, legal 300, faq 300, blog listing 400, article 500. The type comes from the URL path (`/about`, `/blog/<slug>`, `/faq`...), then the title, then JSON-LD (`Article`, `Product`).

## Where to edit

| Stack | Where the content and wrapper live |
|---|---|
| static-html | the body of each flagged `.html` file |
| astro | page text in `src/pages/**` or `src/content/**`; the `<main>` wrapper in `src/layouts/*.astro` |
| hugo | Markdown in `content/**`; `<main>` in `layouts/_default/baseof.html` |
| eleventy | the page's Markdown/template; `<main>` in the `_includes/**` base layout |
| vite-spa | route components in `src/**`; `<main>` in the root App component |
| nextjs (assisted) | `app/**/page.tsx` or MDX; `<main>` in `app/layout.tsx` or the page |

For generated stacks, fix the source that produced the built page, never the build output.

## Steps

1. From `page-facts.mjs`, read each flagged page's `wordCount`, `urlPath`, `title`, `headings` and `firstParagraph` to confirm the page type and gap.
2. Auto part: if the layout has no `<main>` (and no `<article>`), wrap the page content slot in `<main>`, keeping header, nav and footer outside it. Warn the user this can lower the counted words, because boilerplate stops counting.
3. Auto part: if long text sits in `<div>`s or `<br>`-separated blocks, convert it into real `<p>` elements without changing the words.
4. Assisted part: for pages under the minimum, tell the user how many words are missing and suggest what to add (answers to likely questions, specifics, examples) based on the page's own headings. Claude may draft extra copy only from facts already in the repo, clearly marked as a draft for review.
5. If the page is under 50 words because content loads with JavaScript, point the user to `agent-readiness.server-rendered` instead of adding text.

## Rules

- Never invent facts (features, prices, numbers, names, credentials, dates, testimonials). New content comes from the user or from facts elsewhere in the repo, and needs the user's OK.
- Do not pad with filler or repeated keywords to hit a word count.
- Never edit build output (`dist/`, `public/` for Hugo, `_site/`, `out/`, `.next/`); edit the source.
- Keep changes minimal: structural wrappers and paragraph tags only, unless the user approves new copy.

## Verify

`node "${CLAUDE_PLUGIN_ROOT}/skills/audit/scripts/audit.mjs" --no-report --only content.quality`
